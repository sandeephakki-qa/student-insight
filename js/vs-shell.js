/* ============================================================
   Student Insight — VS-Style Shell engine
   (vs-shell-plan-v2.md Task 3 skeleton + Task 7 session state)
   Replaces the scrapped js/app-shell.js. Same setLeftRail()/
   setRightRail() contract the old shell used, new correctly-built
   implementation underneath: fixed-position left/right panels,
   resizable by dragging a divider, collapsible/expandable — not true
   drag-to-anywhere docking (confirmed out of scope).

   Task 4/5/6 (real panel content) not started — blocked on the
   missing shell-redesign-plan.md §4.1-§4.3 key lists. This file
   doesn't know or care what content setLeftRail()/setRightRail() are
   called with once that lands.
============================================================ */

(function(){

  const MIN_W = 160, MAX_W = 420, COLLAPSED_W = 28;
  // vs-shell-plan-v2 Task 8: on first load, mobile (<=768px) starts
  // collapsed (info strip / bottom pill) so the sheet doesn't cover the
  // screen by default; desktop's default (expanded) is unchanged from
  // Task 3 — this only affects the *initial* value, still overridable
  // by the user via vsShellToggle() same as before.
  const mobileDefault = (typeof window !== "undefined" && window.innerWidth <= 768);
  // vs-shell-plan-v2 Task 7: session-persistent (in-memory only,
  // NO_PERSISTENCE — resets on reload) panel state, promoted from a
  // closure-local var to APP.shellState so it's inspectable the same
  // way other app state is. Survives Home -> Setup -> Dashboard
  // navigation because #app-shell-body itself is never torn down.
  if(typeof window !== "undefined" && !window.APP) window.APP = {};
  if(typeof window !== "undefined" && !APP.shellState){
    APP.shellState = {
      start: { width: 240, collapsed: mobileDefault },
      end:   { width: 240, collapsed: mobileDefault }
    };
  }
  const state = (typeof window !== "undefined") ? APP.shellState : {
    start: { width: 240, collapsed: false },
    end:   { width: 240, collapsed: false }
  };

  function root(){ return document.getElementById("app-shell-body"); }

  function applyWidth(side){
    const el = root();
    if(!el) return;
    const s = state[side];
    const px = s.collapsed ? COLLAPSED_W : s.width;
    el.style.setProperty(`--panel-${side}-width`, px + "px");
  }

  function setLeftRail(html){
    const el = document.getElementById("shell-rail-start");
    if(el) el.innerHTML = html || "";
  }
  function setRightRail(html){
    const el = document.getElementById("shell-rail-end");
    if(el) el.innerHTML = html || "";
  }

  function syncPanelDOM(side){
    const s = state[side];
    const panel = document.getElementById(`shell-panel-${side}`);
    const btn = document.getElementById(`shell-panel-${side}-toggle`);
    if(panel) panel.dataset.collapsed = s.collapsed ? "true" : "false";
    if(btn){
      btn.setAttribute("aria-expanded", s.collapsed ? "false" : "true");
      btn.setAttribute("aria-label", s.collapsed ? "Expand panel" : "Collapse panel");
    }
  }

  function vsShellToggle(side){
    const s = state[side];
    s.collapsed = !s.collapsed;
    syncPanelDOM(side);
    applyWidth(side);
  }
  // ui-prompt-batch2.md item 1: explicit open/close for BOTH sides at
  // once — the manual per-side vsShellToggle() above stays as-is for the
  // chevron click; this is the programmatic "car-mirror" trigger tied to
  // dashboard mode (Smart bucket dashboard vs Classic), not a third
  // mechanism. Reuses the exact same state/transition, just sets rather
  // than flips.
  function setShellRailsOpen(open){
    ["start","end"].forEach(function(side){
      state[side].collapsed = !open;
      syncPanelDOM(side);
      applyWidth(side);
    });
  }
  window.setShellRailsOpen = setShellRailsOpen;
  // exposed for the onclick="" handlers in index.html
  window.vsShellToggle = vsShellToggle;
  window.setLeftRail = setLeftRail;
  window.setRightRail = setRightRail;

  function initDivider(dividerId, side){
    const divider = document.getElementById(dividerId);
    if(!divider) return;
    let dragging = false, startX = 0, startW = 0;

    // inline-start/end aware: for the start-side panel, dragging toward
    // the core (inline-end) should shrink it; for the end-side panel,
    // dragging toward the core (inline-start) should shrink it. Reading
    // getComputedStyle direction per-drag (rather than assuming ltr)
    // keeps this correct under [dir="rtl"] without a duplicate code path.
    function dirSign(){
      return getComputedStyle(document.documentElement).direction === "rtl" ? -1 : 1;
    }

    function onPointerDown(e){
      if(state[side].collapsed) return;
      dragging = true;
      startX = e.clientX;
      startW = state[side].width;
      divider.classList.add("shell-divider-active");
      root() && root().classList.add("shell-no-anim");
      divider.setPointerCapture && divider.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e){
      if(!dragging) return;
      const raw = e.clientX - startX;
      const delta = side === "start" ? raw * dirSign() : -raw * dirSign();
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
      state[side].width = next;
      applyWidth(side);
    }
    function onPointerUp(e){
      if(!dragging) return;
      dragging = false;
      divider.classList.remove("shell-divider-active");
      root() && root().classList.remove("shell-no-anim");
      divider.releasePointerCapture && divider.releasePointerCapture(e.pointerId);
    }

    divider.addEventListener("pointerdown", onPointerDown);
    divider.addEventListener("pointermove", onPointerMove);
    divider.addEventListener("pointerup", onPointerUp);
    divider.addEventListener("pointercancel", onPointerUp);

    // keyboard resize for the same divider (role="separator"), 10px steps
    divider.addEventListener("keydown", function(e){
      if(state[side].collapsed) return;
      let step = 0;
      if(e.key === "ArrowLeft") step = -10;
      else if(e.key === "ArrowRight") step = 10;
      else return;
      e.preventDefault();
      const sign = side === "start" ? dirSign() : -dirSign();
      state[side].width = Math.min(MAX_W, Math.max(MIN_W, state[side].width + step * sign));
      applyWidth(side);
    });
  }

  function initShell(){
    syncPanelDOM("start");
    syncPanelDOM("end");
    applyWidth("start");
    applyWidth("end");
    initDivider("shell-divider-start", "start");
    initDivider("shell-divider-end", "end");
    // Item 2 fix (ui-prompt-template.md §4.1): the rails weren't showing
    // any text on Home. goStep("home") already calls
    // renderShellLeftRail()/renderShellRightRail(), but that boot call
    // happens from app-utils-init.js — an earlier <script> tag than this
    // file — so if it ever runs before vs-shell.js has finished loading,
    // those two functions are still undefined and the call is silently
    // skipped (goStep()'s own typeof guard). Re-render explicitly here,
    // once this file is guaranteed loaded, as a safety net — harmless if
    // goStep() already succeeded (just a redundant re-render of the same
    // content), fixes it if goStep() silently no-op'd.
    if(typeof renderShellLeftRail === "function") renderShellLeftRail((window.APP && APP.currentStep) || "home");
    if(typeof renderShellRightRail === "function") renderShellRightRail((window.APP && APP.currentStep) || "home");
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initShell);
  } else {
    initShell();
  }

  /* ==========================================================
     Task 4 — Left panel: real content, real i18n.
     VS-Properties-panel style key/value rows. Reads the exact same
     APP.setup/APP.students/APP.sections/APP.homeSingleFile fields
     Setup/Home already display — no new state, no duplicate counters.
     Per shell-redesign-plan.md §2 Phase 2's content table (kept as
     the content mapping even though that file's *layout* phases are
     superseded): Home/About/FAQ show the empty state; Setup/AI/
     Dashboard/Export show file context; Dashboard adds the class/
     section label.
     ========================================================== */
  function row(label, value){
    return '<div class="shell-kv-row"><div class="shell-kv-label">'
      + esc(label) + '</div><div class="shell-kv-value">' + esc(value) + '</div></div>';
  }

  function renderShellLeftRail(step){
    if(typeof srT !== "function" || typeof APP === "undefined"){ return; } // guards early boot ordering
    const contextSteps = { setup:1, ai:1, dashboard:1, export:1 };
    if(!contextSteps[step]){
      // ui-prompt-template.md item 3: Home gets a light "what this app
      // does" teaser instead of the plain empty state; About/FAQ (and any
      // other non-context step) keep the original empty state unchanged —
      // item 3 is scoped to Home only.
      if(step === "home"){
        const bullets = [1,2,3,4,5,6].map(function(n){
          return "<li>" + esc(srT("shell_home_left_pitch_" + n)) + "</li>";
        }).join("");
        setLeftRail('<ul class="shell-pitch-list">' + bullets + '</ul>');
      } else {
        setLeftRail('<div class="shell-empty-state">' + esc(srT("shell_left_no_file")) + '</div>');
      }
      return;
    }
    const isMulti = !!APP.compareMode;
    const countLabel = isMulti ? srT("shell_left_multi_file") : srT("shell_left_single_file");
    const fileName = isMulti
      ? "(" + (APP.sections ? APP.sections.length : 0) + ")"
      : (APP.homeSingleFile && APP.homeSingleFile.fileName) || "—";
    const fileValue = fileName + " · " + countLabel;
    const orgValue = (APP.setup && APP.setup.instName) || "—";
    const recordCount = (APP.students && APP.students.length) || 0;

    let rows = ""
      + row(srT("shell_left_file_label"), fileValue)
      + row(srT("shell_left_org_label"), orgValue)
      + row(srT("shell_left_records_label"), recordCount);

    if(step === "dashboard"){
      const classLabel = [APP.setup && APP.setup.className, APP.setup && APP.setup.section]
        .filter(Boolean).join(" ");
      if(classLabel) rows += row(srT("shell_left_org_label"), classLabel);
    }
    // item 6: wrap in a native <details> — collapsed by default, no new
    // JS needed for the expand/collapse itself.
    let html = '<details class="shell-details"><summary class="shell-panel-title" style="cursor:pointer">'
      + esc(srT("shell_left_file_details_title")) + '</summary>' + rows + '</details>';
    // item 7 (ui-prompt-template.md §4.2): Dashboard's left rail also gets
    // the persistent controls list — Institution + non-Compare mode only
    // (PIB §9 smart-reveal-scope; Individual mode falls straight through
    // to the legacy dashboard body and doesn't use this rail-driven
    // system, so it keeps the plain File-details-only rail above).
    if(step === "dashboard" && APP.setup && APP.setup.mode !== "individual" && !APP.compareMode
       && typeof buildDashboardControlsHtml === "function"){
      html += buildDashboardControlsHtml();
    }
    // §6 resolved open question: Compare Mode keeps its two export cards
    // SEPARATE (not folded into one button) — surfaced as their own small
    // rail here, since Compare Mode otherwise has no rail content at all.
    if(step === "dashboard" && APP.compareMode && typeof buildCompareExportControlsHtml === "function"){
      html += buildCompareExportControlsHtml();
    }
    setLeftRail(html);
  }
  window.renderShellLeftRail = renderShellLeftRail;

  /* ==========================================================
     Task 5 — Right panel: non-Dashboard phases.
     Every action below maps to an existing function — no new business
     logic, per vs-shell-plan-v2.md Task 5. Dashboard's right panel
     (Smart Query v2) is Task 6, not started — this function does
     nothing on step==="dashboard" so Task 6 has an empty rail to fill.

     Deviation from shell-redesign-plan.md §4.2: no "Continue" action
     is wired for the AI panel. That key assumed AI Features was still
     an interactive picker; it was converted to a passive, non-
     interactive progress screen in v3.2 (see index.html ~1456) —
     analysis is always triggered from Home's own Run Analysis button,
     so there is nothing for a Continue button on this panel to do.
     shell_right_continue was therefore not added to i18n; the
     "Selected features" count is still real and useful, so that part
     of Task 5 is done for the AI panel, the button part is not.
     ========================================================== */
  function actionBtn(label, onclick){
    return '<button type="button" class="btn btn-secondary btn-sm shell-action-btn" onclick="'
      + onclick.replace(/"/g,"&quot;") + '">' + esc(label) + '</button>';
  }

  function renderShellRightRail(step){
    if(typeof srT !== "function" || typeof APP === "undefined"){ return; }
    let html = "";
    if(step === "home"){
      const bullets = [1,2,3,4,5,6].map(function(n){
        return "<li>" + esc(srT("shell_home_right_pitch_" + n)) + "</li>";
      }).join("");
      html += '<ul class="shell-pitch-list">' + bullets + '</ul>';
    }
    else if(step === "setup"){
      const n = APP.setupWizardStep || 1;
      html += row(srT("shell_right_step_progress", {n: n}), "");
      html += actionBtn(srT("shell_right_download_template"), "generateTemplate()");
    }
    else if(step === "ai"){
      const count = (APP.aiFeatures && APP.aiFeatures.size) || 0;
      html += row(srT("shell_right_selected_features"), count);
    }
    else if(step === "export"){
      // hasIssues mirrors updateExportGate() exactly (render-dashboard.js
      // ~1292) — re-derived here too, not cached, same EXPORT_GATE rule.
      const hasIssues = !!(APP.dataIssues && APP.dataIssues.length);
      html += row(srT("shell_right_exports_ready"), hasIssues ? "—" : String(APP.students ? APP.students.length : 0));
      if(hasIssues){
        // Same wording as updateExportGate()'s "reason" var — kept in
        // English there today (pre-existing, not an i18n gap this task
        // introduced), duplicated verbatim here rather than invented.
        html += '<div class="shell-empty-state">Fix the data quality issues shown on the Dashboard, then re-import, before exporting.</div>';
      } else {
        // ui-prompt-batch2.md item 2: choices are back, in the rail
        // specifically (§6's "no choice" rule superseded for this control
        // only — the center-panel button/left-rail placement from §6 are
        // unaffected). Per-student selection is genuinely new (no prior
        // equivalent existed) — see js/export-pdf.js generateAllPDFs()
        // for the filtering this feeds.
        const students = APP.students || [];
        const isIndividual = APP.setup && APP.setup.mode === "individual";
        const studentRows = students.map(function(st){
          return '<label class="bucket-picker-row" style="display:flex;align-items:center;gap:8px;cursor:pointer">'
            + '<input type="checkbox" class="exp-student-cb" data-id="' + esc(st.id) + '" checked style="accent-color:var(--c-primary)"> '
            + esc(st.name) + '</label>';
        }).join("");
        html += '<details class="shell-details" open><summary class="shell-panel-title" style="cursor:pointer">Students</summary>'
          + '<div style="display:flex;gap:8px;margin-block-end:8px">'
          + '<button type="button" class="btn btn-secondary btn-sm" onclick="$(\'.exp-student-cb\').prop(\'checked\',true)">Select All</button>'
          + '<button type="button" class="btn btn-secondary btn-sm" onclick="$(\'.exp-student-cb\').prop(\'checked\',false)">Unselect All</button>'
          + '</div>'
          + '<div class="bucket-picker-list" style="max-height:220px">' + (studentRows || emptyStateHtml("No students")) + '</div>'
          + '</details>';
        html += '<details class="shell-details" open><summary class="shell-panel-title" style="cursor:pointer">Report Types</summary>'
          + (isIndividual ? '' :
              '<label class="bucket-picker-row" style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="exp-teacher" checked style="accent-color:var(--c-primary)"> Teacher Report</label>'
            + '<label class="bucket-picker-row" style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="exp-mgmt" checked style="accent-color:var(--c-primary)"> Management Report</label>')
          + '<label class="bucket-picker-row" style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="exp-zip" checked style="accent-color:var(--c-primary)"> Bundle as ZIP</label>'
          + '</details>';
        html += actionBtn("Generate & Download ZIP", "generateAllPDFs()");
      }
    }
    else if(step === "about" || step === "faq"){
      html += actionBtn(srT("shell_right_link_sample_files"), "showSampleFiles()");
      html += actionBtn("Home", "goStep('home')");
    }
    // item 7 (ui-prompt-template.md §4.2) superseded Task 6's chat-thread
    // Smart Query rail: for step==="dashboard", the right rail is now
    // built by whichever render-dashboard.js function openBucket() just
    // dispatched to (renderClassAnswer/renderStudentPicker/renderFilteredList/
    // renderClusterGroups/renderComparePicker/renderDashboardSmartSearch —
    // empty for the no-properties controls, search+list for the others) —
    // do nothing here, don't overwrite what they're about to set. The old
    // renderShellDashboardRail()/smartQueryRailAsk() functions below are
    // kept, not deleted, but no longer called from anywhere; see §9.
    if(step === "dashboard") return;
    setRightRail(html);
  }
  window.renderShellRightRail = renderShellRightRail;

  /* ==========================================================
     Task 6 — Right panel: Dashboard phase, Smart Query v2.
     SUPERSEDED by ui-prompt-template.md item 7g/h — kept below for
     reference/possible reuse of its ask()/match() fallback logic, but no
     longer called from renderShellRightRail(). See the GOTCHAS note above
     this function and PIB §9.

     IMPORTANT DEVIATION from both planning docs: vs-shell-plan-v2.md
     Task 6 and shell-redesign-plan.md §4.3/Phase 3 both describe an
     API — SmartQueryV2.composeVerdict()/suggest()/matchAndAnswer(),
     plus a hardcoded "verdict" string to migrate, plus a js/vendor/
     fuse.min.js dependency to add — that does not exist anywhere in
     this repo (grepped, confirmed zero hits). js/smart-query-v2.js's
     real, shipped API is load()/isReady()/availableQuestions()/
     answerQuestion(id)/match(text,limit)/ask(text), and its own header
     explicitly says it does NOT depend on fuse.js (lightweight
     token-overlap scorer instead). Built against the real API instead
     of the stale plan language. See §9 GOTCHAS.

     Ask/fallback logic ported from the quarantined js/smart-query-v2-ui.js
     (Task 2) rather than re-derived — that file's DOM/CSS is retired
     (superseded, script tag stays commented out), but its interaction
     logic (ask() first, fall back to match() results on no confident
     hit, deflection message otherwise) was already correct and is
     reused here verbatim, just against the rail's markup instead of a
     floating panel.

     smart_v2_verdict_no_data and smart_v2_export_log from
     shell-redesign-plan.md §4.3 are intentionally NOT added — the
     first has no composeVerdict() to pair with, the second (prompt.md
     §8.5's session-log export) has zero existing implementation and
     prompt.md itself was never supplied, so there is nothing safe to
     wire without inventing new business logic. See §9 GOTCHAS.
     ========================================================== */
  let _sqLoadAttempted = false;
  function ensureSmartQueryLoaded(cb){
    if(!window.SmartQueryV2) return;
    if(SmartQueryV2.isReady()){ if(cb) cb(); return; }
    if(_sqLoadAttempted) return;
    _sqLoadAttempted = true;
    SmartQueryV2.load().then(function(){ if(cb) cb(); }).catch(function(){});
  }

  function appendAnswerCard(text){
    const thread = document.getElementById("sqv2-rail-thread");
    if(!thread) return;
    const card = document.createElement("div");
    card.className = "shell-kv-row shell-answer-card";
    card.innerHTML = '<div class="shell-kv-value">' + esc(text) + '</div>';
    thread.appendChild(card);
    thread.scrollTop = thread.scrollHeight;
  }

  function renderSmartQueryChips(){
    const wrap = document.getElementById("sqv2-rail-chips");
    if(!wrap || !window.SmartQueryV2 || !SmartQueryV2.isReady()) return;
    const qs = SmartQueryV2.availableQuestions().slice(0, 6);
    wrap.innerHTML = qs.map(function(q){
      return '<button type="button" class="shell-chip" onclick="smartQueryRailAnswer(\''
        + String(q.id).replace(/'/g,"\\'") + '\')">' + esc(q.label) + '</button>';
    }).join("");
  }

  function smartQueryRailAnswer(questionId){
    if(!window.SmartQueryV2 || !SmartQueryV2.isReady()) return;
    const res = SmartQueryV2.answerQuestion(questionId);
    appendAnswerCard(res.text);
  }
  window.smartQueryRailAnswer = smartQueryRailAnswer;

  function smartQueryRailAsk(){
    const input = document.getElementById("sqv2-rail-input");
    const text = input ? input.value.trim() : "";
    if(!text) return;
    if(input) input.value = "";
    if(!window.SmartQueryV2) return;
    if(!SmartQueryV2.isReady()){
      ensureSmartQueryLoaded(function(){ smartQueryRailAsk_run(text); });
      return;
    }
    smartQueryRailAsk_run(text);
  }
  window.smartQueryRailAsk = smartQueryRailAsk;

  function smartQueryRailAsk_run(text){
    const result = SmartQueryV2.ask(text);
    if(result.matched){
      appendAnswerCard(result.text);
      return;
    }
    // No confident single match — same fallback order as the retired
    // floating panel: show the ranked candidates as chips if there are
    // any, else the deflection message.
    const m = SmartQueryV2.match(text, 5);
    if(m.ok && m.results.length){
      const wrap = document.getElementById("sqv2-rail-chips");
      if(wrap){
        wrap.innerHTML = m.results.map(function(r){
          return '<button type="button" class="shell-chip" onclick="smartQueryRailAnswer(\''
            + String(r.id).replace(/'/g,"\\'") + '\')">' + esc(r.label) + '</button>';
        }).join("");
      }
      appendAnswerCard(srT("smart_v2_deflection_hint"));
    } else {
      appendAnswerCard(result.text || (m.text || "I couldn't find a matching question."));
    }
  }

  function renderShellDashboardRail(){
    if(typeof srT !== "function") return;
    const canCompare = window.APP && APP.setup && APP.setup.mode !== "individual" && !APP.compareMode;
    let html = '<div id="sqv2-rail-thread" class="shell-panel-content" style="max-height:220px;overflow-y:auto;padding:0"></div>'
      + '<div style="display:flex;gap:6px;margin:8px 0">'
      + '<input id="sqv2-rail-input" type="text" data-voice="true" autocomplete="off" placeholder="'
      + esc(srT("smart_v2_input_placeholder"))
      + '" style="flex:1;min-width:0;padding:7px 9px;border:1px solid var(--c-border);border-radius:var(--r-sm);font-size:12.5px;font-family:inherit" onkeydown="if(event.key===\'Enter\'){smartQueryRailAsk()}"/>'
      + '<button type="button" class="btn btn-primary btn-sm" onclick="smartQueryRailAsk()">Ask</button>'
      + '</div>'
      + '<div id="sqv2-rail-chips" class="shell-chip-wrap"></div>'
      + actionBtn(srT("smart_v2_legacy_link"), "openSmartSearchScreen()");
    if(canCompare) html += actionBtn(srT("smart_v2_compare_link"), "openBucket('compare')");
    setRightRail(html);
    if(typeof initVoiceInput === "function") initVoiceInput();
    ensureSmartQueryLoaded(renderSmartQueryChips);
    renderSmartQueryChips();
  }

})();
