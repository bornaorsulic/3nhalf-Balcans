"""AMASS BiomedCore adapter. Public evidence only; no raw patient queries."""
import hashlib
import json
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from urllib.parse import quote, urlsplit
import httpx
from backend.config import Settings

@dataclass
class EvidenceResult:
    items: list[dict]
    origin: str

TOPICS = {
    'sleep': (r'sleep|fatigue|tired|insomnia|energy', 'sleep duration metabolic health'),
    'glucose': (r'glucose|sugar|a1c|diabet|metabolic|diet|nutrition', 'glycemic risk lifestyle prevention'),
    'heart': (r'hrv|heart|recover|stress|wearable', 'heart rate variability sleep recovery'),
    'inflammation': (r'crp|inflam', 'C reactive protein cardiometabolic risk'),
    'genetics': (r'gene|genetic|dna|tcf7l2|fto', 'genetic susceptibility lifestyle diabetes prevention'),
    'vitamin': (r'vitamin|supplement', 'vitamin D evidence prevention'),
}

def research_query(question: str) -> str:
    # Only fixed public topic strings leave the server. Names, values, diary text,
    # and arbitrary clinician input are never submitted to the search provider.
    chosen = [query for pattern, query in TOPICS.values() if re.search(pattern, question, re.I)]
    return ' '.join(chosen[:2]) or 'sleep metabolic health lifestyle prevention'

def public_research_query(question: str) -> str:
    """Research-only chat may use the doctor's topic, but strips obvious identifiers."""
    chosen = [query for pattern, query in TOPICS.values() if re.search(pattern, question, re.I)]
    scrubbed = re.sub(r'\b[\w.+-]+@[\w.-]+\.\w+\b', ' ', question)
    scrubbed = re.sub(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b', ' ', scrubbed)
    scrubbed = re.sub(r'\b\d{2,}\b', ' ', scrubbed)
    terms = re.sub(r'[^a-zA-Z0-9\s-]', ' ', scrubbed).lower()
    words = [word for word in terms.split() if len(word) > 3]
    query = ' '.join([*chosen[:2], *words[:12]]).strip()
    return query[:180] or 'sleep metabolic health lifestyle prevention'

def safe_url(value) -> str | None:
    if not isinstance(value, str) or len(value) > 2000:
        return None
    try:
        parsed = urlsplit(value.strip())
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            return None
    except ValueError:
        return None
    return value.strip()

def normalize_record(record: dict) -> dict | None:
    if record.get('isRetracted') is True or record.get('isRetracted') == 'true':
        return None
    title = record.get('title')
    if not isinstance(title, str) or not title.strip():
        return None
    url = safe_url(record.get('url'))
    doi = record.get('doi')
    if not url and isinstance(doi, str):
        doi = re.sub(r'^https?://(?:dx\.)?doi\.org/', '', doi.strip())
        if re.fullmatch(r'10\.\d{4,9}/\S+', doi):
            url = 'https://doi.org/' + quote(doi, safe='/():;.-_')
    if not url and str(record.get('pmid', '')).isdigit():
        url = f"https://pubmed.ncbi.nlm.nih.gov/{record['pmid']}/"
    if not url:
        return None
    abstract = record.get('abstract') or record.get('detail') or ''
    # Unknown abstract shapes are not fabricated into evidence text.
    detail = abstract if isinstance(abstract, str) else ''
    return {'id': 'e-' + hashlib.sha256(url.encode()).hexdigest()[:16], 'title': title[:1000],
            'detail': detail[:5000], 'url': url, 'kind': 'research'}

class AmassClient:
    def __init__(self, settings: Settings, fallback, client: httpx.Client | None = None):
        self.settings, self.fallback, self.client = settings, fallback, client
        self.cache: OrderedDict[str, tuple[float, list[dict]]] = OrderedDict()
        self.lock = Lock()

    def search(self, query: str) -> EvidenceResult:
        with self.lock:
            cached = self.cache.get(query)
            if cached and cached[0] > time.monotonic():
                return EvidenceResult(cached[1], 'amass')
        base_url = self.settings.amass_base_url.rstrip('/')
        if self.settings.amass_api_key and urlsplit(base_url).scheme in ('http', 'https'):
            client = self.client or httpx.Client(follow_redirects=False)
            try:
                deadline = time.monotonic() + self.settings.research_timeout
                with client.stream('GET', base_url + '/cores/biomedcore/records',
                    headers={'Authorization': 'Bearer ' + self.settings.amass_api_key},
                    params={'query': query, 'limit': 5, 'isRetracted': 'false'},
                    timeout=self.settings.research_timeout) as response:
                    response.raise_for_status()
                    raw = bytearray()
                    for chunk in response.iter_bytes():
                        raw.extend(chunk)
                        if len(raw) > 256_000 or time.monotonic() > deadline:
                            raise ValueError('Evidence response too large')
                payload = json.loads(raw)
                data = payload['data']
                records = data if isinstance(data, list) else data['records']
                if not isinstance(records, list):
                    raise ValueError('Invalid records')
                items = self._normalize(records[:5])
                if items:
                    with self.lock:
                        self.cache[query] = (time.monotonic() + 900, items)
                        while len(self.cache) > 64:
                            self.cache.popitem(last=False)
                    return EvidenceResult(items, 'amass')
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                pass  # No response bodies, tokens, or patient text in logs.
            finally:
                if self.client is None:
                    client.close()
        items = self._normalize(self.fallback(query))
        return EvidenceResult(items, 'local' if items else 'none')

    @staticmethod
    def _normalize(records):
        unique = {}
        for record in records:
            item = normalize_record(record) if isinstance(record, dict) else None
            if item:
                unique.setdefault(item['url'], item)
        return list(unique.values())[:5]
