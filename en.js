/* ════════════════════════════════════════════════════════════════════
   STUDENT INSIGHT — LANGUAGE FILE: English (master key list)
   ════════════════════════════════════════════════════════════════════
   This is the master list every other language file (kn.js, hi.js, ...)
   must mirror key-for-key. Loaded via a plain <script> tag (not fetch),
   so the app works identically whether it's hosted on a server or just
   opened as a local file — no CORS/file:// issues either way.

   HOW TO ADD A NEW LANGUAGE:
   1. Copy this file to lang/kn.js (or hi.js, etc).
   2. Change the variable name below to SI_LANG_KN (uppercase language
      code) and translate every value — leave every {placeholder} token
      exactly as-is; the app fills those in at runtime.
   3. Add a <script src="lang/kn.js"></script> tag next to this one in
      index.html's <head>, and add the language to the LANG_DICTS map
      and the switcher dropdown (search "LANG_DICTS" and "lang-switcher"
      in the main script).
   4. Do NOT translate developer-facing content: the PIB comment block,
      code comments, or console.error() messages — only what a teacher/
      parent/student actually sees.

   NOTE ON SCOPE (v1.8 Phase A): this file currently covers the Home
   panel and the Setup panel's action bar only — a representative slice
   proving the mechanism end-to-end, not full app coverage yet. See
   /Localization_Plan.md §4 Phase A step 1-2 for the plan to extend this
   to every panel, toast, and validation message. Extending coverage
   means: (a) add the new key here, (b) add data-i18n="that.key" to the
   matching HTML element (or, for JS-built strings, replace the literal
   with t("that.key")), (c) call applyI18n() again if it's added to
   content rendered after page load.
   ════════════════════════════════════════════════════════════════════ */
window.SI_LANG_EN = {
  // ── Home panel — hero ──
  "home.hero.badge": "Privacy First • Browser Based • No Student Data Uploaded",
  "home.hero.title": "Transform Student Marks into Actionable Insights",
  "home.hero.subtitle": "Student Insight helps teachers and schools transform assessment data into meaningful insights. Upload marks, identify learning gaps, detect at-risk students, monitor academic progress, and generate actionable reports — all securely within your browser.",

  // ── Home panel — "New Project" path ──
  "home.newproject.title": "New Project",
  "home.newproject.desc": "First time? Set up your details, subjects & tests. Download a ready-to-fill Excel template, fill it offline, then import to analyse.",
  "home.newproject.btn": "➕ Setup & Generate Template",
  "home.newproject.steps": "Step 1 of 2 — Setup → Download template → Fill marks in Excel → Import & Analyse",

  // ── Home panel — "Import Filled Excel" path ──
  "home.import.title": "Import Filled Excel",
  "home.import.desc": "Already have a filled Excel file? Import it directly — setup details, students & marks are all read automatically.",
  "home.import.btn": "📤 Import Excel (.xlsx)",
  "home.import.hint": "Requires a 2-tab Excel workbook: SETUP · MARKS+CONTEXT. CSV is not supported here — use the \"Upload Data\" step if you only have a marks CSV.",

  // ── Home panel — "Compare Sections / Batches" path ──
  "home.compare.title": "Compare Sections / Batches",
  "home.compare.desc": "Managing more than one class or batch — Class 5-A/B/C, UPSC Batch A/B, anything? Upload each section's filled sheet and see them ranked and charted side by side. Institution mode only.",
  "home.compare.btn": "🏫 Compare Sections →",

  // ── Home panel — "How it works" ──
  "home.howitworks.title": "How it works",
  "home.step1.title": "1. Setup",
  "home.step1.desc": "Enter your details, subjects, tests & max marks. Takes 2 minutes.",
  "home.step2.title": "2. Download Template",
  "home.step2.desc": "Get a pre-built Excel with your subjects & tests. Fill student marks offline.",
  "home.step3.title": "3. Import & Analyse",
  "home.step3.desc": "Upload the filled Excel. AI instantly computes ranks, trends, flags & narratives.",
  "home.step4.title": "4. Export Reports",
  "home.step4.desc": "Download per-student PDFs, class dashboard & ZIP bundle — ready to share.",
  "home.stateless.note": "🔒 <strong>Stateless by design.</strong> Close the tab and everything is gone — your Excel is the permanent record. Student Insight is the intelligence engine, not a data store.",

  // ── Setup panel — action bar ──
  "setup.title": "⚙️ Step 1 · Setup",
  "setup.subtitle": "Configure your institution, academic year, class, subjects and assessment details before importing student data.",

  // ── Example dynamic-message templates (bucket 2 — see Localization_Plan.md §2).
  //    Not yet wired into the JS toast calls; included here to show the
  //    {placeholder} convention those will follow once extended. ──
  "toast.dupe_file": "{filename} was already uploaded for this comparison. Remove it first if you want to re-add it.",
  "toast.new_file_cleared_analysis": "New file loaded — previous analysis cleared. Run Analysis again to see updated results."
};
