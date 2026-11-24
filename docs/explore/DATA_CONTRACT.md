# Explore data contract (schemaVersion 1)

Everything lives in `data/explore/` and is served as static files. Browsers only read these files; only GitHub Actions fetches from the sources.

## Files
| File | Written by | Purpose |
|---|---|---|
| `sources.json` | owner | Allowlist. Nothing outside it is ever fetched or linked. |
| `curated.json` | owner | Hand-written items (the only place a `summary` may exist). |
| `feed/YYYY-MM.json` | fetcher | One file per month, newest first. Last 12 months kept. |
| `index.json` | fetcher | `{ "updatedAt": "ISO-8601", "months": ["2026-11","2026-10"], "schemaVersion": 1 }` newest month first. |
| `status.json` | fetcher | Per-source `lastAttempt`, `lastSuccess`, `lastError`, `count`. |
| `review-queue.json` | fetcher | Items held back by `scripts/explore/blocklist.json`. Owner reviews. Never shown in the app. |

## feed/YYYY-MM.json
`{ "schemaVersion": 1, "month": "2026-11", "items": [ Item ] }`, items sorted as described under Item.

## sources.json
`{ "schemaVersion": 1, "sources": [ Source ] }`

Source: `id` (slug), `name`, `homepage` (https), `feedUrl` (https or `null`), `type` (`rss` | `curated`), `language` (`en`, `hi`, ...), `level` (array of tags), `domains` (array of host names links may use; a host matches if equal or a sub-domain), `termsNote`, `checkedOn` (YYYY-MM-DD), `enabled` (boolean).

`domains` is an addition to the brief: it makes the link allowlist explicit instead of guessing it from `homepage`.
Optional `filter`: `"education"` marks an all-topics feed (PIB) whose items must pass the education rule in `scripts/explore/keywords.json`.
Rules: an enabled `rss` source needs a `feedUrl`; `feedUrl` host must be in `domains`; `homepage` host must be in `domains`.

## Item (feed and curated)
```json
{ "id": "<16 hex chars, sha1 of the url>", "title": "...", "date": "YYYY-MM-DD",
  "checkedOn": "YYYY-MM-DD", "source": "PIB", "sourceId": "pib", "url": "https://...",
  "lang": "en", "states": ["all"], "levels": ["any"], "topics": ["policy"],
  "kind": "news", "summary": "" }
```
- `title`: plain text, 1 to 200 chars, no HTML.
- `url`: `https`, host in the `domains` of the item's `sourceId`. Never a news site or social repost.
- `summary`: only on curated items, max 300 chars, written by the owner. Auto-fetched items always have `""`.
- `lang`: language code the item is written in.
- `states`: `["all"]` or state names. The app has no state list today; the State picker offers the values found in the data (see HANDOVER, assumption A3).
- `levels`: any of `school` (up to 12th), `ug`, `pg`, `phd`, `any`.
- `topics`: any of `scholarship`, `exam`, `admission`, `policy`, `course`, `career`.
- `kind`: `deadline` | `notice` | `exam` | `news` | `career`.
- `checkedOn`: set when the item is first stored; not bumped on later runs (keeps diffs quiet).
- Curated only: optional `"placeholder": true`. The app hides placeholder items except in the QA build, where they get a badge. Validation does not fail on them.
- Dedupe by `id`. Curated wins over fetched on the same `id`.
- Order inside a month file: `date` descending, then `id` ascending (deterministic).
- Date is the UTC calendar date of the source's publish time (assumption A5).

## Validation (`npm run explore:validate`, no network)
Every file above against these rules: JSON parses, `schemaVersion` is 1, required fields present, enums valid, https, allowlisted host, length limits, no duplicate `id` inside a file, month in file name matches item dates, `index.json` months match the files present, `summary` empty on non-curated items.

## Fetch rules
1 request per source per run, sequential, 2 s pause, 15 s timeout, honest User-Agent, previous good data kept on any error, a failed source never fails the run. Only title, link and publish date are taken from a feed. Blocklist hits go to `review-queue.json`, not to the feed.
