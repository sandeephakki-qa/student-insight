# Student Insight — Translation Reference (English source)

This file is NOT loaded by the app. It exists purely as a clean copy for
translators working on new languages beyond the 3 currently shipped
(English, Hindi draft, Kannada draft — see /i18n/en.json, hi.json, kn.json
in the actual app for the machine-readable versions).

To add a new language:
1. Copy /i18n/en.json to /i18n/<code>.json (e.g. ta.json for Tamil).
2. Translate every value EXCEPT keys starting with `_` and anything
   inside `{{double braces}}` (those are placeholders filled in by the
   app at runtime — e.g. `{{student}}`, `{{rank}}`, `{{count}}`).
3. Set `"_meta": {"lang":"<code>", "label":"<Language name in its own
   script>", "reviewed": false}` until a native speaker has checked it,
   then flip to `true`.
4. Add the language to the country→language dropdown mapping in
   index.html (see COUNTRY_LANGUAGES in js/state-nav.js).

## IMPORTANT — current scope limitation

This translation system currently only covers ~40 strings: the Smart
Reveal bucket screens and Smart Search feature. It does NOT yet cover:
- Setup / project creation forms
- FAQ / About pages
- Export / PDF generation screens
- Most Dashboard labels, table headers, button text outside buckets
- Error messages, toasts, validation text

Full extraction of every user-facing string in the app into this system
is a separate, larger task — not done as part of this initial i18n
infrastructure build. English remains the only complete language for
everything outside the ~40 keys below until that extraction happens.

## Current English source (mirrors /i18n/en.json exactly)

| Key | English |
|---|---|
| bucket_class_label | My Whole Class |
| bucket_class_desc | Overall average, trend, and class-wide patterns |
| bucket_student_label | One Student |
| bucket_student_desc | Look up any student by name |
| bucket_subject_label | One Subject |
| bucket_subject_desc | See how the whole class did in one subject |
| bucket_help_label | Who Needs Help |
| bucket_help_desc | Students who may need extra support |
| bucket_top_label | Top Performers |
| bucket_top_desc | Highest scorers and most improved |
| bucket_clusters_label | Performance Groups |
| bucket_clusters_desc | Cohort patterns found across average, consistency, trend and attendance |
| bucket_count_badge_one | ({{count}} found) |
| bucket_count_badge_other | ({{count}} found) |
| bucket_all_good | All good — no concerns here right now. |
| back | ← Back |
| finding_top_rank | {{student}} is ranked #{{rank}} in the class. |
| student_picker_prompt | Type a student's name to see their full report. |
| subject_picker_prompt | Pick a subject to see how the class did. |
| smart_search_title | Smart Search |
| smart_search_subtitle | Tap a question for a plain-language answer, computed from this class's data. Nothing here is sent anywhere — calculated on your device, same as the rest of the app. |
| smart_search_back | Back to Dashboard |
| smart_search_select_student | Select a student… |
| smart_search_student_label | Student |
| smart_search_ai_tooltip | AI feature — development in progress |
| smart_search_coming_soon | Coming soon |
| smart_search_select_first | Select a student first. |
| smart_search_load_error | Couldn't load Smart Search. Check your connection and try again. |
| smart_search_empty_title | Nothing to ask yet |
| smart_search_empty_sub | This section needs a bit more data before questions become available here. |
| individual_bucket_report_label | Progress Report |
| individual_bucket_report_desc | Overall summary, trend and where things stand |
| individual_bucket_subjects_label | Subjects & Marks |
| individual_bucket_subjects_desc | Test-by-test marks and subject breakdown |
| individual_bucket_plan_label | Recommendations |
| individual_bucket_plan_desc | What to focus on at home this week |
| individual_bucket_wellbeing_label | Wellbeing |
| individual_bucket_wellbeing_desc | Stress and engagement signals |
