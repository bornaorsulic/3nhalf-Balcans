import { EMERGENCY_NUMBER } from "@/lib/app-config";

/*
 * Client-side red-flag check. This is a second safety net, not the primary one:
 * the backend agent must do its own triage. It runs on chat messages and diary
 * notes so an urgent warning shows immediately, even if the backend is down.
 */

const URGENT_PATTERNS: RegExp[] = [
  /chest (pain|pressure|tightness)/i,
  /(can'?t|cannot|hard to|struggling to) breathe/i,
  /short(ness)? of breath/i,
  /(fainted|passed out|blacked out|losing consciousness)/i,
  /(face|arm|leg).{0,20}(numb|droop|weak)/i,
  /slurred speech/i,
  /(worst|sudden|severe) headache/i,
  /(vomiting|coughing) blood/i,
  /(suicid|kill myself|end my life|self[- ]harm)/i,
  /(severe|heavy) bleeding/i,
  /confus(ed|ion) and (fever|stiff neck)/i,
];

export interface UrgentMatch {
  urgent: true;
  message: string;
}

export function checkForUrgentSymptoms(text: string): UrgentMatch | null {
  if (!URGENT_PATTERNS.some((p) => p.test(text))) return null;
  const mentalHealth = /(suicid|kill myself|end my life|self[- ]harm)/i.test(text);
  return {
    urgent: true,
    message: mentalHealth
      ? `You deserve support right now. Please call ${EMERGENCY_NUMBER} or a crisis line, or reach out to someone you trust. You don't have to handle this alone.`
      : `What you describe can be a sign of something urgent. Please call ${EMERGENCY_NUMBER} or go to the nearest emergency department now — don't wait for your appointment.`,
  };
}
