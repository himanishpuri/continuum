import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
process.env.DEMO_MODE = "false";
process.env.DEMO_DATA_DIR = ".demo-data-eval";
if (process.env.EVAL_GEMINI_API_KEY) process.env.GEMINI_API_KEY = process.env.EVAL_GEMINI_API_KEY;
for (const name of Object.keys(process.env)) if (name.startsWith("FIREBASE_")) delete process.env[name];
if (!process.env.GEMINI_API_KEY) process.stderr.write("Skipping live evals: GEMINI_API_KEY or EVAL_GEMINI_API_KEY is required.\n");
