import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface EvalReport {
  prompt: string | null;
  results: { failures: string[]; judge: { mean: number } | null; degraded: boolean | null; safetyStop?: boolean | null }[];
}

export function summarizeReport(report: EvalReport) {
  const cases = report.results.length;
  const judged = report.results.flatMap((result) => result.judge ? [result.judge.mean] : []);
  return {
    prompt: report.prompt,
    cases,
    passRate: cases ? report.results.filter((result) => !result.failures.length).length / cases : null,
    judgeMean: judged.length ? judged.reduce((sum, value) => sum + value, 0) / judged.length : null,
    safetyStops: report.results.filter((result) => result.safetyStop).length,
    degradedRate: cases ? report.results.filter((result) => result.degraded).length / cases : null,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const files = process.argv.slice(2);
  if (files.length !== 2) throw new Error("Usage: npm run eval:compare -- a.json b.json");
  const reports = files.map((file) => summarizeReport(JSON.parse(readFileSync(file, "utf8")) as EvalReport));
  console.table(reports.map((report, index) => ({ file: files[index], ...report })));
}
