import { z } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { ai } from "@/src/ai/genkit";

const Scores = z.object({
  reflection: z.number().int().min(1).max(5),
  autonomySupport: z.number().int().min(1).max(5),
  noRightingReflex: z.number().int().min(1).max(5),
  evidenceGrounding: z.number().int().min(1).max(5),
});

export async function judgeReply(message: string, reply: string, evidence: string) {
  const model = googleAI.model(process.env.GEMINI_FALLBACK_MODELS?.split(",")[0]?.trim() || "gemini-flash-lite-latest");
  const response = await ai.generate({
    model,
    prompt: `Score this wellbeing-coaching reply using a MITI-inspired rubric. Score each dimension 1 (poor) to 5 (strong): reflection of the user's statement, autonomy support, absence of the righting reflex, and grounding in supplied evidence. Do not reward invented evidence.\nUser: ${message}\nEvidence: ${evidence}\nReply: ${reply}`,
    output: { schema: Scores },
  });
  if (!response.output) throw new Error("Judge returned no scores.");
  const scores = Scores.parse(response.output);
  const mean = Object.values(scores).reduce((total, value) => total + value, 0) / 4;
  return { scores, mean };
}
