# PIB feed notes

Status: **NOT RUN**. This chat has no route to `pib.gov.in` (`curl: (6) Could not resolve host`, and the fetcher logged `fetch failed`), so no real PIB item has been inspected.

## What the code assumes (all UNVERIFIED until the first Actions run)
- Hindi feed `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3` exists (from the brief, verified there).
- English feed is `Lang=1` (UNVERIFIED). If it returns non-200, `pib` shows `ERROR` in the job summary and nothing breaks.
- Items are standard RSS `<item>` with `<title>`, `<link>`, `<pubDate>`.
- Where the ministry name sits is unknown. The filter reads the values of `category`, `dc:subject`, `author`, `source` tags (`ministryHintTags` in `scripts/explore/keywords.json`) and compares them with `ministries`. If none exists, the title keyword rule (`titleKeywords`) alone decides.

## Current education rule (`scripts/explore/keywords.json`)
Keep an item when a hint tag equals "Ministry of Education" (or "Ministry of Skill Development and Entrepreneurship"), OR the title contains one of `titleKeywords` as a whole word/phrase (case-insensitive). Everything else is dropped. Blocklist hits are never published; they go to `review-queue.json`.

## First run: what to do
1. Run workflow `explore-feed.yml` once (see `QA_SETUP.md`).
2. Open the job log. For each source the fetcher prints `fields seen: ...` and 20 lines `raw N: {title, link, pubDate, hints}`.
3. Paste the real field names here, then:
   - if the ministry shows up in a tag, put that tag name in `ministryHintTags`;
   - if it only shows up in the title, tighten `titleKeywords`;
   - check that links are on `pib.gov.in` (host rule rejects anything else).
4. Re-run. Check the job summary table (kept / not education / rejected).

## Observed field names
(to be filled after the first real run)
