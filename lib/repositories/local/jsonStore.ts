/**
 * Local JSON-file persistence used when DEMO_MODE is on (or no Firebase
 * project is configured). This is real persistence, not an in-memory
 * fake: every collection is a JSON file under DEMO_DATA_DIR, one directory
 * per user, mirroring the Firestore layout (`users/{uid}/{collection}`) so
 * the two backends stay structurally interchangeable. A per-file promise
 * chain serializes reads/writes so concurrent requests in the single
 * Next.js dev process don't race and corrupt a file.
 */
import fs from "node:fs/promises";
import path from "node:path";

function dataDir() {
  return process.env.DEMO_DATA_DIR || ".demo-data";
}

function resolvePath(userId: string, segments: string[]) {
  return path.join(process.cwd(), dataDir(), userId, ...segments.slice(0, -1), `${segments[segments.length - 1]}.json`);
}

const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
  locks.set(
    key,
    run.catch(() => undefined)
  );
  return run;
}

export async function readCollection<T>(userId: string, segments: string[]): Promise<T[]> {
  const file = resolvePath(userId, segments);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T[];
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

export async function writeCollection<T>(userId: string, segments: string[], items: T[]): Promise<void> {
  const file = resolvePath(userId, segments);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(items, null, 2), "utf-8");
}

export async function mutateCollection<T>(
  userId: string,
  segments: string[],
  fn: (items: T[]) => T[] | Promise<T[]>
): Promise<T[]> {
  const key = `${userId}::${segments.join("/")}`;
  return withLock(key, async () => {
    const items = await readCollection<T>(userId, segments);
    const next = await fn(items);
    await writeCollection(userId, segments, next);
    return next;
  });
}

export async function readDoc<T>(userId: string, segments: string[]): Promise<T | null> {
  const file = resolvePath(userId, segments);
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function writeDoc<T>(userId: string, segments: string[], doc: T): Promise<void> {
  const file = resolvePath(userId, segments);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(doc, null, 2), "utf-8");
}

export async function listUserIds(): Promise<string[]> {
  // turbopackIgnore: this only ever lists DEMO_DATA_DIR (demo/local mode);
  // it must not pull the whole project into the server trace/output.
  const root = path.join(/* turbopackIgnore: true */ process.cwd(), dataDir());
  try {
    const entries = await fs.readdir(/* turbopackIgnore: true */ root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "ENOENT";
}
