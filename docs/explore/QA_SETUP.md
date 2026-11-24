# QA setup (free, click by click)

## Choice and why
**Reuse the existing QA repository** `sandeephakki-qa/student-insight` (the README already lists `https://sandeephakki-qa.github.io/student-insight/` as QA, and `core/env-config.js` already detects QA from that host name). It is a separate repo, so the QA URL, Pages setting and base path (`/student-insight/`) are independent of production. Its `main` branch IS the QA branch. Production repo and `CNAME` are never touched: the deploy workflow removes `CNAME` from the QA artifact and fails if it is present.
Alternative (not chosen): a brand new repo such as `studin-pwa-qa`. Then add its host name to `core/env-config.js`, otherwise the app treats it as production (no ribbon, no placeholder items).

Base path is handled: `manifest.json` uses `start_url "."`, `sw.js` builds paths from its own scope, Explore uses relative URLs. Verified by serving the staged site under `/student-insight/`.

## One-time steps (QA repo, on github.com)
1. Copy this project's files (including `.github/workflows/`) into the QA repo and push to `main`. Do NOT copy `CNAME`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Repo **Settings → Secrets and variables → Actions → Variables tab → New repository variable**:
   - `EXPLORE_QA` = `true` (without it every QA workflow is skipped, so nothing runs by accident in production)
   - `EXPLORE_CONTACT` = your contact email or URL (goes into the User-Agent; a variable, not a secret)
4. Repo **Settings → Actions → General → Workflow permissions**: leave "Read repository contents" (the workflows request what they need).
5. **Actions → Explore feed → Run workflow** (once). Open the run, read the **Summary**: one row per source (`OK`, `ERROR`, `SKIPPED`).
6. **Actions → Deploy QA** runs after it (or run it by hand). Open the URL shown on the deploy job.
7. Phone: open `https://sandeephakki-qa.github.io/student-insight/`, tap Explore.

## Secrets
**None are needed.** No API keys, no tokens other than the automatic `GITHUB_TOKEN`.

## Branch protection (suggestion only, not done)
Settings → Branches → add a rule for `main`: "Require status checks to pass before merging", select `checks` from `ci.yml`. Note: the daily feed commit goes straight to `main` with the bot, so allow the GitHub Actions bot to bypass, or run the feed against a `qa-feed` branch instead.

## Action versions to review
`actions/checkout@v4.2.2`, `actions/setup-node@v4.4.0`, `actions/upload-artifact@v4.6.2`, `actions/configure-pages@v5.0.0`, `actions/upload-pages-artifact@v3.0.0`, `actions/deploy-pages@v4.0.5`. These full-version tags are from memory and could not be checked here (no network): confirm each exists, and pin to commit SHAs if you prefer.

## Free-tier hygiene
No matrix builds, `timeout-minutes` on every job, one scheduled run per day, no cache steps.

## After the first deploy: getting live data (checklist)
1. Actions tab: enable workflows if GitHub asks ("I understand my workflows, go ahead and enable them").
2. Run **Explore feed** (Run workflow). Open the run: the Summary shows the PIB table and the "Official links check" table.
3. A commit `chore(explore): update feed ...` appears on `main`. **Deploy QA** starts by itself afterwards (green check = site updated).
4. Reload the QA site twice (the service worker updates on the second load). The ribbon at the bottom-left shows the commit and "feed <time> UTC".
5. Every day at 02:17 UTC the same thing repeats. Nothing else to do.

### If something is red
| Symptom | Cause and fix |
|---|---|
| `Explore feed` skipped | Variable `EXPLORE_QA` is not exactly `true` (Settings, Secrets and variables, Actions, Variables). |
| `Deploy QA` fails at "Configure Pages" | Settings, Pages, Source is not "GitHub Actions". |
| `git push` denied | Settings, Actions, General, Workflow permissions: choose "Read and write permissions", Save. |
| Every PIB row `ERROR fetch failed` or 403 | The site blocks GitHub's overseas addresses. See "IP blocks" in `RUNBOOK.md` (self-hosted runner in India). |
| Some official links `ERROR` or `MOVED` | Wrong or changed URL in `data/explore/exams.json`. Fix the `url`. |
| Daily runs stop after weeks | GitHub pauses schedules on quiet public repos. Actions tab, enable the workflow again, or make any commit. |
