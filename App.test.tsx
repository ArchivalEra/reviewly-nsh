// The app's flows (§SELFTEST T1-T7), with the steps a user takes.
// Every test stubs the network (`open`'s `network`), so nothing reaches
// GitHub, and seeds or reads Storage through the host.
import { expect, open, test } from "nsh/test";
import type { App } from "nsh/test";

// --- The fake GitHub ---

const LIST_URL =
  "GET https://api.github.com/repos/octo/hello/pulls?state=all&per_page=100&sort=updated&direction=desc";

function listItem(n: number, over: Partial<{ state: string; merged_at: string | null; updated_at: string; sha: string; title: string; author: string }> = {}) {
  return {
    number: n,
    title: over.title ?? `PR ${n}`,
    user: { login: over.author ?? `author-${n}` },
    state: over.state ?? "open",
    merged_at: over.merged_at ?? null,
    updated_at: over.updated_at ?? "2026-11-01T10:00:00Z",
    head: { sha: over.sha ?? `sha-${n}` },
    additions: 10 * n,
    deletions: 2 * n,
    changed_files: n,
  };
}

const FILES_URL = "GET https://api.github.com/repos/octo/hello/pulls/1/files?per_page=100";
const DIFF_URL = "GET https://api.github.com/repos/octo/hello/pulls/1/diff";

const FILES = [
  { filename: "src/a.ts", additions: 3, deletions: 1, status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
];
const DIFF = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n";

// The app must be open before `addRepo` puts the repo in the store, and
// synced before the detail page can lazy-load. `routes` optionally
// overrides the network routes (T6's failure case).
async function openApp(routes: Record<string, unknown> = {}): Promise<App> {
  const app = await open("./App.tsx", {
    width: 900,
    height: 1400,
    clock: {},
    network: {
      [LIST_URL]: { body: [listItem(1)], headers: { "x-ratelimit-remaining": "59", "x-ratelimit-reset": "1790000000" } },
      [FILES_URL]: { body: FILES },
      [DIFF_URL]: { body: DIFF },
      ...routes,
    },
  });
  await app.type("label:Owner", "octo");
  await app.type("label:Repo", "hello");
  await app.press("role:button[Add]");
  await app.press("role:button[Sync]");
  await app.waitFor("#1 PR 1");
  return app;
}

// --- T1: facts come from the mock, once ---

test("T1: the list the mock returns is what the rows show", async () => {
  const app = await openApp();
  expect(app.texts()).toContain("#1 PR 1");
  expect(app.texts()).toContain("author-1 · +10 −2 · 1 files");
  // The rate-limit header of the mock's response, shown as it arrived.
  expect(app.texts().some((t) => t.startsWith("API quota: 59 requests left"))).toBe(true);
});

// --- T2: the second sync's probe hits the cache ---

test("T2: a second sync changes nothing and refetches nothing new", async () => {
  const app = await openApp();
  const afterFirst = app.requests().length;
  await app.press("role:button[Sync]");
  await app.waitFor("Syncing…", { state: "gone" });
  // The probe ran again, but no full fetch (no /files, no /diff).
  const urls = app.requests().map((r) => r.url);
  expect(urls.filter((u) => u.includes("/files") || u.includes("/diff")).length).toBe(0);
  expect(app.requests().length).toBe(afterFirst + 1);
  expect(app.texts()).toContain("#1 PR 1");
});

// --- T3: a changed PR goes STALE; re-saving makes it fresh ---

test("T3: a changed head goes STALE, and a re-saved review goes fresh", async () => {
  let headSha = "sha-1";
  let updatedAt = "2026-11-01T10:00:00Z";
  let calls = 0;
  const app = await open("./App.tsx", {
    width: 900,
    height: 1400,
    clock: {},
    network: {
      [LIST_URL]: () => {
        calls++;
        return { body: [listItem(1, { sha: headSha, updated_at: updatedAt })] };
      },
      [FILES_URL]: { body: FILES },
      [DIFF_URL]: { body: DIFF },
    },
  });
  await app.type("label:Owner", "octo");
  await app.type("label:Repo", "hello");
  await app.press("role:button[Add]");
  await app.press("role:button[Sync]");
  await app.waitFor("#1 PR 1");

  // Save a review: the PR is fresh.
  await app.press("#1 PR 1");
  await app.waitFor("role:button[Save review]");
  await app.type("label:Review summary", "looks good");
  await app.press("role:button[Save review]");
  await app.waitFor("text:/Review saved/");
  await app.back();
  await app.waitFor("#1 PR 1");
  expect(app.texts()).toContain("fresh");

  // The PR changes (a new head and update time): STALE, the old review kept.
  headSha = "sha-new";
  updatedAt = "2026-11-02T10:00:00Z";
  await app.press("role:button[Sync]");
  await app.waitFor("Syncing…", { state: "gone" });
  expect(app.texts()).toContain("STALE");

  // Re-open and re-save against the current head: fresh again.
  await app.press("#1 PR 1");
  await app.waitFor("role:button[Save review]");
  await app.type("label:Review summary", "re-reviewed");
  await app.press("role:button[Save review]");
  await app.waitFor("text:/Review saved/");
  await app.back();
  await app.waitFor("#1 PR 1");
  expect(app.texts()).toContain("fresh");
  expect(calls).toBeGreaterThanOrEqual(2);
});

// --- T4: the saved review binds the store's head, not a page's ---

test("T4: the saved review carries the record's current headSha", async () => {
  const app = await openApp();
  await app.press("#1 PR 1");
  await app.waitFor("role:button[Save review]");
  await app.type("label:Review summary", "bound to the head");
  await app.press("role:button[Save review]");
  // The page shows which head the review was saved on: the record's sha-1.
  await app.waitFor("text:/Review saved/");
  expect(app.texts().some((t) => t.includes("on sha-1"))).toBe(true);
});

// --- T5: the PAT rides along as Authorization: Bearer ---

// The host records header names lower-cased, so look-ups are case-insensitive.
function headerOf(request: { headers: Record<string, string> }, name: string): string | undefined {
  const key = Object.keys(request.headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : request.headers[key];
}

test("T5: a saved token is sent as Bearer; anonymous sends none", async () => {
  // Anonymous: no Authorization header on the probe.
  const anon = await openApp();
  const anonProbe = anon.requests().find((r) => r.url.includes("/pulls?"));
  expect(anonProbe !== undefined).toBe(true);
  expect(headerOf(anonProbe!, "Authorization") === undefined).toBe(true);

  // With a token saved on the settings page, the next request carries it.
  await anon.press("role:button[Settings]");
  await anon.waitFor("Save token");
  await anon.type("label:GitHub personal access token", "ghp_test_token");
  await anon.press("role:button[Save token]");
  await anon.back();
  await anon.waitFor("role:button[Sync]");
  await anon.press("role:button[Sync]");
  await anon.waitFor("Syncing…", { state: "gone" });
  const probe = anon.requests().find((r) => r.url.includes("/pulls?") && headerOf(r, "Authorization") !== undefined);
  expect(probe !== undefined).toBe(true);
  expect(headerOf(probe!, "Authorization")).toBe("Bearer ghp_test_token");
});

// --- T6: a failing sync is visible, and the app keeps running ---

test("T6: a network failure shows the error and the app survives", async () => {
  const app = await open("./App.tsx", {
    width: 900,
    height: 1400,
    clock: {},
    network: {
      [LIST_URL]: { error: "offline" },
    },
  });
  await app.type("label:Owner", "octo");
  await app.type("label:Repo", "hello");
  await app.press("role:button[Add]");
  await app.press("role:button[Sync]");
  await app.waitFor("Sync failed: Network request failed: offline");
  // The app still takes presses after the failure.
  await app.press("role:button[Sync]");
  await app.waitFor("Sync failed: Network request failed: offline");
});

// --- T7: reviews survive a store rebuild (Storage) ---

test("T7: a review written once is in Storage after a reload", async () => {
  const app = await openApp();
  await app.press("#1 PR 1");
  await app.waitFor("role:button[Save review]");
  await app.type("label:Review summary", "persisted");
  await app.press("role:button[Save review]");
  await app.waitFor("text:/Review saved/");
  // The host's Storage holds the serialized reviews.
  const reviews = app.storage()["reviews"];
  expect(reviews !== undefined).toBe(true);
  expect(JSON.parse(reviews)["octo/hello#1"].summary).toBe("persisted");
  expect(JSON.parse(reviews)["octo/hello#1"].headSha).toBe("sha-1");
});
