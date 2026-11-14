// GitHub API client: the only place PR facts are produced. Everything
// GitHub returns comes through `ghFetch` here; callers store what these
// functions return and the UI reads it back from the store.
//
// Depends on nothing but itself and the platform's `fetch` (injectable for
// tests): no nsh imports, no B1 imports.

// --- Wire shapes (what GitHub sends) ---

/** One item of the list probe's JSON. */
export interface GhPullListItem {
  number: number;
  title: string;
  user: { login: string } | null;
  state: string;
  merged_at: string | null;
  updated_at: string;
  head: { sha: string };
  additions: number;
  deletions: number;
  changed_files: number;
}

/** One item of `/pulls/{n}/files`. */
export interface GhPullFile {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
  patch?: string;
}

// --- Stored shapes (§STORE: the only forms that go into Storage) ---

/** Probe-level PR record: the one form a PR is stored as. */
export interface PrRecord {
  number: number;
  title: string;
  author: string;
  state: "open" | "closed";
  merged: boolean;
  updatedAt: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  fetchedAt: string;
}

/** Lazily loaded detail of one PR, cached beside its record. */
export interface PrDetail {
  files: { filename: string; additions: number; deletions: number; status: string; patch?: string }[];
  diff: string;
  fetchedAt: string;
}

/** A review the user wrote: the only hand-written content in the app. */
export interface Review {
  headSha: string;
  verdict: "approve" | "request_changes" | "comment";
  summary: string;
  annotations: { path: string; line: number; body: string }[];
  savedAt: string;
}

// --- Errors ---

/** A failed GitHub call: the status and GitHub's message, when it sent one. */
export class GhError extends Error {
  readonly status: number;
  readonly apiMessage: string;

  constructor(status: number, apiMessage: string) {
    super(apiMessage ? `GitHub API ${status}: ${apiMessage}` : `GitHub API ${status}`);
    this.name = "GhError";
    this.status = status;
    this.apiMessage = apiMessage;
  }
}

// --- Structural validation ---

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/** True when `v` looks like one item of the list probe's JSON. */
export function isPullListItem(v: unknown): v is GhPullListItem {
  if (!isRecord(v)) return false;
  const head = v.head;
  return (
    isNumber(v.number) &&
    isString(v.title) &&
    isString(v.state) &&
    (v.merged_at === null || isString(v.merged_at)) &&
    isString(v.updated_at) &&
    isNumber(v.additions) &&
    isNumber(v.deletions) &&
    isNumber(v.changed_files) &&
    isRecord(head) &&
    isString(head.sha)
  );
}

/** True when every item of `v` looks like one item of the list probe's JSON. */
export function isPullList(v: unknown): v is GhPullListItem[] {
  return Array.isArray(v) && v.every(isPullListItem);
}

/** True when `v` looks like one item of `/pulls/{n}/files`. */
export function isPullFile(v: unknown): v is GhPullFile {
  if (!isRecord(v)) return false;
  return (
    isString(v.filename) &&
    isNumber(v.additions) &&
    isNumber(v.deletions) &&
    isString(v.status) &&
    (v.patch === undefined || isString(v.patch))
  );
}

// --- The lazy-load tuple (§STORE: state + merged + updatedAt + headSha) ---

/**
 * The four probe fields the lazy-load decision compares: exactly equal to
 * what is stored, a PR's full detail is not fetched again.
 */
export interface ProbeTuple {
  state: "open" | "closed";
  merged: boolean;
  updatedAt: string;
  headSha: string;
}

/** The probe tuple of a list item. */
export function tupleOf(item: GhPullListItem): ProbeTuple {
  return {
    state: item.state === "open" ? "open" : "closed",
    merged: item.merged_at !== null,
    updatedAt: item.updated_at,
    headSha: item.head.sha,
  };
}

/** The probe tuple of a stored record. */
export function tupleOfRecord(record: PrRecord): ProbeTuple {
  return {
    state: record.state,
    merged: record.merged,
    updatedAt: record.updatedAt,
    headSha: record.headSha,
  };
}

/**
 * True when the probe says nothing changed: the four fields are exactly
 * those of the stored record, so the full detail is skipped (the record is
 * not rewritten and `fetchedAt` does not move).
 */
export function probeHit(record: PrRecord | undefined, item: GhPullListItem): boolean {
  if (record === undefined) return false;
  const a = tupleOf(item);
  const b = tupleOfRecord(record);
  return (
    a.state === b.state && a.merged === b.merged && a.updatedAt === b.updatedAt && a.headSha === b.headSha
  );
}

/**
 * The review status of a PR against its stored review: no review is
 * `unreviewed`, a review bound to another head is `STALE` (the old review
 * stays), one bound to the current head is `fresh`.
 */
export function statusOf(record: PrRecord | undefined, review: Review | undefined): "fresh" | "STALE" | "unreviewed" {
  if (review === undefined) return "unreviewed";
  if (record === undefined) return "STALE";
  return review.headSha === record.headSha ? "fresh" : "STALE";
}

// --- The client ---

const API = "https://api.github.com";

/** One request the client made, for tests and the store's sync bookkeeping. */
export interface GhRequest {
  method: string;
  url: string;
  authorized: boolean;
}

/** Headers a GitHub response carries that the UI shows. */
export interface RateLimit {
  remaining: number;
  reset: number;
  known: boolean;
}

/**
 * What a response's headers look like: a plain record on the native
 * platforms, the DOM's `Headers` on the web. `headerOf` reads either.
 */
export type HeadersLike = Record<string, string> | { get(name: string): string | null };

/** One header of either headers form. */
export function headerOf(headers: HeadersLike, name: string): string | undefined {
  if ("get" in headers && typeof headers.get === "function") {
    const value = headers.get(name);
    return value === null ? undefined : value;
  }
  const lowered: Record<string, string> = {};
  for (const key of Object.keys(headers as Record<string, string>)) {
    lowered[key.toLowerCase()] = (headers as Record<string, string>)[key];
  }
  return lowered[name.toLowerCase()];
}

/**
 * What the client needs of the platform: the globals nsh gives a TSX app.
 * Declared here instead of ambient DOM types, so the client checks and runs
 * wherever nsh runs (QuickJS on the platforms, a browser on the web) and a
 * test can hand its own.
 */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; headers: HeadersLike; text: () => Promise<string> }>;

export interface GhClient {
  /** Every request made so far, oldest first. */
  requests(): GhRequest[];
  /** The last response's rate-limit headers (`known` false before any response). */
  rateLimit(): RateLimit;
  /** The list probe: one page of the repo's PRs, most recently updated first. */
  listPulls(owner: string, repo: string): Promise<GhPullListItem[]>;
  /** A PR's files (no `diff`; the patch of each file comes along). */
  listFiles(owner: string, repo: string, n: number): Promise<GhPullFile[]>;
  /** A PR's whole unified diff, as `DiffView`'s `patch` takes it. */
  getDiff(owner: string, repo: string, n: number): Promise<string>;
}

export interface GhClientOptions {
  /** The PAT, sent as `Authorization: Bearer`; absent, anonymous. */
  token?: string;
  /** The platform's `fetch`; defaults to the global one. */
  fetchImpl?: FetchLike;
}

/** Builds the GitHub client over one injectable `fetch`. */
export function createGhClient(options: GhClientOptions = {}): GhClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requests: GhRequest[] = [];
  let rateLimit: RateLimit = { remaining: 0, reset: 0, known: false };

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
    return headers;
  }

  async function request(method: string, url: string, accept?: string): Promise<{
    status: number;
    ok: boolean;
    text: string;
  }> {
    const headers = authHeaders();
    if (accept) headers["Accept"] = accept;
    const response = await fetchImpl(url, { method, headers });
    const text = await response.text();
    requests.push({ method, url, authorized: options.token !== undefined });
    const remaining = headerOf(response.headers, "x-ratelimit-remaining");
    const reset = headerOf(response.headers, "x-ratelimit-reset");
    if (remaining !== undefined && reset !== undefined) {
      const parsed = { remaining: Number(remaining), reset: Number(reset) };
      if (isNumber(parsed.remaining) && isNumber(parsed.reset)) rateLimit = { ...parsed, known: true };
    }
    return { status: response.status, ok: response.ok, text };
  }

  async function requestJson(method: string, url: string): Promise<unknown> {
    const res = await request(method, url);
    let body: unknown = undefined;
    if (res.text) {
      try {
        body = JSON.parse(res.text);
      } catch {
        body = undefined;
      }
    }
    if (!res.ok) {
      const message = isRecord(body) && isString(body.message) ? body.message : "";
      throw new GhError(res.status, message);
    }
    return body;
  }

  return {
    requests: () => [...requests],

    rateLimit: () => rateLimit,

    async listPulls(owner, repo) {
      const url = `${API}/repos/${owner}/${repo}/pulls?state=all&per_page=100&sort=updated&direction=desc`;
      const body = await requestJson("GET", url);
      if (!isPullList(body)) throw new GhError(200, "unexpected /pulls response shape");
      return body;
    },

    async listFiles(owner, repo, n) {
      const url = `${API}/repos/${owner}/${repo}/pulls/${n}/files?per_page=100`;
      const body = await requestJson("GET", url);
      if (!Array.isArray(body) || !body.every(isPullFile)) {
        throw new GhError(200, "unexpected /pulls/files response shape");
      }
      return body;
    },

    async getDiff(owner, repo, n) {
      const url = `${API}/repos/${owner}/${repo}/pulls/${n}/diff`;
      const res = await request("GET", url, "application/vnd.github.diff");
      if (!res.ok) throw new GhError(res.status, "");
      return res.text;
    },
  };
}
