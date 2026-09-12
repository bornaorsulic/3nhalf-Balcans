"""OpenAI-compatible Nebius inference; retries are owned by the orchestrator."""
import json
import re
import time
from urllib.parse import urlsplit
import httpx
from backend.config import Settings

class ProviderFailure(Exception):
    def __init__(self, reason: str, retryable: bool = False):
        super().__init__(reason)
        self.reason, self.retryable = reason, retryable

class NebiusClient:
    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.settings = settings
        self.client = client

    @property
    def configured(self):
        return bool(self.settings.nebius_api_key and self.settings.nebius_model)

    def complete(self, messages: list[dict], schema: dict, timeout: float | None = None) -> str:
        if not self.configured:
            raise ProviderFailure('nebius_not_configured')
        base = self.settings.nebius_base_url.rstrip('/')
        if urlsplit(base).scheme not in ('http', 'https'):
            raise ProviderFailure('invalid_nebius_url')
        # Small self-hosted models often echo a full JSON schema instead of
        # producing the requested object. Keep the model-facing contract compact;
        # Pydantic still owns strict validation after the response comes back.
        contract = output_contract(schema)
        payload = {
            'model': self.settings.nebius_model,
            'messages': [*messages, {'role': 'system', 'content': contract}],
            'temperature': 0.1,
            'max_tokens': self.settings.max_tokens,
        }
        duration = min(timeout or self.settings.model_timeout, self.settings.model_timeout)
        client = self.client or httpx.Client(follow_redirects=False)
        try:
            deadline = time.monotonic() + duration
            with client.stream('POST', base + '/chat/completions', headers={
                'Authorization': 'Bearer ' + self.settings.nebius_api_key,
                'Content-Type': 'application/json',
            }, json=payload, timeout=httpx.Timeout(duration, connect=min(5, duration))) as response:
                if response.status_code >= 400:
                    raise ProviderFailure('nebius_http_' + str(response.status_code), response.status_code in (408, 429) or response.status_code >= 500)
                if response.status_code != 200:
                    raise ProviderFailure('unexpected_nebius_response')
                raw = bytearray()
                for chunk in response.iter_bytes():
                    raw.extend(chunk)
                    if len(raw) > 256_000 or time.monotonic() > deadline:
                        raise ProviderFailure('nebius_response_limit', True)
            result = json.loads(raw)
            choice = result['choices'][0]
            content = choice['message'].get('content')
            if choice.get('finish_reason') != 'stop' or choice['message'].get('refusal') or not isinstance(content, str):
                raise ProviderFailure('nebius_incomplete_output', True)
            return extract_json_object(content)
        except (httpx.TimeoutException, httpx.TransportError):
            raise ProviderFailure('nebius_unavailable', True) from None
        except (KeyError, IndexError, TypeError, ValueError):
            raise ProviderFailure('invalid_nebius_response', True) from None
        finally:
            if self.client is None:
                client.close()

def extract_json_object(content: str) -> str:
    cleaned = re.sub(r'<think>.*?</think>', '', content, flags=re.S).strip()
    if not cleaned:
        raise ValueError('empty_model_content')
    try:
        json.loads(cleaned)
        return cleaned
    except ValueError:
        pass

    decoder = json.JSONDecoder()
    for index, char in enumerate(cleaned):
        if char != '{':
            continue
        try:
            _, end = decoder.raw_decode(cleaned[index:])
            return cleaned[index:index + end]
        except ValueError:
            continue
    raise ValueError('no_json_object')

def output_contract(schema: dict) -> str:
    title = schema.get('title')
    if title == 'ModelDraft':
        return '''/no_think
Return exactly one JSON object for a patient-facing draft. Do not return a schema, "$defs", "properties", markdown, or prose outside JSON.
Required shape:
{
  "title": "short title",
  "body": {
    "whatWeSee": "plain-language observations only",
    "whatItMeans": "uncertain meaning, no diagnosis",
    "nextSteps": ["clinician-reviewed step"],
    "questionsForVisit": ["question for visit"]
  },
  "citations": [{"id": "one RETRIEVED_EVIDENCE id", "relevance": "why this evidence matters"}]
}
Use only citation ids that appear in RETRIEVED_EVIDENCE. If evidence is weak, use an empty citations array.'''

    if title == 'ModelResearchAnswer':
        return '''/no_think
Return exactly one JSON object for a clinician research chat. Do not return a schema, "$defs", "properties", markdown, or prose outside JSON.
Required shape:
{
  "answer": "educational synthesis for a clinician, based only on supplied research evidence",
  "keyTakeaways": ["clinically relevant learning point"],
  "studyNotes": ["mechanism, population, limitation, or causality note"],
  "followUpQuestions": ["next research question to ask"],
  "citations": [{"id": "one RETRIEVED_EVIDENCE id", "relevance": "what this evidence supports"}],
  "confidence": "low|moderate|high"
}
Use only citation ids that appear in RETRIEVED_EVIDENCE. If evidence is weak, use an empty citations array and say what is missing.'''

    return '''/no_think
Return exactly one JSON object for the clinician. Do not return a schema, "$defs", "properties", markdown, or prose outside JSON.
Required shape:
{
  "answer": "clinical decision-support synthesis using only recorded observations and supplied evidence",
  "riskSignals": [
    {
      "id": "temporary-id",
      "title": "short risk signal",
      "severity": "high|medium|low",
      "explanation": "observation-based explanation, no diagnosis",
      "preventionStep": "clinician-reviewable prevention or follow-up step",
      "sources": ["Bloodwork", "Wearable", "Diary", "Genetic test", "Amass Research"]
    }
  ],
  "followUpQuestions": ["question worth asking the patient"],
  "citations": [{"id": "one RETRIEVED_EVIDENCE id", "relevance": "what the evidence supports"}],
  "confidence": "low|moderate|high"
}
Use only citation ids that appear in RETRIEVED_EVIDENCE. If evidence is weak, use an empty citations array.'''
