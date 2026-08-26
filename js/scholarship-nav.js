// Task 07: Left-panel "Scholarship" nav entry — not-enabled feature-intro
// screen + routing into the enabled state (Task 08's real dashboard, a
// placeholder stub here — see studin-scholarship-discussion.md §28).
//
// Two responsibilities, kept separate from the pure-calc/report modules
// (scholarship-eligibility-engine.js / scholarship-report-views.js /
// scholarship-completeness-grid.js — Tasks 04-06, no DOM):
//   1. updateScholarshipNavVisibility() — show/hide the stepper item.
//      Fully hidden (not dimmed like "Insights") until a file is loaded,
//      reusing the exact same signal Current File Details already keys
//      off (APP.homeSingleFile / a valid compare section) rather than a
//      new one-off check.
//   2. renderScholarshipPanel() — builds #panel-scholarship content on
//      every goStep("scholarship") visit (same re-render-per-visit
//      pattern as renderHomePage()/renderBuckets(), so a language switch
//      elsewhere is picked up on next visit).
import { esc } from './app-utils-init.js';
import { srT } from './render-i18n.js';
import { renderScholarshipDashboard } from './scholarship-dashboard.js';
import { APP, goStep } from './state-nav.js';

function fileIsLoaded(){
  return !!(APP.homeSingleFile || (APP.compareMode && APP.sections && APP.sections.some(s => s.valid)));
}

function updateScholarshipNavVisibility(){
  const el = document.querySelector('.step-item[data-step="scholarship"]');
  if(el) el.classList.toggle("nav-file-loaded", fileIsLoaded());
}

function renderScholarshipPanel(){
  const panel = document.getElementById("panel-scholarship");
  if(!panel) return;
  const enabled = !!(APP.setup && APP.setup.scholarship && APP.setup.scholarship.enabled);
  panel.dataset.scholarshipState = enabled ? "enabled" : "not-enabled";

  const notEnabledEl = document.getElementById("scholarship-not-enabled");
  const enabledEl = document.getElementById("scholarship-enabled-placeholder");
  if(!notEnabledEl || !enabledEl) return;

  if(enabled){
    notEnabledEl.style.display = "none";
    enabledEl.style.display = "";
    // Task 08: real eligible-students dashboard (stat cards, tabs, table)
    // now built by renderScholarshipDashboard() — re-run on every visit,
    // same re-render-per-visit convention this file already documents at
    // the top, so results reflect the current file/criteria/language.
    renderScholarshipDashboard();
    return;
  }

  enabledEl.style.display = "none";
  notEnabledEl.style.display = "";
  notEnabledEl.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/></svg>'
    + '<div class="bucket-empty-title">' + esc(srT("scholarship_navpanel_notenabled_title")) + '</div>'
    + '<div class="bucket-empty-sub">' + esc(srT("scholarship_navpanel_notenabled_desc")) + '</div>'
    + '<button type="button" class="btn btn-primary btn-sm" style="margin-top:14px" data-action="goToScholarshipSetup">' + esc(srT("scholarship_navpanel_enable_btn")) + '</button>';
}

// Enable button: jump straight into the SETUP scholarship criteria form
// (Task 02's UI) — not a generic settings pointer. setup-wizard.js's own
// step-goto handles which SETUP sub-step the criteria fields live on;
// this just gets the user onto the Setup panel and scrolls the criteria
// block into view.
function goToScholarshipSetup(){
  goStep("setup");
  const target = document.getElementById("scholarship-setup-title") || document.getElementById("scholarship-enable");
  if(target && typeof target.scrollIntoView === "function"){
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export { fileIsLoaded, goToScholarshipSetup, renderScholarshipPanel, updateScholarshipNavVisibility };
