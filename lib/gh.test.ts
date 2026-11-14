// The GitHub client's own tests: what each call sends, what it returns,
// the rate-limit headers, the lazy-load tuple and the STALE semantics —
// all against a fake `fetch`, so nothing reaches the network.
//
// Runs three ways: `nsh test app/lib/gh.test.ts` (nsh CLI, headless), or
// `node --experimental-strip-types app/lib/gh.test.ts` (a tiny runner
// below, used until the CLI is built), or `tsc` type checking.
import {
  GhError,
  createGhClient,
  isPullFile,
  isPullListItem,
  probeHit,
  statusOf,
  tupleOf,
  tupleOfRecord,
} from "./gh.ts";
import type { FetchLike, PrRecord, Review } from "./gh.ts";

// --- The fake fetch ---

interface FakeReply {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

const LIST_URL =
  "https://api.github.com/repos/octo/hello/pulls?state=all&per_page=100&sort=updated&direction=desc";
const FILES_URL = "https://api.github.com/repos/octo/hello/pulls/7/files?per_page=100";
const DIFF_URL = "https://api.github.com/repos/octo/hello/pulls/7/diff";

function fakeFetch(routes: Record<string, FakeReply>, log: { method: string; url: string; headers: Record<string, string> }[] = []): FetchLike {
  return async (input, init) => {
    const headers = init?.headers ?? {};
    log.push({ method: init?.method ?? "GET", url: input, headers });
    const route = routes[input];
    if (route === undefined) return { ok: false, status: 404, headers: {}, text: async () => "" };
    return {
      ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
      status: route.status ?? 200,
      headers: route.headers ?? {},
      text: async () => route.body ?? "",
    };
  };
}

function listItem(n: number, over: Partial<{
  state: string;
  merged_at: string | null;
  updated_at: string;
  sha: string;
}> = {}) {
  return {
    number: n,
    title: `PR ${n}`,
    user: { login: `author-${n}` },
    state: over.state ?? "open",
    merged_at: over.merged_at ?? null,
    updated_at: over.updated_at ?? "2026-11-01T10:00:00Z",
    head: { sha: over.sha ?? `sha-${n}` },
    additions: 10 * n,
    deletions: 2 * n,
    changed_files: n,
  };
}

// --- The runner (when not under `nsh test`) ---

let passed = 0;
const failures: string[] = [];
const checks: Promise<unknown>[] = [];

function test(name: string, body: () => Promise<void> | void) {
  const outcome = (async () => {
    try {
      await body();
      passed++;
      console.log(`ok - ${name}`);
    } catch (e) {
      failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`FAIL - ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();
  checks.push(outcome);
}

function expect(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(value);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`expected ${b}, got ${a}`);
    },
    toBeTrue() {
      if (value !== true) throw new Error(`expected true, got ${JSON.stringify(value)}`);
    },
    toBeFalse() {
      if (value !== false) throw new Error(`expected false, got ${JSON.stringify(value)}`);
    },
    async toThrow(check?: (e: unknown) => boolean) {
      if (typeof value !== "function") throw new Error("toThrow expects a function");
      try {
        await (value as () => unknown)();
      } catch (e) {
        if (check && !check(e)) throw new Error(`threw the wrong thing: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      throw new Error("expected the function to throw");
    },
  };
}

// --- T5-shaped: auth headers and default Accept ---

test("sends the default Accept header, anonymous without a token", async () => {
  const log: { method: string; url: string; headers: Record<string, string> }[] = [];
  const client = createGhClient({ fetchImpl: fakeFetch({ [LIST_URL]: { body: "[]" } }, log) });
  await client.listPulls("octo", "hello");
  expect(log.length).toBe(1);
  expect(log[0].url).toBe(LIST_URL);
  expect(log[0].method).toBe("GET");
  expect(log[0].headers["Accept"]).toBe("application/vnd.github+json");
  expect("Authorization" in log[0].headers).toBeFalse();
  expect(client.requests()[0].authorized).toBeFalse();
});

test("sends Authorization: Bearer with the token", async () => {
  const log: { method: string; url: string; headers: Record<string, string> }[] = [];
  const client = createGhClient({ token: "tok-1", fetchImpl: fakeFetch({ [LIST_URL]: { body: "[]" } }, log) });
  await client.listPulls("octo", "hello");
  expect(log[0].headers["Authorization"]).toBe("Bearer tok-1");
  expect(client.requests()[0].authorized).toBeTrue();
});

// --- Rate-limit headers ---

test("reads x-ratelimit-* headers of the last response", async () => {
  const client = createGhClient({
    fetchImpl: fakeFetch({
      [LIST_URL]: { body: "[]", headers: { "x-ratelimit-remaining": "59", "x-ratelimit-reset": "1700000000" } },
    }),
  });
  expect(client.rateLimit().known).toBeFalse();
  await client.listPulls("octo", "hello");
  expect(client.rateLimit()).toEqual({ remaining: 59, reset: 1700000000, known: true });
});

// --- The three calls ---

test("listPulls returns the validated probe items", async () => {
  const client = createGhClient({
    fetchImpl: fakeFetch({ [LIST_URL]: { body: JSON.stringify([listItem(1), listItem(2)]) } }),
  });
  const items = await client.listPulls("octo", "hello");
  expect(items.length).toBe(2);
  expect(items[0].number).toBe(1);
  expect(items[0].additions).toBe(10);
  expect(items[1].user?.login).toBe("author-2");
});

test("listPulls rejects a wrong shape with a GhError", async () => {
  const client = createGhClient({ fetchImpl: fakeFetch({ [LIST_URL]: { body: JSON.stringify({ nope: true }) } }) });
  await expect(() => client.listPulls("octo", "hello")).toThrow((e) => e instanceof GhError);
});

test("listFiles returns the files with their patches", async () => {
  const files = [
    { filename: "src/a.ts", additions: 3, deletions: 1, status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    { filename: "docs/readme.md", additions: 0, deletions: 0, status: "removed" },
  ];
  const client = createGhClient({ fetchImpl: fakeFetch({ [FILES_URL]: { body: JSON.stringify(files) } }) });
  const got = await client.listFiles("octo", "hello", 7);
  expect(got.length).toBe(2);
  expect(got[0].patch).toBe("@@ -1 +1 @@\n-a\n+b");
  expect("patch" in got[1]).toBeFalse();
});

test("getDiff sends the diff Accept header and returns the text", async () => {
  const log: { method: string; url: string; headers: Record<string, string> }[] = [];
  const patch = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-a\n+b\n";
  const client = createGhClient({
    fetchImpl: fakeFetch({ [DIFF_URL]: { body: patch, headers: { "x-ratelimit-remaining": "58", "x-ratelimit-reset": "1700000001" } } }, log),
  });
  const diff = await client.getDiff("octo", "hello", 7);
  expect(diff).toBe(patch);
  expect(log[0].headers["Accept"]).toBe("application/vnd.github.diff");
  expect(client.rateLimit()).toEqual({ remaining: 58, reset: 1700000001, known: true });
});

test("an error status rejects with the API's message", async () => {
  const client = createGhClient({
    fetchImpl: fakeFetch({ [LIST_URL]: { status: 403, body: JSON.stringify({ message: "Not Found" }) } }),
  });
  await expect(() => client.listPulls("octo", "hello")).toThrow((e) => e instanceof GhError && e.status === 403 && e.apiMessage === "Not Found");
});

// --- Structural validation ---

test("isPullListItem accepts a real item and rejects broken ones", () => {
  expect(isPullListItem(listItem(3))).toBeTrue();
  expect(isPullListItem({ number: "3" })).toBeFalse();
  expect(isPullListItem(null)).toBeFalse();
  expect(isPullListItem({ ...listItem(3), head: {} })).toBeFalse();
  expect(isPullListItem([{ ...listItem(3) }])).toBeFalse();
});

test("isPullFile accepts a file and rejects broken ones", () => {
  expect(isPullFile({ filename: "a", additions: 1, deletions: 0, status: "modified", patch: "@@" })).toBeTrue();
  expect(isPullFile({ filename: "a", additions: 1, deletions: 0, status: "modified" })).toBeTrue();
  expect(isPullFile({ filename: "a" })).toBeFalse();
});

// --- The lazy-load tuple (T2) and STALE (T3) ---

test("probeHit is true only when all four fields match", () => {
  const item = listItem(7, { state: "closed", merged_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-03T09:00:00Z", sha: "sha-new" });
  const record = recordOf(item);
  expect(probeHit(record, item)).toBeTrue();
  expect(probeHit(undefined, item)).toBeFalse();
  expect(probeHit(record, listItem(7, { sha: "sha-else" }))).toBeFalse();
  expect(probeHit(record, listItem(7, { updated_at: "2026-11-03T10:00:00Z" }))).toBeFalse();
  expect(probeHit(record, listItem(7, { state: "open" }))).toBeFalse();
  expect(probeHit(record, listItem(7, { merged_at: null }))).toBeFalse();
});

test("tupleOf and tupleOfRecord agree on the same PR", () => {
  const item = listItem(9, { state: "closed", merged_at: "2026-11-04T00:00:00Z" });
  expect(tupleOfRecord(recordOf(item))).toEqual(tupleOf(item));
});

test("statusOf: unreviewed, fresh, and STALE against the current head", () => {
  const record = recordOf(listItem(5));
  expect(statusOf(record, undefined)).toBe("unreviewed");
  const fresh: Review = { headSha: record.headSha, verdict: "approve", summary: "", annotations: [], savedAt: record.fetchedAt };
  expect(statusOf(record, fresh)).toBe("fresh");
  const stale: Review = { ...fresh, headSha: "older-sha" };
  expect(statusOf(record, stale)).toBe("STALE");
  expect(statusOf(undefined, fresh)).toBe("STALE");
});

function recordOf(item: ReturnType<typeof listItem>): PrRecord {
  return {
    number: item.number,
    title: item.title,
    author: item.user?.login ?? "",
    state: item.state === "open" ? "open" : "closed",
    merged: item.merged_at !== null,
    updatedAt: item.updated_at,
    headSha: item.head.sha,
    additions: item.additions,
    deletions: item.deletions,
    changedFiles: item.changed_files,
    fetchedAt: "2026-11-01T10:00:00Z",
  };
}

// --- The runner's exit ---

await Promise.all(checks);
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  process.exitCode = 1;
}
