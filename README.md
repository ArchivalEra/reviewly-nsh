# reviewly-nsh

[![facts](https://img.shields.io/badge/facts-Einfacht-blue)](STATE.md)

Reviewly's review flow, rebuilt as a [NSH (Native Shell, nsh.dev)](https://nsh.dev) app:
one TSX codebase running on **Android / Web / desktop** alike. The reference
implementation (a Tauri desktop app) contributes the responsibilities, data flow and
review semantics; this repo is the single v2 deliverable, maintained independently
via PRs to `ArchivalEra/reviewly-nsh`.

**Languages:** **English** (this file, default) · [README.zh.md (简体中文)](README.zh.md)

## Mission

Bring Reviewly's PR review flow to Android / Web / desktop: the app discovers every
PR of the configured repositories by itself, lazy-loads diffs, annotates lines, and
treats "a PR changed ⇒ re-review required" as a first-class semantic. Three documents
form the v2 product contract:

| Document | Content |
|---|---|
| [INTAKE.md](INTAKE.md) | The v2 intake idea: reporters no longer register — a PR submission itself is the fact |
| [PRIVACY-CRITERIA.md](PRIVACY-CRITERIA.md) | P1..P8 privacy criteria and annotation discipline |
| [README.md](README.md) | This file: mission, three laws, platform matrix, commands, layout |

## The three Einfacht laws

The semantic core inherits Einfacht's three laws; all behavior derives from them:

1. **Facts are produced exactly once.** Everything GitHub returns (PR metadata,
   files, diffs, state) is fetched by the app and stored directly (`Storage`); the UI
   reads only from the store. Except for user-written review annotations, no screen
   may hand-copy or hard-code GitHub fields.
2. **Lazy loading.** The list probe (`GET /repos/{o}/{r}/pulls`, the whole list at
   once) is compared against the cached record; if the four-tuple
   `state + merged + updatedAt + headSha` is unchanged, the full pull for that PR is
   skipped; only a change triggers the detail fetch (`/pulls/{n}` + `/files`, diff on
   demand). Opening no detail page fetches no diff.
3. **A PR changed ⇒ re-review required.** If the current `headSha` differs from the
   `headSha` bound to the stored annotation, that PR's annotation state is `STALE`
   (marked explicitly in the UI, old annotation kept); re-saving the annotation
   (binding the current head) returns it to `fresh`.

## Platform matrix

Every NSH platform has its own native backend; the same TSX code runs in QuickJS
(the browser's own JS engine on the web), rendered natively on each side.

| Platform | Run (dev) | Package |
|---|---|---|
| Linux (GTK 4) | `nsh run --target linux` | `nsh package --target linux` |
| macOS (AppKit) | `nsh run --target macos` | `nsh package --target macos` |
| Windows (Win32) | `nsh run --target windows` | `nsh package --target windows` |
| Android | `nsh run --target android` | `nsh package --target android` (.apk) |
| Web | `nsh run --target web` | `nsh package --target web` (static site; output dir via `--out`) |

## Commands

The toolchain is the `nsh` CLI (a locally installed `nsh` or the checkout's
`target/<profile>/nsh`), pure Rust, no Node.js needed.

```sh
nsh dev                    # dev server + dev host, hot reload on save
nsh run                    # run on this machine's default platform in dev mode
nsh run --target web       # run in the browser (dev server serves the page)
nsh run --target android   # run on a device/emulator (needs cargo xtask android --dev)
nsh package --target web   # package as a static site (default .nsh/out/<name>/; --out to change)
nsh check                  # type check
nsh test                   # run *.test.tsx (headless; --target web drives headless Chrome)
```

## Layout

```
reviewly-nsh/
├── nsh.json            # NSH app manifest: capabilities.network.hosts=["api.github.com"], theme → theme.json
├── App.tsx             # entry: mount + NavStack
├── nav.ts              # routes: Route = inbox | pr | settings
├── store.ts            # signals + fetch layer (repos/settings/prs/rateLimit/syncState + actions)
├── theme.json          # semantic tokens (background/foreground/muted/accent/success/danger/border/card)
├── pages/              # one file per page: Inbox, PR detail, Settings
├── components/         # shared components
├── lib/
│   ├── gh.ts           # GitHub API client: fetch wrapper, auth headers, rate headers, probe/full/diff, lazy probe
│   └── gh.test.ts      # unit tests for gh.ts
└── *.test.tsx          # the §SELFTEST scenarios (T1..T7)
```

## Data & privacy

- Fetched PR data is stored only in on-device `Storage` (async K/V, 5 MB per-app
  quota); nothing is uploaded to any server.
- The only human inputs are the PAT and the repository list, both in the settings
  page; reporters no longer register anything (see [INTAKE.md](INTAKE.md)).
- The network surface is one host: `nsh.json`
  `capabilities.network.hosts: ["api.github.com"]`; everything else is refused by the
  NSH sandbox. Privacy criteria: [PRIVACY-CRITERIA.md](PRIVACY-CRITERIA.md).

## Testing

`nsh test` (web target: real components in a browser engine; falls back to
`--target linux` + Xvfb without a browser). The acceptance scenarios T1..T7 live in
the workspace `APP-SPEC.md` §SELFTEST: facts produced once, probe lazy loading,
STALE→fresh, annotations bind the head, PAT/anonymous quota, empty repo/network
failure must not crash, `Storage` persistence.

The scenario tests and the `lib/gh.ts` unit tests sit in `*.test.tsx` and
`lib/gh.test.ts` respectively.
