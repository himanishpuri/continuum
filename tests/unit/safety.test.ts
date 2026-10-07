import { describe, expect, it } from "vitest";
import { containsSafetyTrigger, SAFETY_KEYWORDS } from "@/src/ai/agent/prompts";

describe("safety keyword detection", () => {
  it.each([
    "I want to die",
    "I don’t want to be here anymore",
    "cant breathe",
    "thinking about ending it all",
    "UNALIVE",
    "I can not breathe",
    "I CAN‘T   BREATHE",
  ])("detects %s", (message) => {
    expect(containsSafetyTrigger(message)).toBe(true);
  });

  it.each(SAFETY_KEYWORDS)("detects configured phrase %s", (phrase) => {
    expect(containsSafetyTrigger(`I said ${phrase} today`)).toBe(true);
  });

  it.each([
    "I'm killing it at the gym",
    "this workout is killer",
    "my skills are improving",
    "I died laughing",
    "I want to diet better",
    "My chest pains have improved",
    "Honestly I don't see the point of carrying on anymore.",
  ])("does not detect %s", (message) => {
    expect(containsSafetyTrigger(message)).toBe(false);
  });
});
