# Test report (Node only, no browser)

Run from the project root, Node v22.23.5. Evidence label per command.

| Command | Result | What it covers |
|---|---|---|
| `npm run explore:validate` | **PASS** | sources, curated, feed month, index, status against `DATA_CONTRACT.md` |
| `node dev-tests/test-explore-fetcher.mjs` | **PASS** 42/42 | parser (CDATA, entities, description never read, empty, malformed, non-feed), education filter, dedupe, HTML stripped from titles, 5000-char title rejected, `http`, news-site host, look-alike host (`pib.gov.in.evil.example`), `javascript:` link, redirect to a non-allowlisted host, non-200, timeout, empty body, blocklist to `review-queue.json`, curated merge/removal, summary only on curated, rerun with same data writes nothing |
| `node dev-tests/test-explore-logic.mjs` | **PASS** 52/52 | filters (language, level, state, `"all"`, topics, empty prefs), placeholder hidden in prod, link safety, Today/Yesterday across month, year, leap-day boundaries, paging of 20, preferences (blocked storage, corrupt JSON, old and future schema), export/import code, grep-style scan: no `innerHTML`/`insertAdjacentHTML`/iframe/`eval` in `ui|bal|dal/explore` |
| `node dev-tests/test-explore-ui.mjs` | **PASS** 21/21 (jsdom) | tab click, arrow-key navigation, `aria-selected`, roving `tabindex`, hash and last-tab memory, picker, level required, 20 cards per batch, show more, end message, every link `https` + `_blank` + `noopener noreferrer`, unsafe-host and placeholder items hidden, deadline line, native `<details>` summary, corrupt prefs and offline do not throw |
| `npm run test:explore` | **PASS** | the three tests above |
| `npm run check:layers` | **PASS** | |
| `npm run check:sw` | **PASS** | 97 shell files (96 + `core/explore-tabs.js`), Explore files deliberately excluded |
| `npm run lint:i18n` | **PASS** | |
| `npm run check:cycles` | **FAIL (same as baseline)** | `diff` of the cycle list before and after: identical, no new cycle |
| `npm run test:engine`, `test:completeness`, `test:report-views` | **PASS** | unchanged |
| `npm run test:smart-plan` | **FAIL (same as baseline)** | `window is not defined`, not touched |
| `node --check sw.js` | **PASS** | syntax only |
| Workflow YAML parse (`yaml.safe_load`) | **PASS** | syntax only; the workflows themselves have NOT run (**NOT RUN**) |
| QA staging script run locally + served under `/student-insight/` | **PASS** | all key files return 200, `CNAME` returns 404, `qa-build.json` present |
| Live PIB fetch | **BLOCKED** | no DNS route to `pib.gov.in` in this chat |
| Service worker behaviour in a browser (stale-while-revalidate, 3-month trim) | **NOT RUN** | no browser; code reviewed only |
| Layout, dark mode, 380 px, screen reader | **NOT RUN** | no browser |

A real bug found by the tests and fixed: the blocklist matched substrings, so "Skilling" tripped "kill". It is now whole-word.
