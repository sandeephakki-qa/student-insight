# RUNBOOK: Explore

Paths are in the QA repo. "Run workflow" = GitHub → Actions → pick workflow → Run workflow.

- **Add a source.** Edit `data/explore/sources.json`: add an object (see `docs/explore/DATA_CONTRACT.md`). Put every host links may use in `domains`. For a feed, `type: "rss"`, `feedUrl` https on an allowed domain, and check the site's terms first. For a page without a feed, `type: "curated"`, `feedUrl: null`, and add items to `curated.json`. Run `npm run explore:validate`.
- **Disable a source.** Set `"enabled": false`. Its old items stay until they age out (12 months) or you delete them from the month file.
- **Edit curated items.** Edit `data/explore/curated.json`. Remove `"placeholder": true` when an item is real. `id` must be the first 16 hex chars of SHA-1 of the `url` (`node -e "console.log(require('crypto').createHash('sha1').update('URL').digest('hex').slice(0,16))"`). Then run `npm run explore:fetch -- --no-network` to merge into the month files and commit. Removed or changed-URL items disappear on the next merge.
- **Force a feed run.** Run workflow "Explore feed". Deploy QA follows automatically if it succeeded.
- **Roll back a bad feed commit.** `git revert <sha>` the `chore(explore): update feed ...` commit and push. Deploy QA runs on the push.
- **Where to read job summaries.** Actions → the run → Summary (per-source table). Logs show 20 raw items per source and every rejected item.
- **Review queue.** `data/explore/review-queue.json` lists titles held back by `scripts/explore/blocklist.json`. They are never shown. Delete an entry after you decide, or edit the blocklist.
- **Education filter.** `scripts/explore/keywords.json`. After the first real run, fix it using `docs/explore/PIB_FEED_NOTES.md`.
- **Reset the QA site.** Actions → Deploy QA → Run workflow. For a clean browser: site settings → clear storage, or unregister the service worker. To reset data: delete `data/explore/feed/*.json`, `index.json`, `status.json`, run "Explore feed".
- **Stop everything.** Set variable `EXPLORE_QA` to anything but `true`.
- **Publishing real items to production.** Production is a separate step the owner does by hand: copy `data/explore/` and the app files, bump `CACHE_VERSION` in `sw.js`, run `npm run gen:sw`. Not automated here.

## Courses, exams and the daily check
- **What "live" means here.** Every day the workflow `Explore feed` (02:17 UTC) does two things: (1) pulls PIB news, (2) visits each official site in `data/explore/exams.json` once (robots.txt respected, 2 s apart) and records: reachable or not, moved to another host, and whether the page content changed (hash only, no text copied). The app shows "Checked <date>", "Page changed <date>" (30 days), "Link not reachable" or "Site moved". Admission rules, cut-offs and dates are NOT copied: every course sends the student to the official site.
- **Add a course.** Edit `data/explore/courses.json`: `st` = `any` or a list of `pcm|pcb|commerce|arts`; `lv` = `after10|after12|graduation`; `tp` = `general|non-general`; `ex` = exam ids from `exams.json`.
- **Add an exam or state body.** Edit `data/explore/exams.json`: add the host to `hosts` (you are approving it), then the exam with `scope` `national` or `state` (state name must match `states.json`). Run `npm run explore:validate`.
- **Fix a broken link.** Read the daily summary table (Actions run, "Official links check"). Edit the `url` in `exams.json`.
- **Run the check by hand.** `npm run explore:check-links` (needs network).
- **Daily commit.** `linkstatus.json` is rewritten every day so its date proves the check ran, so you will see one small commit per day.

## Regional sources, private sources, and IP blocks
- **Language selects regional data.** Choosing a language in the header sets the Explore language and, when the language has one home state (e.g. Kannada = Karnataka), the Courses state. News then shows items in that language PLUS items tagged with the language's home states in any language (`LANGUAGE_REGIONS` in `bal/explore/feed-logic.js`).
- **Add a regional or state government feed.** In `sources.json` add a source with `language` (e.g. `kn`), `states` (e.g. `["Karnataka"]`), `domains`, `feedUrl`. Only add it after reading the site's terms. Items from it carry that language and state automatically.
- **Private sources (news sites, blogs).** Add only if the site publishes an RSS feed AND its terms allow showing headline + link. We store title, link and date only, never text or images, and the app always links out. No social media accounts, no scraping of pages without a feed. If a site's terms are unclear, do not add it.
- **IP blocks.** Many Indian government sites block overseas or cloud addresses, and GitHub's runners are overseas. If the job summary shows `ERROR` for such a source, the fix is to run the same scripts from an Indian address: a self-hosted GitHub runner on a machine or small server in India (`runs-on: self-hosted`), or run `npm run explore:fetch` yourself and push the data. Do not use proxies or tricks to hide the fetcher: the User-Agent stays honest and robots.txt stays respected.
