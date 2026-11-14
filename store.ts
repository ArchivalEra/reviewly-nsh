// The app's state: its signals stay private, pages read and change it
// through these functions. Facts about PRs are produced once, in `syncRepo`
// from what the GitHub client returns, and read back from here; the only
// content the user writes is a review.
import { signal } from "nsh";
import { Storage } from "nsh";
import {
  createGhClient,
  probeHit,
  statusOf as ghStatusOf,
  type GhClient,
  type GhPullListItem,
  type PrDetail,
  type PrRecord,
  type Review,
} from "./lib/gh";

// --- Stored shapes beyond the client's ---

export interface Repo {
  owner: string;
  repo: string;
}

export interface Settings {
  token?: string;
  orgFilter?: string;
}

export type SyncOutcome =
  | { repo: string; probe: number; full: number; skipped: number }
  | { repo: string; error: string };

export interface SyncState {
  running: boolean;
  lastSync: string | null;
  error?: string;
}

// --- Storage keys (values are JSON strings) ---

const KEY_REPOS = "repos";
const KEY_SETTINGS = "settings";
const KEY_PRS = "prs";
const KEY_DETAILS = "details";
const KEY_REVIEWS = "reviews";

// --- The signals ---

const repos = signal<Repo[]>([]);
const settings = signal<Settings>({});
const prs = signal<Record<string, PrRecord[]>>({});
const details = signal<Record<string, PrDetail>>({});
const reviews = signal<Record<string, Review>>({});
const rate = signal<{ remaining: number; reset: number; known: boolean }>({
  remaining: 0,
  reset: 0,
  known: false,
});
const sync = signal<SyncState>({ running: false, lastSync: null });

// The client carries the token of the moment; rebuilt when it changes.
let client: GhClient | null = null;
let clientToken: string | undefined = undefined;

function gh(): GhClient {
  const token = settings().token;
  if (!client || clientToken !== token) {
    client = createGhClient({ token });
    clientToken = token;
  }
  return client;
}

// The client's rate limit, reflected into the store's signal as calls land.
function publishRateLimit() {
  const known = gh().rateLimit();
  if (known.known) rate.set(known);
}

// --- Loading what Storage holds, once at startup ---

let loaded = false;

export async function loadStore(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const read = async <T,>(key: string, fallback: T): Promise<T> => {
    const text = await Storage.getItem(key);
    if (text === null) return fallback;
    try {
      return JSON.parse(text) as T;
    } catch {
      return fallback;
    }
  };
  repos.set(await read<Repo[]>(KEY_REPOS, []));
  settings.set(await read<Settings>(KEY_SETTINGS, {}));
  prs.set(await read<Record<string, PrRecord[]>>(KEY_PRS, {}));
  details.set(await read<Record<string, PrDetail>>(KEY_DETAILS, {}));
  reviews.set(await read<Record<string, Review>>(KEY_REVIEWS, {}));
}

// --- Snapshots (tracked where they are read) ---

/** The repos added, in the order they were added. */
export const getRepos = () => repos();

/** The settings (the PAT, the org filter). */
export const getSettings = () => settings();

/** The probe-level records of every repo, keyed `"owner/repo"`. */
export const getPrs = () => prs();

/** The full name `"owner/repo"` of the repo the inbox shows, or null. */
export const getFull = (full: string): PrRecord[] => prs()[full] ?? [];

/** One PR's record, or undefined before its first sync. */
export const prRecord = (full: string, n: number): PrRecord | undefined =>
  getFull(full).find((pr) => pr.number === n);

/** One PR's lazily loaded detail, or undefined when not fetched yet. */
export const prDetail = (full: string, n: number): PrDetail | undefined =>
  details()[`${full}#${n}`];

/** One PR's stored review, or undefined when the user wrote none. */
export const prReview = (full: string, n: number): Review | undefined =>
  reviews()[`${full}#${n}`];

/** The last response's rate limit (`known` false before any response). */
export const rateLimit = () => rate();

/** The sync's state: running, when it last finished, its last error. */
export const syncState = () => sync();

/** The review status of one PR against its stored review. */
export function statusOf(full: string, n: number): "fresh" | "STALE" | "unreviewed" {
  return ghStatusOf(prRecord(full, n), prReview(full, n));
}

// --- Persistence (writes follow their signal updates) ---

function persist(key: string, value: unknown): void {
  Storage.setItem(key, JSON.stringify(value)).catch(() => {});
}

// --- Actions ---

/** Adds a repo and makes it the one the inbox shows. */
export function addRepo(owner: string, repo: string): void {
  const o = owner.trim();
  const r = repo.trim();
  if (!o || !r) return;
  const full = `${o}/${r}`;
  repos.update((list) => (list.some((repo0) => `${repo0.owner}/${repo0.repo}` === full) ? list : [...list, { owner: o, repo: r }]));
  if (current() === null) selectRepo(full);
  persist(KEY_REPOS, repos());
}

/** Removes a repo with its cached PRs, details and reviews. */
export function removeRepo(full: string): void {
  repos.update((list) => list.filter((repo) => `${repo.owner}/${repo.repo}` !== full));
  prs.update((all) => {
    const { [full]: _removed, ...rest } = all;
    return rest;
  });
  if (current() === full) {
    const next = repos()[0];
    selectRepo(next ? `${next.owner}/${next.repo}` : null);
  }
  persist(KEY_REPOS, repos());
  persist(KEY_PRS, prs());
}

/** Patches the settings; a token change rebuilds the GitHub client. */
export function saveSettings(patch: Partial<Settings>): void {
  settings.update((s) => ({ ...s, ...patch }));
  persist(KEY_SETTINGS, settings());
}

/** Clears every cached fact: PRs, details and reviews; repos and settings stay. */
export function clearCache(): void {
  prs.set({});
  details.set({});
  reviews.set({});
  persist(KEY_PRS, {});
  persist(KEY_DETAILS, {});
  persist(KEY_REVIEWS, {});
}

// The repo the inbox shows (its own signal: not persisted).
const currentRepo = signal<string | null>(null);

/** The full name of the repo the inbox shows, or null. */
export const current = () => currentRepo();

/** Makes `full` the repo the inbox shows. */
export function selectRepo(full: string | null): void {
  currentRepo.set(full);
}

// The line selection of the DiffView on the PR page (its own signal).
const head = signal<{ side: string; start: number; end: number } | null>(null);

/** The DiffView's line selection, or null. */
export const getHead = () => head();

/** Sets the DiffView's line selection (`setHead` of §STORE). */
export function setHead(ref: { side: string; start: number; end: number } | null): void {
  head.set(ref);
}

// --- The fetch layer (laziness per §STORE) ---

function recordOf(item: GhPullListItem): PrRecord {
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
    fetchedAt: now(),
  };
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Syncs one repo: the list probe runs, and a PR whose four lazy-load fields
 * match what is stored skips its full fetch; one that changed (or is new)
 * has its record rewritten. Details are not touched here: only a PR page
 * fetches them.
 */
export async function syncRepo(full: string): Promise<SyncOutcome> {
  const [owner, repo] = full.split("/");
  try {
    const items = await gh().listPulls(owner, repo);
    publishRateLimit();
    const stored = prs()[full] ?? [];
    const next: PrRecord[] = [];
    let fullCount = 0;
    let skipped = 0;
    for (const item of items) {
      const known = stored.find((pr) => pr.number === item.number);
      if (probeHit(known, item)) {
        skipped++;
        next.push(known!);
        continue;
      }
      fullCount++;
      next.push(recordOf(item));
    }
    prs.update((all) => ({ ...all, [full]: next }));
    persist(KEY_PRS, prs());
    sync.update((s) => ({ ...s, lastSync: now() }));
    return { repo: full, probe: items.length, full: fullCount, skipped };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    sync.set({ running: false, lastSync: sync().lastSync, error: message });
    return { repo: full, error: message };
  }
}

/** Syncs every repo in order; the inbox's error shows the first failure. */
export async function syncAll(): Promise<void> {
  sync.set({ running: true, lastSync: sync().lastSync });
  try {
    for (const repo of repos()) {
      await syncRepo(`${repo.owner}/${repo.repo}`);
      if (sync().error) break;
    }
  } finally {
    sync.update((s) => ({ ...s, running: false }));
  }
}

/** Fetches one PR's files and diff, unless a cached detail is there. */
export async function ensureDetail(full: string, n: number): Promise<PrDetail | undefined> {
  const key = `${full}#${n}`;
  const known = details()[key];
  if (known) return known;
  const [owner, repo] = full.split("/");
  try {
    const c = gh();
    const [files, diff] = await Promise.all([c.listFiles(owner, repo, n), c.getDiff(owner, repo, n)]);
    publishRateLimit();
    const detail: PrDetail = { files, diff, fetchedAt: now() };
    details.update((all) => ({ ...all, [key]: detail }));
    persist(KEY_DETAILS, details());
    return detail;
  } catch (e) {
    sync.update((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
    return undefined;
  }
}

/**
 * Saves the user's review of one PR, bound to the record's current head:
 * `headSha` comes from the store, never from a page argument.
 */
export function saveReview(full: string, n: number, verdict: Review["verdict"], summary: string, annotations: Review["annotations"]): Review | undefined {
  const record = prRecord(full, n);
  if (!record) return undefined;
  const review: Review = { headSha: record.headSha, verdict, summary, annotations, savedAt: now() };
  reviews.update((all) => ({ ...all, [`${full}#${n}`]: review }));
  persist(KEY_REVIEWS, reviews());
  return review;
}
