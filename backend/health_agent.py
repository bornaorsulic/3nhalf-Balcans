"""Patient context -> research -> Nebius -> validated, grounded frontend JSON."""
import json
import logging
import re
import time
import uuid
from datetime import date, datetime, timezone
from pydantic import ValidationError
from backend import agent, retrieval
from backend.amass import AmassClient, EvidenceResult, public_research_query, research_query
from backend.config import Settings
from backend.contracts import ClinicianChatResponse, ModelAnswer, ModelDraft, ModelResearchAnswer, ResearchChatResponse
from backend.nebius import NebiusClient, ProviderFailure
from backend.prompts import build_messages, build_research_messages, observations

log = logging.getLogger(__name__)
SAFETY_NOTE = 'Decision support only. No diagnosis or prescribing. Clinician review required.'
RESEARCH_SAFETY_NOTE = 'Educational research support only. Not patient-specific advice, diagnosis, prescribing or dosing.'
MEDICATION_REQUEST = re.compile(r'\b(dose|dosage|prescribe|prescription|medication|metformin|statin|supplement)\b|should (?:I|the patient) take', re.I)
# These are conservative supplementary checks, not a semantic clinical verifier.
UNSAFE_OUTPUT = re.compile(
    r'https?://|www\.|\b10\.\d{4,9}/|'
    r'\b(?:take|start|increase|decrease|administer)\b[^.!?\n]{0,65}\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|IU|tablets?|capsules?)\b|'
    r'\b(?:you|the patient)\s+(?:have|has|will develop|are diagnosed with)\s+(?:diabetes|cancer|prediabetes|heart disease|hypertension)\b|'
    r'\b(?:start|stop|prescribe|increase|decrease)\s+(?:taking\s+)?(?:metformin|insulin|statins?|medication|supplements?)\b', re.I)

def now():
    return datetime.now(timezone.utc).isoformat()

def local_evidence(query):
    # Match individual public topic terms rather than a whole natural-language question.
    found = {}
    for term in dict.fromkeys(query.split()):
        if len(term) < 4:
            continue
        for item in retrieval.search_research(term, 5):
            found[item['id']] = item
        if len(found) >= 5:
            break
    return list(found.values())[:5]

def plain_observations(context):
    lines = []
    for obs in observations(context):
        if 'value' in obs:
            lines.append(f"{obs['label']}: {obs['value']:g} {obs['unit']} ({obs['date']}; recorded status: {obs['status']}).")
        else:
            change = f" ({obs['percentChange']:+d}%)" if obs['percentChange'] is not None else ''
            lines.append(f"{obs['label']}: {obs['before']:g} → {obs['now']:g} {obs['unit']}{change}, first versus latest seven recorded days.")
    return lines

# Models sometimes quote the internal evidence id in the prose ("as shown in
# e-1137a6759cb4f9f4"), which is meaningless to a reader. Swap it for the paper's
# title where we know it, and drop it otherwise.
EVIDENCE_ID = re.compile(r'[\(\[]?\b((?:e-[0-9a-f]{6,})|(?:res-[a-z0-9-]+))\b[\)\]]?', re.I)

def name_evidence_ids(text, evidence):
    if not isinstance(text, str) or not text:
        return text
    titles = {item['id']: item['title'] for item in evidence}

    def swap(match):
        title = titles.get(match.group(1))
        return f'"{title}"' if title else ''

    cleaned = EVIDENCE_ID.sub(swap, text)
    # Tidy what removal leaves behind: dangling connectives and doubled spacing.
    cleaned = re.sub(r'\b(?:in|from|of|by|see)\s*(?=[,.;:])', '', cleaned)
    cleaned = re.sub(r'\s+([,.;:])', r'\1', cleaned)
    cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned)
    return cleaned.strip()

def cited_sources(model, evidence):
    by_id = {item['id']: item for item in evidence}
    result, seen = [], set()
    for selection in model.citations:
        item = by_id.get(selection.id)
        if item and item['id'] not in seen:
            seen.add(item['id'])
            result.append({'id': item['id'], 'title': item['title'], 'source': 'Amass Research',
                           'relevance': selection.relevance, 'url': item['url']})
    return result

def retrieved_sources(evidence):
    """Expose retrieval results without claiming that generated text used them."""
    return [
        {
            'id': item['id'],
            'title': item['title'],
            'source': 'Amass Research',
            'relevance': 'Retrieved for clinician review; not cited by the generated synthesis.',
            'url': item['url'],
        }
        for item in evidence[:3]
    ]

class HealthAgent:
    def __init__(self, settings=None, research=None, model=None, context_loader=None):
        self.settings = settings or Settings.from_env()
        self.research = research or AmassClient(self.settings, local_evidence)
        self.model = model or NebiusClient(self.settings)
        self.context_loader = context_loader or retrieval.get_patient_context

    def _context(self, patient_id):
        context = self.context_loader(patient_id)
        if not context.get('patient'):
            raise LookupError('Patient not found')
        if 'research' not in context:
            context['research'] = retrieval.get_research()
        return context

    def _generate(self, messages, schema):
        """At most TWO provider requests total: transport OR validation retry."""
        if not self.model.configured:
            return None, 'nebius_not_configured'
        # One bounded wall-clock budget covers the initial call and an optional
        # validation repair. A transport timeout must not silently double the
        # browser wait time.
        deadline, reason = time.monotonic() + self.settings.model_timeout + 5, 'invalid_model_output'
        for _ in range(2):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                content = self.model.complete(messages, schema.model_json_schema(), timeout=remaining)
                value = schema.model_validate_json(content)
                if UNSAFE_OUTPUT.search(json.dumps(value.model_dump(), ensure_ascii=False)):
                    raise ValueError('Output violates content constraints')
                return value, None
            except ValidationError as exc:
                # Return only error locations/types, not rejected patient/model text.
                errors = [{'loc': err['loc'], 'type': err['type']} for err in exc.errors()]
                messages = [*messages, {'role': 'system', 'content': 'Previous response failed validation. Correct these schema errors: ' + json.dumps(errors)}]
                reason = 'invalid_model_output'
            except ValueError:
                messages = [*messages, {'role': 'system', 'content': 'Previous output violated safety rules. No URLs, diagnosis or medication/dosing instructions. Regenerate the JSON.'}]
                reason = 'unsafe_model_output'
            except ProviderFailure as exc:
                reason = exc.reason
                if not exc.retryable:
                    break
        log.info('health_agent_fallback reason=%s', reason)
        return None, reason

    def _fallback(self, question, context, audience):
        # Keep the original scripted agent connected. Use its appointment follow-ups;
        # render neutral recorded observations, not its demo-specific clinical claims.
        scripted = agent.answer('Help me prepare for my appointment', context)
        facts = plain_observations(context)
        intro = 'Recorded observations for clinician review:' if audience == 'clinician' else 'Here are observations in your records to discuss with your clinician:'
        text = intro + '\n\n' + ('\n'.join('- ' + fact for fact in facts) if facts else 'There are not enough measurements to summarize trends.')
        text += '\n\nThese observations do not establish a diagnosis or explain the cause of symptoms. Review timing, measurement conditions, symptoms, and missing information with the clinician.'
        if MEDICATION_REQUEST.search(question):
            text = 'Medication and supplement choices, including doses, require your clinician.\n\n' + text
        risks = []
        for index, obs in enumerate(observations(context)):
            if 'value' in obs and obs['status'] not in ('normal', 'optimal', 'unknown'):
                risks.append({'id': f'risk-{index}', 'title': obs['label'] + ' review signal', 'severity': 'medium',
                              'explanation': f"Recorded value: {obs['value']:g} {obs['unit']} on {obs['date']}; source status: {obs['status']}. This is not a diagnosis.",
                              'preventionStep': 'Review the result, its reference range and relevant history with the clinician.', 'sources': ['Bloodwork']})
        return ModelAnswer(answer=text, riskSignals=risks[:6], followUpQuestions=scripted['followUps'][:6], citations=[], confidence='low')

    def _research_fallback(self, question, evidence):
        if not evidence:
            return ModelResearchAnswer(
                answer=(
                    'I could not retrieve enough evidence for a grounded synthesis. Try narrowing the question to a '
                    'condition, mechanism, intervention, or outcome, such as sleep restriction and glucose tolerance.'
                ),
                keyTakeaways=['No matching public evidence was available from Amass or the local research table.'],
                studyNotes=['The safe fallback avoids making unsupported mechanistic or clinical claims.'],
                followUpQuestions=[
                    'Which population should I focus on?',
                    'Are you looking for mechanism, prognosis, or intervention evidence?',
                ],
                citations=[],
                confidence='low',
            )

        titles = [item['title'] for item in evidence[:3]]
        return ModelResearchAnswer(
            answer=(
                'AI synthesis is unavailable, so here are the retrieved studies to review directly:\n\n'
                + '\n'.join(f"- {title}" for title in titles)
            ),
            keyTakeaways=[
                'Evidence was retrieved, but the model synthesis step was unavailable.',
                'Open the linked sources before applying any point to clinical reasoning.',
            ],
            studyNotes=[
                'Check population, intervention or exposure, endpoint, and whether the paper supports causality or only association.',
                'Do not generalize study findings to a specific patient without clinical review.',
            ],
            followUpQuestions=[
                'What does the strongest study say about mechanism?',
                'Which outcomes were measured, and over what time window?',
            ],
            citations=[
                {'id': item['id'], 'relevance': item.get('detail') or 'Retrieved evidence for this research question.'}
                for item in evidence[:3]
            ],
            confidence='low',
        )

    def answer(self, patient_id, question, audience='clinician', history=None):
        context = self._context(patient_id)
        urgent = agent.check_urgent(question)
        if not urgent:
            for entry in context.get('diary', []):
                try:
                    age = (date.today() - date.fromisoformat(entry['date'])).days
                except (ValueError, KeyError, TypeError):
                    continue
                if not 0 <= age <= 1:
                    continue
                text = (entry.get('note') or '') + ' ' + ' '.join(s.get('name', '') for s in entry.get('symptoms', []))
                if agent.check_urgent(text):
                    urgent = 'A recent check-in contains a possible urgent symptom. If it is current: ' + agent.check_urgent(text)
                    break
        if urgent:
            return ClinicianChatResponse(id='ask-' + uuid.uuid4().hex[:10], patientId=patient_id, generatedAt=now(), answer=urgent,
                riskSignals=[], followUpQuestions=[], citations=[], confidence='low', safetyNote=urgent,
                draftSummary=None,
                generation={'mode': 'safety', 'evidence': 'none', 'reason': 'urgent_symptoms'}).model_dump()
        if MEDICATION_REQUEST.search(question):
            result, reason = self._fallback(question, context, audience), 'medication_boundary'
            evidence = EvidenceResult([], 'none')
            mode = 'safety'
        else:
            evidence = self.research.search(research_query(question))
            result, reason = self._generate(build_messages(question, context, evidence.items, audience, history), ModelAnswer)
            mode = 'nebius' if result else 'fallback'
            if result is None:
                result = self._fallback(question, context, audience)
        citations = cited_sources(result, evidence.items)
        if not citations and evidence.items:
            citations = retrieved_sources(evidence.items)
        # Identity, timestamps, safety notes and canonical citation metadata are server-owned.
        for index, risk in enumerate(result.riskSignals):
            risk.id = f'risk-{index + 1}'
        confidence = result.confidence if citations else 'low'
        answer = name_evidence_ids(result.answer, evidence.items)
        for risk in result.riskSignals:
            risk.explanation = name_evidence_ids(risk.explanation, evidence.items)
            risk.preventionStep = name_evidence_ids(risk.preventionStep, evidence.items)
        if mode == 'fallback':
            answer += '\n\nAI synthesis is unavailable; this is a limited summary of recorded data.'
        draft_summary = self._draft_summary_from_answer(result, citations)
        return ClinicianChatResponse(id='ask-' + uuid.uuid4().hex[:10], patientId=patient_id, generatedAt=now(), answer=answer,
            riskSignals=result.riskSignals, followUpQuestions=result.followUpQuestions, citations=citations,
            confidence=confidence, safetyNote=SAFETY_NOTE, draftSummary=draft_summary,
            generation={'mode': mode, 'evidence': evidence.origin, 'reason': reason}).model_dump()

    def research_answer(self, question, history=None):
        evidence = self.research.search(public_research_query(question))
        result, reason = self._generate(build_research_messages(question, evidence.items, history), ModelResearchAnswer)
        mode = 'nebius' if result else 'fallback'
        if result is None:
            result = self._research_fallback(question, evidence.items)

        citations = cited_sources(result, evidence.items)
        if not citations and evidence.items:
            citations = retrieved_sources(evidence.items)
        confidence = result.confidence if citations else 'low'
        answer = name_evidence_ids(result.answer, evidence.items)
        result.keyTakeaways = [name_evidence_ids(line, evidence.items) for line in result.keyTakeaways]
        result.studyNotes = [name_evidence_ids(line, evidence.items) for line in result.studyNotes]
        if mode == 'fallback':
            answer += '\n\nAI synthesis is unavailable; this is a limited research retrieval summary.'

        return ResearchChatResponse(
            id='research-' + uuid.uuid4().hex[:10],
            generatedAt=now(),
            answer=answer,
            keyTakeaways=result.keyTakeaways,
            studyNotes=result.studyNotes,
            followUpQuestions=result.followUpQuestions,
            citations=citations,
            confidence=confidence,
            safetyNote=RESEARCH_SAFETY_NOTE,
            generation={'mode': mode, 'evidence': evidence.origin, 'reason': reason},
        ).model_dump()

    def _draft_summary_from_answer(self, result, citations):
        """Patient-facing draft used by the new clinician Ask tab."""
        if not result.riskSignals:
            return None
        first = result.riskSignals[0]
        return {
            'title': 'Ahead of your appointment',
            'whatWeSee': first.explanation,
            'whatItMeans': (
                'These are observations and risk signals for clinician review, not a diagnosis. '
                'Your clinician can explain what they mean in context.'
            ),
            'nextSteps': [risk.preventionStep for risk in result.riskSignals[:4]],
            'questionsForVisit': result.followUpQuestions[:4],
            'sources': [
                {'id': c['id'], 'kind': 'research', 'title': c['title'], 'detail': c['relevance'], 'url': c['url']}
                for c in citations[:6]
            ],
        }

    def patient_answer(self, patient_id, question, history=None):
        response = self.answer(patient_id, question, 'patient', history)
        sources = [{'id': c['id'], 'kind': 'research', 'title': c['title'], 'detail': c['relevance'], 'url': c['url']} for c in response['citations']]
        urgent = response['generation']['reason'] == 'urgent_symptoms'
        return {'id': 'reply-' + uuid.uuid4().hex[:12], 'content': response['answer'], 'sources': sources,
                'confidence': response['confidence'], 'safety': {'level': 'urgent' if urgent else 'caution', 'message': response['safetyNote']},
                'followUps': response['followUpQuestions'], 'createdAt': response['generatedAt']}

    def summary(self, patient_id):
        response = self.answer(patient_id, 'Summarize the recorded observations, preventable risk signals and questions before the visit.')
        labels = list(dict.fromkeys(s for r in response['riskSignals'] for s in r['sources']))
        return {'patientId': patient_id, 'generatedAt': response['generatedAt'], 'headline': 'Prevention and visit preparation',
                'body': response['answer'], 'sourceLabels': labels, 'suggestedQuestions': response['followUpQuestions'],
                'safetyNote': response['safetyNote'], 'generation': response['generation']}

    def draft(self, patient_id):
        context = self._context(patient_id)
        evidence = self.research.search(research_query('sleep glucose recovery'))
        messages = build_messages('Draft a patient-facing summary for clinician review. The patient must not see it until approved.', context, evidence.items, 'patient summary draft')
        result, reason = self._generate(messages, ModelDraft)
        mode = 'nebius' if result else 'fallback'
        if result is None:
            result = ModelDraft(title='Your visit preparation', body={
                'whatWeSee': ' '.join(plain_observations(context)) or 'There are not enough recorded measurements for a summary.',
                'whatItMeans': 'These are observations, not a diagnosis. AI synthesis is unavailable. A clinician should review their meaning and the context of your symptoms.',
                'nextSteps': ['Review these observations with your clinician.', 'Continue recording symptoms and questions for your visit.'],
                'questionsForVisit': ['Which observations need follow-up?', 'What information is still missing?']}, citations=[])
        citations = cited_sources(result, evidence.items)
        if not citations and evidence.items:
            citations = retrieved_sources(evidence.items)
        body = result.body.model_dump()
        body['sources'] = [{'id': c['id'], 'kind': 'research', 'title': c['title'], 'detail': c['relevance'], 'url': c['url']} for c in citations]
        saved = retrieval.create_summary_draft(patient_id, result.title, body)
        return {**saved, 'generation': {'mode': mode, 'evidence': evidence.origin, 'reason': reason}}

    def record(self, patient_id):
        """Read-only clinician snapshot from the same PostgreSQL context as the agent."""
        from backend.prompts import patient_context
        context = self._context(patient_id)
        profile = context['patient']
        draft = self._fallback('visit', context, 'clinician')
        biomarkers = []
        for lab in context['labs']:
            if not lab.get('history'):
                continue
            value = lab['history'][-1]
            status = {'normal': 'optimal', 'borderline': 'borderline', 'high': 'elevated', 'low': 'low'}.get(lab.get('status'), 'borderline')
            biomarkers.append({'name': lab['name'], 'value': str(value['value']), 'unit': lab['unit'],
                               'status': status, 'source': 'Bloodwork', 'note': lab.get('referenceRange', {}).get('text', '')})
        wearables = []
        for obs in observations(context):
            if 'before' in obs:
                pct = obs['percentChange']
                wearables.append({'name': obs['label'], 'change': f'{pct:+d}%' if pct is not None else 'Unknown baseline',
                                  'period': 'First vs latest 7 recorded days',
                                  'status': ('declining' if ((obs['label'] == 'Resting heart rate' and pct > 3) or (obs['label'] != 'Resting heart rate' and pct < -3)) else 'stable') if pct is not None else 'stable', 'source': 'Wearable'})
        timeline = [{'id': e['id'], 'date': e['date'], 'type': 'diary', 'title': 'Patient check-in',
                     'summary': e.get('note') or ', '.join(s['name'] for s in e.get('symptoms', [])) or 'Check-in recorded', 'source': 'Diary'} for e in context['diary'][:30]]
        return {'patient': {'id': profile['id'], 'name': ' '.join([profile.get('firstName', ''), profile.get('lastName', '')]),
                            'age': patient_context(context)['age'] or 0, 'sex': profile.get('sex', 'unknown'),
                            'goal': '; '.join(profile.get('goals', [])), 'mainConcern': 'Review patient observations', 'status': 'needs_review'},
                'biomarkers': biomarkers, 'wearables': wearables, 'timeline': timeline,
                'summary': {'patientId': patient_id, 'generatedAt': now(), 'headline': 'Recorded observations', 'body': draft.answer,
                            'sourceLabels': list(dict.fromkeys(o['source'] for o in observations(context))),
                            'suggestedQuestions': draft.followUpQuestions, 'safetyNote': SAFETY_NOTE},
                'evidence': [], 'initialChat': [{'role': 'agent', 'content': 'Ask about this patient’s recorded observations or generate a summary for review.'}],
                'riskPrevention': [r.model_dump() for r in draft.riskSignals], 'tasks': [], 'notes': [], 'files': []}
