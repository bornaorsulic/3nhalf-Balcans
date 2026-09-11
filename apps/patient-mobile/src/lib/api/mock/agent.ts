import { EMERGENCY_NUMBER } from "@/config/app";
import { formatShortDate } from "@/lib/dates";
import { checkForUrgentSymptoms } from "@/lib/safety";
import type { AgentReply, ChatTurn, DiaryEntry, LabResult, PatientProfile, Source, WearableSeries } from "../types";
import { genetics, research } from "./data";

/*
 * Scripted stand-in for the Nebius Health Agent. It answers from the demo patient's
 * real mock data, so the numbers match the rest of the app. It follows the same
 * rules the real agent must follow: cite sources, no diagnosis, no prescribing,
 * escalate red-flag symptoms, defer decisions to the clinician.
 */

export interface AgentContext {
  profile: PatientProfile;
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
  const hba1c = ctx.labs.find((l) => l.id === "lab-hba1c")!;
  const glucose = ctx.labs.find((l) => l.id === "lab-glucose")!;
  const vitd = ctx.labs.find((l) => l.id === "lab-vitd")!;
  const cutoff = days.at(-14)?.date ?? "";
  const recentDiary = ctx.diary.filter((e) => e.date >= cutoff);
  return {
    sleepBefore: avg(first.map((d) => d.sleepHours)),
    sleepNow: avg(last.map((d) => d.sleepHours)),
    hrvBefore: avg(first.map((d) => d.hrvMs)),
    hrvNow: avg(last.map((d) => d.hrvMs)),
    rhrBefore: avg(first.map((d) => d.restingHr)),
    rhrNow: avg(last.map((d) => d.restingHr)),
    hba1c,
    glucose,
    vitd,
    fatigueDays: recentDiary.filter((e) => e.symptoms.some((s) => s.name === "Fatigue")).length,
    diaryDays: recentDiary.length,
  };
}

function labSource(lab: LabResult): Source {
  const latest = lab.history.at(-1)!;
  return {
    id: `src-${lab.id}`,
    kind: "patient_data",
    title: `${lab.name} blood test`,
    detail: `${latest.value} ${lab.unit} on ${formatShortDate(latest.date)}`,
    date: latest.date,
  };
}

const wearableSource = (detail: string): Source => ({
  id: "src-wearable",
  kind: "patient_data",
  title: "Your wearable data",
  detail,
});

const diarySource = (detail: string): Source => ({ id: "src-diary", kind: "patient_data", title: "Your diary", detail });

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

  if (/(medication|medicine|metformin|dose|dosage|prescri|pill|supplement|should i take|ozempic|statin)/.test(t)) {
    return {
      content: `That's a good question — but whether you should start a medication or supplement, and at what dose, is a decision for **${clinicianName}**. It depends on things I can't safely weigh, like your full history and other medicines.\n\nWhat I can tell you: your vitamin D is low (${f.vitd.history.at(-1)!.value} ng/mL), and your clinician has already said they want to discuss it at your appointment. I've prepared this as a question for you.`,
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

  if (/(sugar|glucose|hba1c|a1c|diabet|prediabet|blood test|lab)/.test(t)) {
    const [a, b, c] = f.hba1c.history;
    return {
      content: `Here's what your blood tests show:\n\n- **HbA1c** (average blood sugar over 2–3 months): ${a.value} % → ${b.value} % → **${c.value} %** over the last year.\n- **Fasting glucose**: ${f.glucose.history.at(-1)!.value} mg/dL, slightly above the typical 70–99.\n\nAn HbA1c between 5.7 and 6.4 % is what guidelines call **prediabetes**. It's common, it is not diabetes, and it often improves. In a large study, lifestyle changes cut the chance of developing diabetes by more than half.\n\nYour sleep has also dropped over the same period, and short sleep can raise blood sugar by itself. ${clinicianName} has reviewed these results and will go through them with you.`,
      sources: [labSource(f.hba1c), labSource(f.glucose), research.adaDiagnosis, research.dpp, research.sleepDebt],
      confidence: "high",
      safety: { level: "none" },
      followUps: ["How is my sleep connected to this?", "What can I do before my appointment?"],
      questionForClinician: "When should we repeat my HbA1c test, and what result would we aim for?",
    };
  }

  if (/(sleep|tired|fatigue|exhaust|energy|insomnia|wake up|slump)/.test(t)) {
    return {
      content: `Your tiredness lines up with a few changes in your data:\n\n- **Sleep**: about ${fmt(f.sleepBefore)} h a night a month ago, **${fmt(f.sleepNow)} h** this past week.\n- **Diary**: you logged fatigue on ${f.fatigueDays} of your last ${f.diaryDays} entries.\n- **Vitamin D**: low at ${f.vitd.history.at(-1)!.value} ng/mL, which can add to tiredness.\n\nResearch shows that even a week of short sleep can make the body handle sugar less well — so better sleep may help both your energy and your blood sugar.\n\nSome things that often help: a fixed bedtime, no caffeine after 2pm (you logged late caffeine on several days), and a short walk after dinner. This isn't a diagnosis — ${clinicianName} will look at the full picture with you.`,
      sources: [
        wearableSource(`Sleep ${fmt(f.sleepBefore)} h → ${fmt(f.sleepNow)} h (weekly average)`),
        diarySource(`Fatigue on ${f.fatigueDays} of ${f.diaryDays} recent entries`),
        labSource(f.vitd),
        research.sleepDebt,
        research.vitaminD,
      ],
      confidence: "moderate",
      safety: { level: "none" },
      followUps: ["What is HRV and why did mine drop?", "How is my blood sugar doing?"],
      questionForClinician: "Could my sleep problems need their own assessment?",
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
      content: `Your vitamin D has gone from ${v[0].value} to **${v.at(-1)!.value} ng/mL** — below the usual 30–100 range. Low vitamin D is very common in Germany, especially after winter, and it can contribute to tiredness.\n\nWhether you should take a supplement, and how much, is something ${clinicianName} will decide with you — they've already flagged it for your appointment.`,
      sources: [labSource(f.vitd), research.vitaminD],
      confidence: "high",
      safety: { level: "none" },
      followUps: ["Why am I so tired?", "Help me prepare for my appointment"],
      questionForClinician: "Should I take vitamin D, and how much?",
    };
  }

  if (/(what can i do|in the meantime|lifestyle|improve|diet|exercise|walk|food|eat)/.test(t)) {
    return {
      content: `Based on your data and what your clinician already suggested, three changes are most likely to help:\n\n- **Sleep first**: a fixed bedtime that gives you 7+ hours, and no caffeine after 2pm.\n- **Move after meals**: a 20–30 minute walk after your largest meal helps your body use blood sugar.\n- **Keep logging**: your diary helps ${clinicianName} see what works for you.\n\nIn the Diabetes Prevention Program, people who became more active and lost a little weight were 58 % less likely to develop diabetes. Small, steady changes count.`,
      sources: [wearableSource(`Steps and sleep trends, last 30 days`), research.dpp, research.sleepDebt],
      confidence: "moderate",
      safety: { level: "none" },
      followUps: ["Why am I so tired?", "Help me prepare for my appointment"],
    };
  }

  if (/(appointment|doctor|visit|prepare|ask|question|clinician|hoffmann)/.test(t)) {
    const appt = ctx.profile.nextAppointment;
    return {
      content: `${appt ? `Your appointment with ${appt.clinician.name} is on **${formatShortDate(appt.startsAt)}**. ` : ""}Here are questions that fit your recent results:\n\n- Is my tiredness mainly from sleep, blood sugar or vitamin D?\n- When should we repeat my HbA1c, and what should we aim for?\n- Should I take vitamin D?\n- Would a sleep assessment make sense?\n\nTap **Add to my questions** below, or add your own in the Inbox. Bring your diary — it's already shared with your care team.`,
      sources: [labSource(f.hba1c), wearableSource(`Sleep ${fmt(f.sleepNow)} h this week`)],
      confidence: "high",
      safety: { level: "none" },
      followUps: ["What can I do before my appointment?", "Explain my blood sugar results"],
      questionForClinician: "Is my tiredness mainly from sleep, blood sugar or vitamin D?",
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
    content: `I'm not sure I can answer that well yet. I can help with:\n\n- Your **blood test results** (like HbA1c and vitamin D)\n- Your **sleep, heart rate and HRV** trends\n- Your **genetic test**\n- **Preparing for your appointment** with ${clinicianName}\n\nIf it's about a new or worrying symptom, please contact your practice — or call ${EMERGENCY_NUMBER} in an emergency.`,
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
