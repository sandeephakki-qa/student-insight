# End-to-end QA report

Date: 2026-11-22. Environment: this chat only (Node 22, jsdom, no network, no browser). Labels: PASS / FAIL / BLOCKED / NOT RUN.

## Commands for you (QA repo)
1. Create/choose the QA repo (reuse `sandeephakki-qa/student-insight`). Push this project (with `.github/workflows/`, without `CNAME`) to `main`:
   `git remote add qa https://github.com/sandeephakki-qa/student-insight.git` then `git push qa HEAD:main`
2. GitHub → repo Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions → Variables: `EXPLORE_QA=true`, `EXPLORE_CONTACT=<your email or URL>`.
4. Actions → **Explore feed** → Run workflow. Read the Summary.
5. Actions → **Deploy QA** (runs after step 4 or on the push). Open the URL on the deploy job.
6. Phone: open `https://sandeephakki-qa.github.io/student-insight/`, tap **Explore**.

## Scenarios (from Step 10)
| Scenario | Result |
|---|---|
| First-run picker | PASS in jsdom; NOT RUN on a device |
| Change choices | NOT RUN (logic covered by jsdom/unit tests: PASS) |
| Tab switch | PASS in jsdom; NOT RUN on a device |
| Back button | NOT RUN (hash logic written; jsdom does not exercise browser history) |
| Reload keeps tab | NOT RUN |
| Explore offline | NOT RUN (service worker not run in a browser) |
| Insight offline | NOT RUN (Insight precache list unchanged apart from +1 tiny file; `check:sw` PASS) |
| Explore with corrupt prefs | PASS in jsdom and unit test |
| Very slow network | NOT RUN |
| 200 items | NOT RUN (batching of 20 PASS in unit test) |
| Keyboard-only | PARTIAL: arrow keys on tabs PASS in jsdom; rest NOT RUN |
| Screen-reader smoke test | NOT RUN |
| Link opens new tab, old tab stays | NOT RUN; attributes `target=_blank rel="noopener noreferrer"` PASS in jsdom |
| Excel upload and analysis after visiting Explore | NOT RUN |
| Live PIB fetch | BLOCKED |
| Workflows on GitHub | NOT RUN |
| 380 px layout, light and dark | NOT RUN |

## First-run checklist on the real QA site
1. Open the **Explore feed** run summary: is `pib-hi` `OK`? Is `pib` (English, `Lang=1`) `OK` or `ERROR HTTP ...`? If English fails, find the right feed on `https://www.pib.gov.in/ViewRss.aspx`, edit `feedUrl` in `sources.json`.
2. In the log, copy the `fields seen:` line and the 20 `raw N:` lines into `docs/explore/PIB_FEED_NOTES.md`. Adjust `ministryHintTags` and `titleKeywords` in `scripts/explore/keywords.json` until the kept/not-education counts look right. Check `review-queue.json`.
3. Open Explore on the phone: items appear (placeholders have a "Placeholder" badge on QA only). Tap a card: opens the official site in a new tab.
4. Open Insight: upload a sample workbook, run analysis. Nothing changed.
5. Confirm the ribbon shows the commit SHA and feed time, and that production (`studin.in`) shows neither ribbon nor placeholders.
