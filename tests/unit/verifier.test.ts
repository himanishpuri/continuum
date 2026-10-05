import { describe, expect, it } from "vitest";
import { claimsCompletedChange } from "@/src/ai/agent/verifier";

describe("completed change claims", () => {
  it.each([
    "I have set up a daily plan for you",
    "I’ve updated your plan",
    "Your plan has been updated.",
  ])("detects %s", (text) => {
    expect(claimsCompletedChange(text)).toBe(true);
  });

  it.each([
    "I can set up a daily plan",
    "Would you like me to adjust your walks?",
    "Here's a plan you can approve.",
    "I have a suggestion",
  ])("does not detect %s", (text) => {
    expect(claimsCompletedChange(text)).toBe(false);
  });
});
