import { describe, expect, it } from "vitest";
import { summarizeReport } from "@/evals/compare";

describe("eval comparison", () => {
  it("summarizes pass, judge, safety, and degradation", () => {
    expect(summarizeReport({ prompt: "agent_decision@1#12345678", results: [
      { failures: [], judge: { mean: 4 }, degraded: false, safetyStop: false },
      { failures: ["missing safety stop"], judge: { mean: 2 }, degraded: true, safetyStop: true },
    ] })).toEqual({ prompt: "agent_decision@1#12345678", cases: 2, passRate: 0.5, judgeMean: 3, safetyStops: 1, degradedRate: 0.5 });
  });

  it("handles empty reports", () => {
    expect(summarizeReport({ prompt: null, results: [] })).toEqual({ prompt: null, cases: 0, passRate: null, judgeMean: null, safetyStops: 0, degradedRate: null });
  });
});
