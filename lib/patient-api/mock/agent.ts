import { EMERGENCY_NUMBER } from "@/lib/app-config";
import { genetics, research } from "@/lib/demo/data";
import { formatShortDate } from "@/lib/dates";
import { checkForUrgentSymptoms } from "@/lib/safety";
import type { AgentReply, ChatTurn, DiaryEntry, LabResult, PatientAppProfile, Source, WearableSeries } from "../types";

/*
 * Scripted stand-in for the Nebius Health Agent (patient mode). It answers from
 * the shared demo data, so the numbers match the rest of the app and the
 * clinician dashboard. It follows the same rules the real agent must follow:
 * cite sources, no diagnosis, no prescribing, escalate red-flag symptoms, defer
 * decisions to the clinician.
 */

export interface AgentContext {
  profile: PatientAppProfile;
  labs: LabResult[];
  wearables: WearableSeries;
  diary: DiaryEntry[];
}

type Draft = Omit<AgentReply, "id" | "createdAt">;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const fmt = (n: number, digits = 1) => n.toFixed(digits);

function facts(ctx: AgentContext) {
  const days = ctx.wearables.days;
  const first = days.slice(0, 7);
  const last = days.slice(-7);
  const lab = (id: string) => ctx.labs.find((l) => l.id === id)!;
  const cutoff = days.at(-14)?.date ?? "";
  const recentDiary = ctx.diary.filter((e) => e.date >= cutoff);
  return {
    sleepBefore: avg(first.map((d) => d.sleepHours)),
    sleepNow: avg(last.map((d) => d.sleepHours)),
    hrvBefore: avg(first.map((d) => d.hrvMs)),
    hrvNow: avg(last.map((d) => d.hrvMs)),
    rhrBefore: avg(first.map((d) => d.restingHr)),
    rhrNow: avg(last.map((d) => d.restingHr)),
    glucose: lab("lab-glucose"),
    crp: lab("lab-crp"),
    vitd: lab("lab-vitd"),
    fatigueDays: recentDiary.filter((e) => e.symptoms.some((s) => s.name === "Fatigue")).length,
    afternoonDays: recentDiary.filter((e) => /lunch|afternoon/i.test(e.note)).length,
    diaryDays: recentDiary.length,
  };
}

const latest = (lab: LabResult) => lab.history.at(-1)!.value;

function labSource(lab: LabResult): Source {
  const last = lab.history.at(-1)!;
  return {
    id: `src-${lab.id}`,
    kind: "patient_data",
    title: `${lab.name} blood test`,
    detail: `${last.value} ${lab.unit} on ${formatShortDate(last.date)}`,
    date: last.date,
  };
}

const wearableSource = (detail: string): Source => ({
  id: "src-wearable",
  kind: "patient_data",
  title: "Your wearable data",
  detail,
});

const diarySource = (detail: string): Source => ({ id: "src-diary", kind: "patient_data", title: "Your check-ins", detail });

function respondTo(text: string, ctx: AgentContext): Draft {
  const t = text.toLowerCase();
  const f = facts(ctx);
  const clinicianName = ctx.profile.clinician.name;

  const urgent = checkForUrgentSymptoms(text);
  if (urgent) {
    return {
      content: `I'm not able to assess emergencies. If you're unsure, calling **${EMERGENCY_NUMBER}** is always the right choice. Once you're safe, I'll let ${clinicianName} know what happened.`,
      sources: [],
      confidence: "high",
      safety: { level: "urgent", message: urgent.message },
      followUps: [],
    };
  }

  if (/(medication|medicine|metformin|dose|dosage|prescri|pill|supplement|should i take|statin|ibuprofen)/.test(t)) {
    return {
      content: `That's a good question — but whether you should start a medication or supplement, and at what dose, is a decision for **${clinicianName}**. It depends on things I can't safely weigh, like your full history and other medicines.\n\nWhat I can tell you: your vitamin D is low (${latest(f.vitd)} ng/mL), and it's one of the things your care team wants to discuss at your appointment. I've prepared this as a question for you.`,
      sources: [labSource(f.vitd), { id: "src-policy", kind: "clinician", title: "Care team rule", detail: "Medication decisions are made by your clinician" }],
      confidence: "high",
      safety: { level: "caution", message: "I can't recommend medications or doses." },
      followUps: ["What can I do myself in the meantime?", "Why is my vitamin D low?"],
      questionForClinician: "Should I take a medication or supplement (e.g. vitamin D), and at what dose?",
    };
  }

  if (/(gene|genetic|dna|tcf7l2|fto|apoe|inherit)/.test(t)) {
    const tcf = genetics[0];
    return {
      content: `Your genetic test found a few things worth knowing:\n\n- **${tcf.gene} (${tcf.genotype})**: ${tcf.finding.toLowerCase()}.\n- **FTO (A/T)**: a slightly higher tendency to gain weight.\n- **APOE (ε3/ε3)**: the most common type, typical risk.\n\nGenes are **not destiny**. For type 2 diabetes, sleep, activity and diet have a much bigger effect than any of these variants — which is good news, because those are things you can change.`,
      sources: [
        { id: "src-genetics", kind: "patient_data", title: "Your genetic test", detail: "3 findings reported" },
        research.tcf7l2,
        research.dpp,
      ],
      confidence: "moderate",
      safety: { level: "none" },
      followUps: ["How does this connect to my blood sugar?", "What lifestyle changes help most?"],
      questionForClinician: "Does my TCF7L2 result change how often my blood sugar should be checked?",
    };
  }

  if (/(crp|inflam|achy|aches|joint)/.test(t)) {
    const [a, b, c] = f.crp.history;
    return {
      content: `**hs-CRP** is a marker of low-level inflammation in the body. Yours went ${a.value} → ${b.value} → **${c.value} mg/L** over the past year — just above the usual range of below 3.\n\nIt isn't specific: it can rise with short sleep, stress, a recent cold, or other inflammation. That's why ${clinicianName} will look at it together with your sleep and how you've been feeling, and may simply repeat it later. On its own it is not a diagnosis.`,
      sources: [labSource(f.crp), wearableSource(`Sleep ${fmt(f.sleepBefore)} h → ${fmt(f.sleepNow)} h (weekly average)`), research.sleepDebt],
      confidence: "moderate",
      safety: { level: "none" },
      followUps: ["Why am I so tired?", "Explain my blood sugar results"],
      questionForClinician: "Could my sleep or stress explain the higher inflammation marker?",
    };
  }

  if (/(sugar|glucose|a1c|diabet|prediabet|blood test|lab|result)/.test(t)) {
    const [a, b, c] = f.glucose.history;
    return {
      content: `Here's what your latest blood test shows:\n\n- **Fasting glucose**: ${a.value} → ${b.value} → **${c.value} mg/dL** over the past year. The typical range is 70–99.\n- **hs-CRP** (inflammation): ${latest(f.crp)} mg/L, just above the usual range.\n- **Vitamin D**: ${latest(f.vitd)} ng/mL, which is low.\n\nA fasting glucose between 100 and 125 is what guidelines call the **prediabetes range**. It's common, it is not diabetes, and it often improves — in a large study, lifestyle changes cut the chance of developing diabetes by more than half.\n\nYour sleep has also dropped recently, and short sleep can raise blood sugar by itself. ${clinicianName} is reviewing these results and will go through them with you.`,
      sources: [labSource(f.glucose), labSource(f.crp), labSource(f.vitd), research.adaDiagnosis, research.dpp, research.sleepDebt],
      confidence: "high",
      safety: { level: "none" },
      followUps: ["How is my sleep connected to this?", "What does hs-CRP mean?"],
      questionForClinician: "Should I repeat my blood sugar test, and add HbA1c?",
    };
  }

  if (/(sleep|tired|fatigue|exhaust|energy|insomnia|wake up|slump|afternoon)/.test(t)) {
    return {
      content: `Your tiredness lines up with a few changes in your data:\n\n- **Sleep**: about ${fmt(f.sleepBefore)} h a night a month ago, **${fmt(f.sleepNow)} h** this past week.\n- **Check-ins**: you logged fatigue on ${f.fatigueDays} of your last ${f.diaryDays} entries, often **after lunch**.\n- **Vitamin D**: low at ${latest(f.vitd)} ng/mL, which can add to tiredness.\n- **Fasting glucose**: slightly raised at ${latest(f.glucose)} mg/dL.\n\nResearch shows that even a week of short sleep can make the body handle sugar less well — so better sleep may help both your energy and your blood sugar.\n\nThings that often help: a fixed bedtime, no caffeine after 2pm, and a short walk after lunch. This isn't a diagnosis — ${clinicianName} will look at the full picture with you.`,
      sources: [
        wearableSource(`Sleep ${fmt(f.sleepBefore)} h → ${fmt(f.sleepNow)} h (weekly average)`),
        diarySource(`Fatigue on ${f.fatigueDays} of ${f.diaryDays} recent check-ins`),
        labSource(f.vitd),
        labSource(f.glucose),
        research.sleepDebt,
        research.vitaminD,
      ],
      confidence: "moderate",
      safety: { level: "none" },
      followUps: ["What is HRV and why did mine drop?", "Explain my blood sugar results"],
      questionForClinician: "Why am I so tired in the afternoons?",
    };
  }

  if (/(hrv|heart rate|variability|resting|pulse|stress|recover|wearable|ring|watch)/.test(t)) {
    return {
      content: `**Heart rate variability (HRV)** is the small variation in time between heartbeats. Higher usually means your body is well rested and recovering; it tends to drop with short sleep, stress or illness.\n\n- **HRV**: about ${fmt(f.hrvBefore, 0)} ms a month ago → **${fmt(f.hrvNow, 0)} ms** this week.\n- **Resting heart rate**: ${fmt(f.rhrBefore, 0)} → **${fmt(f.rhrNow, 0)} bpm**.\n\nTogether with your shorter sleep, this suggests your body has been under more strain lately. HRV varies a lot between people, so the trend matters more than a single number.`,
      sources: [wearableSource(`HRV ${fmt(f.hrvBefore, 0)} → ${fmt(f.hrvNow, 0)} ms, resting HR ${fmt(f.rhrBefore, 0)} → ${fmt(f.rhrNow, 0)} bpm`), research.hrv],
      confidence: "moderate",
      safety: { level: "none" },
      followUps: ["Why am I so tired?", "What can I do before my appointment?"],
    };
  }

  if (/(vitamin d|sun)/.test(t)) {
    const v = f.vitd.history;
    return {
      content: `Your vitamin D has gone from ${v[0].value} to **${v.at(-1)!.value} ng/mL** — below the usual 30–100 range. Low vitamin D is very common, especially after winter, and it can contribute to tiredness.\n\nWhether you should take a supplement, and how much, is something ${clinicianName} will decide with you at your appointment.`,
      sources: [labSource(f.vitd), research.vitaminD],
      confidence: "high",
      safety: { level: "none" },
      followUps: ["Why am I so tired?", "Help me prepare for my appointment"],
      questionForClinician: "Should I take vitamin D, and how much?",
    };
  }

  if (/(what can i do|in the meantime|lifestyle|improve|diet|exercise|walk|food|eat)/.test(t)) {
    return {
      content: `Based on your data, three changes are most likely to help:\n\n- **Sleep first**: a fixed bedtime that gives you 7+ hours, and no caffeine after 2pm.\n- **Move after meals**: a 20–30 minute walk after lunch helps your body use blood sugar — and may ease the afternoon dip.\n- **Keep checking in**: your check-ins help ${clinicianName} see what works for you.\n\nIn the Diabetes Prevention Program, people who became more active and lost a little weight were 58 % less likely to develop diabetes. Small, steady changes count.`,
      sources: [wearableSource("Steps and sleep trends, last 30 days"), research.dpp, research.sleepDebt],
      confidence: "moderate",
      safety: { level: "none" },
      followUps: ["Why am I so tired?", "Help me prepare for my appointment"],
    };
  }

  if (/(appointment|doctor|visit|prepare|ask|question|clinician|eriksson)/.test(t)) {
    const appt = ctx.profile.nextAppointment;
    return {
      content: `${appt ? `Your appointment with ${appt.clinician.name} is on **${formatShortDate(appt.startsAt)}**. ` : ""}Here are questions that fit your recent results:\n\n- Why am I so tired in the afternoons?\n- Should I repeat my blood sugar test, and add HbA1c?\n- Could my sleep or stress explain the higher inflammation marker?\n- Should I take vitamin D?\n\nTap **Add to my questions** below, or add your own in the Inbox. Your check-ins are already shared with your care team.`,
      sources: [labSource(f.glucose), labSource(f.crp), wearableSource(`Sleep ${fmt(f.sleepNow)} h this week`)],
      confidence: "high",
      safety: { level: "none" },
      followUps: ["What can I do before my appointment?", "Explain my blood sugar results"],
      questionForClinician: "Should I repeat my blood sugar test, and add HbA1c?",
    };
  }

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) {
    return {
      content: `Hi ${ctx.profile.firstName}! I can explain your results, your sleep and heart data, or help you prepare for your appointment. What would you like to know?`,
      sources: [],
      confidence: "high",
      safety: { level: "none" },
      followUps: ["Why am I so tired?", "Explain my blood sugar results", "Help me prepare for my appointment"],
    };
  }

  return {
    content: `I'm not sure I can answer that well yet. I can help with:\n\n- Your **blood test results** (glucose, hs-CRP, vitamin D)\n- Your **sleep, heart rate and HRV** trends\n- Your **genetic test**\n- **Preparing for your appointment** with ${clinicianName}\n\nIf it's about a new or worrying symptom, please contact your practice — or call ${EMERGENCY_NUMBER} in an emergency.`,
    sources: [],
    confidence: "low",
    safety: { level: "none" },
    followUps: ["Why am I so tired?", "Explain my blood sugar results", "What do my genes say?"],
  };
}

export function mockAgentReply(messages: ChatTurn[], ctx: AgentContext): AgentReply {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  return {
    id: `reply-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...respondTo(lastUser, ctx),
  };
}
