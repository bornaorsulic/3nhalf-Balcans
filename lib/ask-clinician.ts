/*
 * Handing an agent answer to the doctor thread.
 *
 * The text travels through sessionStorage rather than the URL: it quotes the
 * patient's own question and their results, and that does not belong in a
 * browser history entry, a server log, or a shared link.
 */

const KEY = "patient:ask-clinician";

export function stageQuestionForClinician(question: string, answer: string) {
  const plain = answer.replace(/\*\*/g, "").trim();
  const body = `I asked the Health Agent: "${question.trim()}"\n\nIt answered:\n${plain}\n\nCould you tell me what you think?`;
  try {
    sessionStorage.setItem(KEY, body);
  } catch {
    // Private mode, or storage is full: the thread simply opens empty.
  }
}

/** Reads the staged message once and clears it, so a reload does not re-fill the box. */
export function takeStagedQuestion(): string {
  try {
    const staged = sessionStorage.getItem(KEY);
    if (staged) sessionStorage.removeItem(KEY);
    return staged ?? "";
  } catch {
    return "";
  }
}
