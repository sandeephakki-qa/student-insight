# Manual QA checklist (Step 10)

Run on the QA site at 380 px width, once in light and once in dark. Status in this chat: all **NOT RUN** (no browser). Tick on a real phone.

| # | Check | Status |
|---|---|---|
| 1 | First visit lands on Insight (Home), tabs "Insight" and "Explore" visible, no horizontal page scroll | NOT RUN |
| 2 | Tap Explore: first-run picker shows. Language, State (only if the feed has state items), Level, optional topics. Save needs a level | NOT RUN |
| 3 | After Save: chips show choices, cards appear, "Today"/"Yesterday"/dated headings | NOT RUN |
| 4 | Gear icon opens "Change choices"; Cancel returns to the feed | NOT RUN |
| 5 | Switch tabs both ways. Back button returns Explore to Insight. Hash is only `#insight` or `#explore` | NOT RUN |
| 6 | Reload on Explore keeps Explore; reload on Insight keeps Insight | NOT RUN |
| 7 | Airplane mode after visiting Explore once: saved items show with "Showing saved items" | NOT RUN |
| 8 | Airplane mode, Insight only: loads, Excel sample opens and analyses | NOT RUN |
| 9 | Corrupt prefs: in devtools set `studin.explore.prefs.v1` to the text `broken`, open Explore: picker shows, no error | NOT RUN |
| 10 | Very slow network (devtools "Slow 3G"): "Loading…" then cards; no blank screen | NOT RUN |
| 11 | 200 items: fill a month file with 200 items (QA copy), scroll: 20 per batch, smooth | NOT RUN |
| 12 | Keyboard only: Tab to tabs, Left/Right switches, Tab reaches gear, cards, links, summaries, "Show more"; focus ring visible | NOT RUN |
| 13 | Screen reader smoke test: tab names, "selected", live status messages, links read "(opens in a new tab)" | NOT RUN |
| 14 | Tap a card: official site opens in a NEW tab, StudIn tab stays | NOT RUN |
| 15 | Tap targets at least 44 px (tabs, gear, links, summaries, buttons) | NOT RUN |
| 16 | Insight after visiting Explore: upload a sample workbook, run analysis, open Dashboard, go to Explore and back to Insight: same dashboard step | NOT RUN |
| 17 | While "Run Analysis" is computing, the Explore tab does nothing (by design) | NOT RUN |
| 18 | QA ribbon shows commit short SHA and feed time; production site shows no ribbon and no Placeholder badges | NOT RUN |
