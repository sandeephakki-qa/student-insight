/* ════ SAVE (stateless app — no persistence by design) ════
   Per the privacy-first/offline-first direction, Student Insight never
   writes student data to localStorage or any server. "Save" simply tells
   the user their Excel file IS the save — nothing is silently stored. */
function saveSession(){
  toast("Student Insight doesn't store data — your Excel file is your save. Use Export to generate reports.","warn");
}

/* ════ UTILS ════ */
function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

/* Shared screen-swap helper — jQuery .show() plus the .screen-fade-in
   transition class (see css/core.css), used by every bucket/legacy/Smart
   Search screen swap so the whole app transitions the same way, not just
   the newer screens. Re-adds the class each call (removing first) so
   repeated taps between screens keep re-triggering the animation instead
   of it only firing once. */
function showScreen(selectorOrEl){
  const $el = (typeof selectorOrEl==="string") ? $(selectorOrEl) : selectorOrEl;
  $el.removeClass("screen-fade-in");
  $el.show();
  // Force reflow so re-adding the class restarts the CSS animation.
  void $el[0]?.offsetWidth;
  $el.addClass("screen-fade-in");
  return $el;
}

/* Consistent empty-state markup — used wherever a bucket/list legitimately
   has nothing to show (no students yet, no data for this view) instead of
   a blank area or an ad-hoc line of text. */
function emptyStateHtml(title, sub){
  return `<div class="bucket-empty-state">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
    <div class="bucket-empty-title">${esc(title)}</div>
    ${sub?`<div class="bucket-empty-sub">${esc(sub)}</div>`:""}
  </div>`;
}

function validateSetup(){
  const isIndividual=APP.setup.mode==="individual";
  const instNameEl=$("#inst-name");
  let instName=instNameEl.val().trim();
  // E4: guard against a user literally typing the placeholder text (e.g. "e.g. Ananya Krishnan")
  // instead of realizing it was example/hint text — treat that as an empty field.
  if(instName&&instName===(instNameEl.attr("placeholder")||"").trim())instName="";
  const className=$("#class-name").val().trim();
  const year=$("#class-year").val().trim();
  const subjects=getSubjects();
  const tests=$("#tests-list .test-row-wrap .test-name-inp").map(function(){return $(this).val().trim();}).get().filter(Boolean);

  // inline field errors
  $("#err-inst-name").toggle(!instName).text(isIndividual?"⚠ Student / Aspirant name is required":"⚠ Institution name is required");
  if(!instName) $("#inst-name").css("border-color","var(--c-danger)"); else $("#inst-name").css("border-color","");
  // Class / Batch is only mandatory in Institution mode — an individual
  // aspirant/parent may have no "batch" at all, and forcing a fake one
  // in would just pollute the reports with meaningless text.
  const classRequired=!isIndividual;
  $("#err-class-name").toggle(classRequired&&!className);
  if(classRequired&&!className) $("#class-name").css("border-color","var(--c-danger)"); else $("#class-name").css("border-color","");
  $("#err-class-year").toggle(!year);
  if(!year) $("#class-year").css("border-color","var(--c-danger)"); else $("#class-year").css("border-color","");

  // Duplicate names corrupt per-subject/per-test aggregation downstream —
  // e.g. two subjects named "Maths" and "maths" would silently overwrite
  // each other in subjectAvgs, since it's keyed by name. Case-insensitive
  // check since that's the realistic way teachers create an accidental dupe.
  const findDupes=list=>{const seen=new Set(),dupes=new Set();list.forEach(v=>{const k=v.toLowerCase();if(seen.has(k))dupes.add(v);seen.add(k);});return[...dupes];};
  const dupeSubjects=findDupes(subjects);
  const dupeTests=findDupes(tests);

  const missing=[];
  if(!instName) missing.push(isIndividual?"Student/Aspirant Name":"Institution Name");
  if(classRequired&&!className) missing.push("Class / Batch");
  if(!year) missing.push("Academic Year");
  if(!subjects.length) missing.push("at least one Subject");
  if(!tests.length) missing.push("at least one Test");
  if(dupeSubjects.length) missing.push("duplicate Subject name(s): "+dupeSubjects.join(", "));
  if(dupeTests.length) missing.push("duplicate Test name(s): "+dupeTests.join(", "));

  const valid=missing.length===0;
  $("#btn-download-template").prop("disabled",!valid).css({opacity:valid?1:.45,cursor:valid?"pointer":"not-allowed"}).toggleClass("btn-glow",valid);
  const errEl=document.getElementById("sw-err-4");
  if(errEl){ errEl.style.display=valid?"none":""; errEl.textContent=valid?"":"Still needed: "+missing.join(", ")+"."; }
  if(typeof swRefresh==="function") swRefresh();
  return valid;
}
function toast(msg,type=""){const el=$(`<div class="toast ${type}" role="${type==="error"?"alert":"status"}">${msg}</div>`);$("#toast-wrap").append(el);setTimeout(()=>el.fadeOut(300,()=>el.remove()),3500);}
function initEnvBadge(){const env=(window.APP_CONFIG&&APP_CONFIG.env)||"PROD";if(env!=="PROD"){$("#env-badge").text(env).show();}$("#project-page-link,#footer-project-link").attr("href",(window.APP_CONFIG&&APP_CONFIG.projectPageUrl)||"https://studin.in/");}


/* TRUST ACCORDION */
let _activeTrust=null;
function toggleTrust(id){
  const detail=document.getElementById('trust-detail');
  const bodies=document.querySelectorAll('.trust-body');
  const pills=document.querySelectorAll('.trust-pill');
  if(_activeTrust===id){
    detail.style.display='none';
    bodies.forEach(b=>b.style.display='none');
    pills.forEach(p=>p.classList.remove('active'));
    _activeTrust=null;return;
  }
  bodies.forEach(b=>b.style.display='none');
  const target=document.getElementById(id);
  if(target){target.style.display='block';detail.style.display='block';}
  pills.forEach((p,i)=>p.classList.toggle('active',['t1','t2','t3','t4','t5','t6'][i]===id));
  _activeTrust=id;
}


/* ── DASHBOARD TAB SWITCHING ── */
function switchDbTab(name, el){
  document.querySelectorAll('.db-tab').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-selected','false');t.tabIndex=-1;});
  document.querySelectorAll('.db-tab-panel').forEach(p=>p.classList.remove('active'));
  if(el){el.classList.add('active');el.setAttribute('aria-selected','true');el.tabIndex=0;}
  const panel = document.getElementById('tab-'+name);
  if(panel) panel.classList.add('active');
  // Bug fix: the All/At-Risk/Improving/Declining/Flagged filter chips only
  // ever affect the Students list and the Heatmap (see filterStudents(),
  // which re-renders exactly those two) — they have no effect on Analytics,
  // Alerts, Wellbeing or Insights. Leaving them visible (and seemingly
  // clickable) on those tabs made the app look broken/unresponsive when a
  // teacher clicked one and nothing on screen changed. Only show them on
  // the tabs where they actually do something.
  const isIndividual=APP.setup.mode==="individual";
  $("#db-filter-bar").toggle(!isIndividual&&(name==="students"||name==="heatmap"));
  // Bug fix: this used to be gated on window._chartsBuilt so it only ever
  // ran ONCE per page load, globally. That meant re-running analysis (e.g.
  // after removing/re-adding a Compare-mode section) or switching between
  // sections left the Analytics tab's charts blank or stale on every visit
  // after the first — renderCharts() was simply never called again.
  // renderCharts() already calls destroyCharts() first, so it's always
  // safe to call fresh; just do that every time this tab is opened.
  if(name==='analytics'){
    try{ renderCharts(); }catch(e){ console.error('chart build',e); }
  }
}

/* ════ KEYBOARD ════ */
$(document).on("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="s"){e.preventDefault();saveSession();}if(e.key==="Escape")closeModal();});
$(document).on("keydown","[role=button]",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();this.click();}});
$("#modal-overlay").on("click",function(e){if($(e.target).is("#modal-overlay"))closeModal();});

/* ════ SERVICE WORKER ════ */
if("serviceWorker" in navigator&&location.protocol!=="file:"){const swPath=location.pathname.includes("/student-insight/")?"/student-insight/sw.js":"/sw.js";navigator.serviceWorker.register(swPath).catch(()=>{});}

/* ── VOICE INPUT (Web Speech API) ──────────────────────────────────────
   Works on: Chrome desktop, Chrome Android, Edge, iOS Safari 14.5+
   Does NOT work on: Firefox (no API support) — mic buttons simply hidden.
   Note: most implementations send audio to cloud (Google/Apple) for
   recognition. On-device offline voice is NOT guaranteed. A small note
   is shown next to every mic button: "Needs internet".
   ─────────────────────────────────────────────────────────────────── */
function initVoiceInput(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){return;} // unsupported — mic buttons stay hidden, no error
  document.querySelectorAll("[data-voice='true']").forEach(target=>{
    if(target.dataset.voiceWired)return; // dashboard textareas re-render — don't double-wire
    target.dataset.voiceWired="true";
    // FEEDBACK #2: the mic button used to be inserted as a plain sibling,
    // which got pushed onto its own line by 100%-width inputs/textareas
    // with no room left beside them. Wrapping the field lets the button
    // sit absolutely-positioned INSIDE the field's right edge instead.
    const wrap=document.createElement("div");
    wrap.className="voice-field-wrap";
    target.parentNode.insertBefore(wrap,target);
    wrap.appendChild(target);
    target.classList.add("has-voice-btn");
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="btn btn-sm voice-mic-btn";
    btn.title="Voice input — needs internet";
    btn.innerHTML="🎙";
    btn.setAttribute("aria-label","Start voice input");
    wrap.appendChild(btn);
    let rec=null;
    const stopListening=()=>{btn.classList.remove("voice-active");rec=null;};
    btn.addEventListener("click",()=>{
      if(rec){rec.stop();stopListening();return;}
      rec=new SR();
      rec.lang=document.documentElement.lang||"en-IN";
      rec.interimResults=false;
      rec.maxAlternatives=1;
      rec.onresult=e=>{
        const transcript=e.results[0][0].transcript;
        if(target.tagName==="TEXTAREA"||target.tagName==="INPUT"){
          target.value=(target.value?target.value+" ":"")+transcript;
          target.dispatchEvent(new Event("input",{bubbles:true})); // triggers save-button enable
        }
        // FEEDBACK #4: stop immediately once a result comes back instead of
        // waiting for the browser's own silence-timeout to fire onend —
        // that gap was what made the mic look "still listening" after use.
        if(rec)rec.stop();
      };
      rec.onerror=stopListening;
      rec.onend=stopListening;
      rec.start();
      btn.classList.add("voice-active");
    });
  });
}

/* ════ INIT ════ */
$(function(){
  if(location.protocol!=="file:"){const ml=document.createElement("link");ml.rel="manifest";ml.href="manifest.json";document.head.appendChild(ml);}
  // Stateless design: wipe any previously stored session data on load
  try{localStorage.removeItem("sia_sessions");localStorage.removeItem("sia_auth");localStorage.removeItem("sia_gs_url");}catch(e){}
  Object.values(AI_FEATURES).flat().forEach(f=>APP.aiFeatures.add(f.id));renderAICheckboxes();initEnvBadge();applyCompareModeUI();initThemeToggle();populateCountryDropdown(); // pre-select all AI features silently (no toast) — selectAllAI() is reserved for the explicit "Select All" button / analysis-time fallback
  setUsageMode("institution",true); // default card visuals before any Setup interaction
  initVoiceInput(); // wires up mic buttons on [data-voice=true] fields present at load (Setup inputs); dashboard remark textareas are wired on render, see render-dashboard.js
  goStep("home"); // always shows clean home
  // v1.8: the first-load Institution/Individual popup (v1.4-v1.7) was
  // removed per direct feedback — see PIB §17. Institution stays the
  // default (as it always was); Setup's mode-select card is still the
  // real place to switch, same as before v1.4 ever existed.
});
