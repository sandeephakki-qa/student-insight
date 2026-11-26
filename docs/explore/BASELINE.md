# Baseline (before any Explore change)

Date: 2026-11-22 · Node v22.23.5 · npm 10.9.9 · input: `3__student-insight-prod.zip` (`package.json` 4.7.0, `sw.js` `CACHE_VERSION = 'sia-v12.37'`, `CNAME` = `studin.in`).

`npm ci`: **PASS** (installs; `npm audit` prints advisories, not acted on).
`npm run check:all` stops at its first failure (`check:cycles`), so every script was run on its own.

| Command | Result | Note |
|---|---|---|
| `npm run check:cycles` | **FAIL (pre-existing)** | 10-file import cycle: `bal/common/compute-stats.js`, `core/project-setup.js`, `core/setup-wizard.js`, `core/state-nav.js`, `core/template-upload.js`, `core/vs-shell.js`, `dal/common/data-access.js`, `ui/common/render-buckets.js`, `ui/common/render-core.js`, `ui/common/render-findings.js`. Not fixed (stop-and-fix rule). |
| `npm run check:layers` | PASS | |
| `npm run check:sw` | PASS | 96 shell files, 5 CDN scripts |
| `npm run lint:i18n` | PASS | gap check + hardcoded-string lint |
| `npm run test:engine` | PASS | |
| `npm run test:completeness` | PASS | |
| `npm run test:report-views` | PASS | |
| `npm run test:smart-plan` | **FAIL (pre-existing)** | `ReferenceError: window is not defined` at `core/render-i18n.js:2201` when a test imports it under plain Node. Not fixed. |
| `npm run test:pdf-reports` | NOT RUN | not part of `check:all` |
| `npm run test:loader-cards` | NOT RUN | needs a static server and a browser |

Consequence: `npm run check:all` is red on the baseline. Explore work is judged by "no NEW failures": the cycle list must stay exactly the same 10 files and `test:smart-plan` must fail in the same way.
