# reviewly-nsh

[![facts](https://img.shields.io/badge/facts-Einfacht-blue)](STATE.md)

Reviewlys Review-Flow, neu gebaut als [NSH-App (Native Shell, nsh.dev)](https://nsh.dev):
Eine TSX-Codebasis, die gleichermaßen auf **Android / Web / Desktop** läuft. Die
Referenzimplementierung (eine Tauri-Desktop-App) liefert die Verantwortungsteilung,
den Datenfluss und die Review-Semantik; dieses Repo ist der einzige v2-Deliverable
und wird unabhängig per PRs an `ArchivalEra/reviewly-nsh` gepflegt.

**Sprachen:** [English](README.md) (Standard) · [简体中文](README.zh.md) · [README.de.md (Deutsch)](README.de.md) (diese Datei)

## Mission

Reviewlys PR-Review-Flow auf Android / Web / Desktop bringen: Die App findet jeden PR
der konfigurierten Repositories selbst, lädt Diffs lazy, annotiert Zeilen und behandelt
„ein PR hat sich geändert ⇒ erneutes Review nötig“ als semantische erster Klasse. Drei
Dokumente bilden den Produktvertrag von v2:

| Dokument | Inhalt |
|---|---|
| [INTAKE.md](INTAKE.md) | Die v2-Intake-Idee: Reporter registrieren nichts mehr — eine PR-Einreichung selbst ist die Tatsache |
| [PRIVACY-CRITERIA.md](PRIVACY-CRITERIA.md) | P1..P8-Datenschutzkriterien und Annotationsdisziplin |
| [README.md](README.md) | Diese Datei: Mission, drei Gesetze, Plattformmatrix, Befehle, Aufbau |

## Die drei Einfacht-Gesetze

Der semantische Kern erbt Einfachts drei Gesetze; alles Verhalten folgt daraus:

1. **Tatsachen werden genau einmal produziert.** Alles, was GitHub zurückgibt
   (PR-Metadaten, Dateien, Diffs, Zustand), holt die App per `fetch` und legt es direkt
   ab (`Storage`); das UI liest nur aus dem Store. Außer vom Nutzer geschriebenen
   Review-Annotationen darf kein Bildschirm GitHub-Felder von Hand kopieren oder
   fest einprogrammieren.
2. **Lazy Loading.** Der Listen-Probe (`GET /repos/{o}/{r}/pulls`, die ganze Liste auf
   einmal) wird mit dem zwischengespeicherten Datensatz verglichen; ist das Quadrupel
   `state + merged + updatedAt + headSha` unverändert, entfällt der volle Abruf des
   PR; erst eine Änderung löst den Detailabruf aus (`/pulls/{n}` + `/files`, Diff bei
   Bedarf). Wer keine Detailseite öffnet, ruft keinen Diff ab.
3. **Ein PR hat sich geändert ⇒ erneutes Review nötig.** Weicht der aktuelle `headSha`
   vom `headSha` ab, an den die gespeicherte Annotation gebunden ist, ist der
   Annotation-Status des PR `STALE` (explizit im UI markiert, alte Annotation bleibt
   erhalten); erneutes Speichern (Bindung an den aktuellen Head) stellt `fresh` wieder her.

## Plattformmatrix

Jede NSH-Plattform hat ihr eigenes natives Backend; derselbe TSX-Code läuft in
QuickJS (im Web die JS-Engine des Browsers selbst), nativ gerendert auf jeder Seite.

| Plattform | Ausführen (Dev) | Paketieren |
|---|---|---|
| Linux (GTK 4) | `nsh run --target linux` | `nsh package --target linux` |
| macOS (AppKit) | `nsh run --target macos` | `nsh package --target macos` |
| Windows (Win32) | `nsh run --target windows` | `nsh package --target windows` |
| Android | `nsh run --target android` | `nsh package --target android` (.apk) |
| Web | `nsh run --target web` | `nsh package --target web` (statische Seite; Ausgabeverzeichnis via `--out`) |

## Befehle

Die Toolchain ist die `nsh`-CLI (ein lokal installiertes `nsh` oder das
`target/<profile>/nsh` des Checkouts), pures Rust, kein Node.js nötig.

```sh
nsh dev                    # Dev-Server + Dev-Host, Hot Reload beim Speichern
nsh run                    # im Dev-Modus auf der Standardplattform dieses Rechners
nsh run --target web       # im Browser (der Dev-Server liefert die Seite)
nsh run --target android   # auf Gerät/Emulator (braucht cargo xtask android --dev)
nsh package --target web   # als statische Seite paketieren (Standard .nsh/out/<name>/; --out ändert es)
nsh check                  # Typcheck
nsh test                   # *.test.tsx ausführen (headless; --target web fährt headless Chrome)
```

## Aufbau

```
reviewly-nsh/
├── nsh.json            # NSH-App-Manifest: capabilities.network.hosts=["api.github.com"], theme → theme.json
├── App.tsx             # Einstieg: mount + NavStack
├── nav.ts              # Routen: Route = inbox | pr | settings
├── store.ts            # Signals + Fetch-Schicht (repos/settings/prs/rateLimit/syncState + Aktionen)
├── theme.json          # semantische Tokens (background/foreground/muted/accent/success/danger/border/card)
├── pages/              # eine Datei pro Seite: Inbox, PR-Detail, Einstellungen
├── components/         # gemeinsame Komponenten
├── lib/
│   ├── gh.ts           # GitHub-API-Client: Fetch-Wrapper, Auth-Header, Rate-Header, Probe/Voll/Diff, Lazy-Probe
│   └── gh.test.ts      # Unit-Tests für gh.ts
└── *.test.tsx          # die §SELFTEST-Szenarien (T1..T7)
```

## Daten & Datenschutz

- Geholte PR-Daten liegen nur im geräte-lokalen `Storage` (async K/V, 5-MB-Quota je
  App); an keinen Server wird etwas hochgeladen.
- Die einzigen menschlichen Eingaben sind PAT und Repositorien-Liste, beide auf der
  Einstellungsseite; Reporter registrieren nichts mehr (siehe [INTAKE.md](INTAKE.md)).
- Die Netzfläche ist ein Host: `nsh.json`
  `capabilities.network.hosts: ["api.github.com"]`; alles andere weist die NSH-Sandbox
  zurück. Datenschutzkriterien: [PRIVACY-CRITERIA.md](PRIVACY-CRITERIA.md).

## Testen

`nsh test` (Web-Target: echte Komponenten in einer Browser-Engine; ohne Browser
Rückfall auf `--target linux` + Xvfb). Die Abnahmeszenarien T1..T7 stehen in der
Workspace-Datei `APP-SPEC.md` §SELFTEST: Tatsachen einmal produziert, Lazy-Probe,
STALE→fresh, Annotationen binden den Head, PAT/anonyme Quota, leeres Repo/Netzwerkfehler
crasht nicht, `Storage`-Persistenz.

Die Szenario-Tests und die Unit-Tests von `lib/gh.ts` liegen in `*.test.tsx` bzw.
`lib/gh.test.ts`.
