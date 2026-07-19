
/* ════ APP STATE ════ */
const APP={currentStep:"home",setup:{mode:"institution",modeLocked:false,instName:"",instType:"",location:"",contact:"",className:"",section:"",year:"",teacher:"",scoring:{marks:true,pct:true,grade:false,pf:false},passThreshold:35,absentAlert:3,dropAlert:20,subjects:[],tests:[]},rawData:null,students:[],classStats:null,genderAnalysis:null,filter:"all",sort:"rank",aiFeatures:new Set(),individualSelectedId:null,
  // mergeSource holds the already-filled MARKS+CONTEXT sheet (header row +
  // real student rows, as plain arrays) when the teacher loads an existing
  // workbook via "Update Existing Sheet" on the Setup step. When set,
  // generateTemplate() appends new-test columns onto these exact rows
  // instead of building a fresh 5-sample-row workbook — see
  // generateMergedTemplate() for why this exists: the plain "Download
  // Template" button always regenerates from scratch and has no way to
  // know a previous file's marks should be preserved.
  mergeMode:false,mergeSource:null,_pendingMerge:null,
  // ── COMPARE SECTIONS MODE (Institution only) ──
  // compareMode: entered by dropping 2+ files on Home's single upload
  // zone (no dedicated "Compare" entry point anymore — v3.1). sections[]
  // holds one entry per uploaded section/batch file: {id,fileName,rawData,
  // label,valid,errors,rowCount,students,classStats,genderAnalysis,dataIssues}.
  // sectionComparison is the computed cross-section ranking/aggregate built
  // by computeSectionComparison() once every valid section has been analysed.
  compareMode:false,sections:[],sectionComparison:[],
  // ── HOME SINGLE-FILE CARD ── the non-compare-mode counterpart to
  // sections[] above: set once a lone Home upload passes validation, so
  // renderHomeFileList() can show the same "here's what's uploaded, ✕ to
  // remove it before running" card whether it's 1 file or several.
  homeSingleFile:null
  ,setupWizardStep:1  // 1–4, session-only
};
let _charts={},subjectCount=0,testCount=0,_unsaved=false,_compareSectionSeq=0;

/* ════ THEME TOGGLE ════ */
function setThemeChoice(choice){
  // choice: 'light' | 'dark'. Only persists the choice itself (a UI
  // preference), never any student data — consistent with the
  // NO_PERSISTENCE rule elsewhere in this app.
  document.documentElement.setAttribute('data-theme',choice);
  try{localStorage.setItem('si-theme-choice',choice);}catch(e){}
  $('.theme-btn').attr('aria-pressed','false');
  $('.theme-btn[data-theme-choice="'+choice+'"]').attr('aria-pressed','true');
  // Charts read colors from computed CSS custom properties at render time
  // (see renderCharts()), so re-render whichever chart canvases currently
  // exist to pick up the new theme's colors immediately rather than only
  // on next navigation.
  if(typeof renderCharts==='function' && $('#chart-subject-avg').length && $('#panel-dashboard').is(':visible')){
    try{renderCharts();}catch(e){}
  }
}
function initThemeToggle(){
  var saved='light';
  try{ var t=localStorage.getItem('si-theme-choice'); if(t==='light'||t==='dark') saved=t; }catch(e){}
  $('.theme-btn').attr('aria-pressed','false');
  $('.theme-btn[data-theme-choice="'+saved+'"]').attr('aria-pressed','true');
}

/* ════ NAV ════ */
function goStep(step){
  // v3.0 rev2 (BUILD spec §10.1/§10.3): the old "data"/Upload Data step no
  // longer exists. collectSetupForm() (Setup form → shared schema, for the
  // non-Compare "fill the form first" flow) doesn't need a call here —
  // runAnalysis() already does it safely, gated on whether the Setup
  // form's own subject rows actually have anything in them (see
  // domSubjects.length there), which correctly no-ops for Home's
  // autoInferSetup()-driven single-file flow instead of overwriting it.
  // v3.7: Setup / Sample Files / About / FAQ are Home-only side-paths —
  // once the user has moved on to Dashboard/Export, jumping into any of
  // them mid-review just adds clutter/confusion (per Sandy). Block the
  // jump and explain why instead of silently navigating; the nav items
  // themselves also get a "disabled" look + tooltip via
  // updateNavHomeOnlyState() below so this rarely even gets clicked.
  if((APP.currentStep==="dashboard"||APP.currentStep==="export")&&(step==="setup"||step==="about"||step==="faq")){
    toast("Available only from the Home screen.","warn");
    return;
  }
  if(step==="ai"&&!APP.compareMode&&!APP.rawData){toast("Upload a file on Home first.","warn");return;}
  if(step==="ai"&&APP.compareMode&&APP.sections.filter(s=>s.valid).length<1){toast("Upload at least 1 valid file on Home first.","warn");return;}
  if((step==="dashboard"||step==="export")&&!APP.compareMode&&!APP.students.length){toast("Run Analysis first.","warn");return;}
  if((step==="dashboard"||step==="export")&&APP.compareMode&&!APP.sections.some(s=>s.valid&&s.students&&s.students.length)){toast("Run Analysis first.","warn");return;}
  APP.currentStep=step;
  $(".panel").removeClass("active");$("#panel-"+step).addClass("active");
  $(".step-item").removeClass("active").removeAttr("aria-current");$("[data-step='"+step+"']").addClass("active").removeClass("locked").attr("aria-current","step");
  updateNavHomeOnlyState();
  if(step==="dashboard"){
    if(APP.compareMode){
      populateCompareSectionPicker();
      // BUILD spec §3: default landing selection is the first uploaded
      // file's own result, never the Compare overview, even when Compare
      // is available — Compare stays opt-in via the dropdown.
      const firstValid=APP.sections.find(s=>s.valid&&s.students);
      selectCompareView(firstValid?firstValid.id:"__overview__");
    }
    else renderBuckets();
  }
  if(step==="export"){
    if(APP.compareMode){populateExportSectionPicker();}
    else $("#exp-count").text(APP.students.length);
  }
  if(step==="home")renderHomePage();
  if(step==="setup"){ if(typeof swGoto==="function") swGoto(APP.setupWizardStep||1); }
}
// v3.7: Setup/Sample Files/About/FAQ nav items only make sense from Home
// — visually flags them as unavailable elsewhere (dim + not-allowed
// cursor) and swaps in an explanatory tooltip, so the disabled state is
// discoverable on hover instead of only showing up as a toast on click.
function updateNavHomeOnlyState(){
  const lockAux=(APP.currentStep==="dashboard"||APP.currentStep==="export");
  $(".nav-home-only").toggleClass("disabled",lockAux).attr("aria-disabled",lockAux?"true":"false").attr("tabindex",lockAux?"-1":"0").attr("title",lockAux?"Available only from the Home screen":"");
}

// PHASE 3 — Only India is active right now; other countries are listed
// but disabled ("coming soon") in the dropdown, per explicit direction.
// All 13 Indian languages now have real (AI-draft, unreviewed) i18n/
// files with exact key parity to en.json (verified). ur.json is RTL
// script — the app has no dir="rtl" layout support yet, so Urdu text
// will render but surrounding UI won't mirror; a real follow-up item.
const COUNTRY_LANGUAGES = {
  IN: { label:"India", defaultLang:"en", languages:[
    {code:"en",label:"English"},{code:"hi",label:"हिन्दी (Hindi)"},{code:"kn",label:"ಕನ್ನಡ (Kannada)"},
    {code:"ta",label:"தமிழ் (Tamil)"},{code:"te",label:"తెలుగు (Telugu)"},{code:"mr",label:"मराठी (Marathi)"},
    {code:"bn",label:"বাংলা (Bengali)"},{code:"gu",label:"ગુજરાતી (Gujarati)"},{code:"ml",label:"മലയാളം (Malayalam)"},
    {code:"pa",label:"ਪੰਜਾਬੀ (Punjabi)"},{code:"or",label:"ଓଡ଼ିଆ (Odia)"},{code:"as",label:"অসমীয়া (Assamese)"},
    {code:"ur",label:"اردو (Urdu)"}
  ]},
  US: { label:"United States", defaultLang:"en", languages:[{code:"en",label:"English"}] },
  GB: { label:"United Kingdom", defaultLang:"en", languages:[{code:"en",label:"English"}] },
  AE: { label:"UAE", defaultLang:"en", languages:[{code:"en",label:"English"},{code:"ur",label:"اردو (Urdu)"}] },
  SG: { label:"Singapore", defaultLang:"en", languages:[{code:"en",label:"English"},{code:"ta",label:"தமிழ் (Tamil)"}] },
  AU: { label:"Australia", defaultLang:"en", languages:[{code:"en",label:"English"}] },
  CA: { label:"Canada", defaultLang:"en", languages:[{code:"en",label:"English"}] }
};
const DEFAULT_COUNTRY = "IN";

function populateCountryDropdown(){
  const sel = $("#country-select");
  if(!sel.length) return;
  // Only India is offered as a selectable option — the other countries in
  // COUNTRY_LANGUAGES are NOT rendered into the <select> at all. An
  // earlier version tried native <option disabled> instead, but that
  // styling is too subtle in some browsers/OS combos to read as
  // "disabled" at a glance — this is the unambiguous fix: if it's not in
  // the list, it can't be picked, full stop. The other countries stay
  // defined in COUNTRY_LANGUAGES (unused for now) so re-enabling one
  // later is just adding it back into this .filter().
  const active = Object.entries(COUNTRY_LANGUAGES).filter(([code])=>code===DEFAULT_COUNTRY);
  sel.html(active.map(([code,c])=>
    `<option value="${code}" selected>${esc(c.label)}</option>`
  ).join(""));
  $("#i18n-more-countries-note").remove();
  sel.after(`<span id="i18n-more-countries-note" style="font-size:11px;color:var(--c-text2);align-self:center">more countries coming soon</span>`);
  populateLanguageDropdown(DEFAULT_COUNTRY);
}
function populateLanguageDropdown(countryCode){
  const country = COUNTRY_LANGUAGES[countryCode] || COUNTRY_LANGUAGES[DEFAULT_COUNTRY];
  const sel = $("#language-select");
  if(!sel.length) return;
  sel.html(country.languages.map(l=>
    `<option value="${l.code}" ${l.code===country.defaultLang?"selected":""}>${esc(l.label)}</option>`
  ).join(""));
}
function onCountryChange(countryCode){
  populateLanguageDropdown(countryCode);
  const country = COUNTRY_LANGUAGES[countryCode] || COUNTRY_LANGUAGES[DEFAULT_COUNTRY];
  loadLanguage(country.defaultLang);
}
function onLanguageChange(langCode){
  loadLanguage(langCode);
}

