# HANDOVER: Explore tab (PIB-only task)

Last updated: all steps 0-13. Zips: `StudIn-PWA_step3.zip` (steps 0-3) and `StudIn-PWA_step13.zip` (everything; steps 4-8 and 9-10 were delivered together, not as separate zips).

## Status by step
| Step | Result | Evidence |
|---|---|---|
| 0 Baseline | PASS (baseline itself has 2 old failures) | `docs/explore/BASELINE.md`, `FINDINGS.md` |
| 1 Data contract | PASS | `docs/explore/DATA_CONTRACT.md`, `scripts/explore/validate.mjs`; `npm run explore:validate` PASS |
| 2 Fetcher | PASS for code paths run offline; live fetch NOT RUN (no network here) | `node scripts/explore/fetch-feeds.mjs --no-network` PASS; plain run logs `fetch failed` for both PIB sources and exits 2 with "nothing to commit" |
| 3 Seed data | PASS | `data/explore/sources.json` (9 sources), `curated.json` (10 placeholders), `feed/2026-11.json` merged by the fetcher |

| 4-8 App | Code written; jsdom-tested; real browser NOT RUN | `core/explore-tabs.js`, `ui|bal|dal/explore/`, `css/explore.css`, `i18n/explore/en.json`, `sw.js` |
| 9 Tests | PASS (115 explore assertions) | `docs/explore/TEST_REPORT.md` |
| 10 Checklist | written, all NOT RUN | `docs/explore/QA_CHECKLIST.md` |
| 12 Workflows | written, YAML parses; NOT RUN on GitHub | `.github/workflows/`, `QA_SETUP.md`, `RUNBOOK.md` |
| 13 Report | written | `docs/explore/END_TO_END_QA_REPORT.md` |

## How to run
`npm ci`, `npm run test:explore`, `npm run explore:validate`, `npm run explore:fetch` (needs network; `-- --no-network` merges curated only), serve with `python3 -m http.server 8000`.

## What changed in existing files (small, traceable)
`index.html` (+tab strip in `#stepper`, +`#panel-explore`), `core/state-nav.js` (+import, +Explore guard while analysis computes, +rails collapse, +lazy import block), `core/main.js` (+1 import), `css/core.css` (+tabs/ribbon block), `i18n/shell/en.json` (+4 keys) and the regenerated `SR_STRINGS_EN` in `core/render-i18n.js`, `sw.js` (+SWR for `data/explore`, `CACHE_VERSION` `sia-v12.37` -> `sia-v12.38` by hand, precache list regenerated), `scripts/gen-sw-precache.py` (skips lazy Explore files), `package.json` (+scripts), `planner.md` (+1 index row), `PIB.md` (+1 line). `CNAME`, `manifest.json`, other locales: untouched.

## Design notes
- Tabs live inside `#stepper` (first two items). While Explore is active the Insight steps are hidden by a body class; the Insight tab returns to the last Insight step without reloading. Reason: no new fixed bar, so `--content-top` offsets stay valid.
- Explore code, CSS and strings are NOT precached; they cache on first use. Offline Explore therefore works only after one online visit. Data uses stale-while-revalidate, newest 3 month files kept.
- Placeholder curated items are hidden unless the QA flag file `qa-build.json` exists (written only by Deploy QA). Production therefore shows an empty Explore until you edit `curated.json` or the PIB feed produces items.
- QA detection reuses `window.APP_CONFIG.env`; a QA site on another host name is treated as production (safe direction).
- QA workflows are inert unless repo variable `EXPLORE_QA=true`, so copying `.github/` to production does nothing.
- Deploy QA rewrites `CACHE_VERSION` to `sia-qa-<sha>` only inside the staged copy.

## More assumptions
- A10. Explore tab is blocked while Run Analysis is computing (same rule as Scholarship).
- A11. Language filter is exact (`item.lang === chosen language`). A user who picks Kannada sees nothing until Kannada items exist; the empty state says to change choices.
- A12. Eager strings (tab labels, aria label, load-failed message) are in the shell shard; everything else is in the lazy `i18n/explore/en.json`, merged into the English fallback table. The lazy shard is outside the gap-check groups on purpose (English only). When translating later, add `explore` to `I18N_FEATURES` and `GROUPS`.
- A13. Action versions in workflows are from memory (see `QA_SETUP.md`).

## Known risks
- Real-browser behaviour (layout at 380 px, dark mode, service worker, history/back) is unverified.
- PIB feed field names, English feed URL and education filter quality are unverified until the first Actions run.
- Placeholder items point at site home pages only; AICTE/CBSE/NTA/NSP domains are unverified.
- Baseline `check:cycles` and `test:smart-plan` still fail (unchanged, not mine).

## Next steps
1. Push to QA repo, set variables, run "Explore feed", fill `PIB_FEED_NOTES.md`, tune `keywords.json`.
2. Run `QA_CHECKLIST.md` on a phone.
3. Replace placeholder curated items with real ones.
 (picked the simplest option, did not ask)
- A1. Two PIB sources (`pib` English Lang=1 UNVERIFIED, `pib-hi` Hindi Lang=2) because the language tag must be right per item and one source has one feed URL.
- A2. `sources.json` got two extra fields: `domains` (explicit link allowlist) and optional `filter: "education"`.
- A3. The app has no state list. The State picker will be built from `states` values found in the data (hidden when there are none). All seed data is `["all"]`.
- A4. Month files are `{ schemaVersion, month, items }` objects, not bare arrays.
- A5. Item date = UTC calendar date of the source timestamp.
- A6. MIT OCW feed URL is not known, so it is `feedUrl: null`, disabled.
- A7. Curated domains for AICTE, CBSE, NTA, NSP are my best knowledge, NOT verified live. Owner must confirm.
- A8. Placeholder curated items point at site home pages only (no invented deep links). Two use a `#placeholder-2` fragment so ids stay unique.
- A9. Items removed from `curated.json` are removed from the month files on the next run (curated sources are authoritative).

## Not run / blocked
- Live PIB fetch, English feed check, real field names: BLOCKED (no network in this chat).
- Real browser checks: BLOCKED (no browser available).

## Update: Career Bible + Courses explorer + daily link check
- New: `data/explore/courses.json` (80 courses, 38 non-general), `exams.json` (52 official bodies incl. 15 state exams), `states.json` (28 states + 8 UTs), `careers.json`; `scripts/explore/check-links.mjs`; `ui/explore/courses-ui.js`, `career-bible.js`; `bal/explore/courses-logic.js`. Explore has sub-tabs News | Courses. Tests: `dev-tests/test-explore-courses.mjs` (38 assertions).
- URLs in `exams.json` were written WITHOUT network access (unverified). The first daily run will flag any that are wrong; fix them from the job summary.
- Not possible and not done: auto-copying admission criteria (no machine-readable source, copying pages is not allowed by the rules in this project). Criteria shown are typical, hand-written, and always link to the official site.
- State coverage: 15 state bodies only. Other states show "No exam listed for this state yet".
- Country dropdown lists the app's countries but only India has data.

## Update: language selects regional data
- Language change in the header now updates Explore (news language + home-state items) and the Courses state. Verified in a real browser: Kannada sets state Karnataka. Assumption A11 changed: the language filter is now "chosen language OR the language's home states".
- Private/regional feeds: NOT added (no verified feed URLs, terms unchecked). How-to and the IP-block fix are in `RUNBOOK.md`.

## Update: first-visit chooser
- First visit only (no saved tab, no `#explore/#insight` in the URL): a pop-up asks Insight or Explore and goes there. It waits until the existing intro slider and video pop-up are closed, so pop-ups never stack. Escape = Insight. The choice is remembered (`studin.explore.welcome.v1`), so it does not repeat. To ask on every load instead, remove the `done` check in `initWelcome()` in `core/explore-tabs.js`.
- Bug fixed on the way: reload / saved-tab restore of Explore ran too early and Home overwrote it. It now waits for the app's own boot.

## Update: Career Bible v2
- 279 nodes, 6 levels deep (was 114): engineering branches, medical specialties, trades, commerce and arts tracks, with roles. Search box (highlights, opens matching branches), "You are here" path, and per-node buttons.
- Dynamic: each node can list `cr` (course ids) and `ex` (exam ids). Official exam links and their daily "checked / changed / not reachable" badges come live from `exams.json` / `linkstatus.json`; "Show N related courses" opens the Courses tab filtered to those courses. Edit `data/explore/careers.json`; `npm run explore:validate` checks every reference.
- No salary or cut-off figures on purpose (they go stale and cannot be verified here). Content is owner-reviewable text, not copied from any site.
- Also fixed: GitHub Pages "Liquid syntax error" came from Jekyll building the repo. Added `.nojekyll` and set Pages source to GitHub Actions (see QA_SETUP.md).
