/** Deterministic safety guard; model prompts live in prompts/*.prompt. */

export const SAFETY_KEYWORDS = [
  "suicide",
  "kill myself",
  "self-harm",
  "self harm",
  "hurt myself",
  "hurting myself",
  "end my life",
  "want to die",
  "overdose",
  "harm someone",
  "harm others",
  "can't breathe",
  "cant breathe",
  "can not breathe",
  "chest pain",
  "medical emergency",
  "no reason to live",
  "don't want to be here",
  "dont want to be here",
  "better off without me",
  "better off dead",
  "unalive",
  "end it all",
  "ending it all",
  "take my own life",
];

export const SAFETY_RESPONSE =
  "I'm not able to help with something that sounds urgent or medical in nature — I'm a non-clinical wellbeing planning assistant, not equipped for emergencies. " +
  "If you or someone else may be in danger right now, please contact local emergency services immediately, or a crisis line such as 988 (Suicide & Crisis Lifeline) in the US. " +
  "If this isn't an emergency but you'd like medical guidance, please reach out to a qualified doctor or therapist. " +
  "I'm here to help again with routines, scheduling, and wellbeing planning whenever you're ready.";

export function containsSafetyTrigger(message: string): boolean {
  const normalized = message.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
  return SAFETY_KEYWORDS.some((kw) => {
    const phrase = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "'?");
    return new RegExp(`\\b${phrase}\\b`).test(normalized);
  });
}
