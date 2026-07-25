/* ============================================================
   Student Insight — App Shell engine (Project Bible v2 §6a)
   Phases 1-3: skeleton + left rail (context) + right rail
   (actionable / Smart Query v2). Reads only existing APP.setup /
   APP.students fields — no new state, no computation.
   Scope freeze respected: does not touch compute-engine.js,
   FROZEN_KEYS schema, or the export pipeline.
============================================================ */

(function(){

  function escapeHtml(v){
    return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function setLeftRail(html){
    const el=document.getElementById("shell-rail-start");
    if(el) el.innerHTML=html||"";
  }
  function setRightRail(html){
    const el=document.getElementById("shell-rail-end");
    if(el) el.innerHTML=html||"";
  }

  /* ── Left rail: same "what's loaded" context on every data-bearing
     panel, duplicating exactly what Setup's own form already shows —
     any mismatch means this is reading a stale field, not a new one. */
  function leftRailContent(){
    const setup=(window.APP&&APP.setup)||{};
    const students=(window.APP&&APP.students)||[];
    if(!students.length){
      return '<div class="shell-rail-title">This session</div><div class="shell-rail-empty">No file uploaded yet.</div>';
    }
    const modeLabel=setup.mode==="individual"?"Individual":"Institution";
    const nameLabel=setup.mode==="individual"?(students[0]&&students[0].name||""):(setup.institutionName||"");
    const multi=(window.APP&&APP.compareMode)?"Multiple files":"Single file";
    return '<div class="shell-rail-title">This session</div>'+
      '<div class="shell-rail-row"><span>Mode</span><span>'+escapeHtml(modeLabel)+'</span></div>'+
      (nameLabel?('<div class="shell-rail-row"><span>Name</span><span>'+escapeHtml(nameLabel)+'</span></div>'):'')+
      '<div class="shell-rail-row"><span>Records</span><span>'+escapeHtml(students.length)+'</span></div>'+
      '<div class="shell-rail-row"><span>Files</span><span>'+escapeHtml(multi)+'</span></div>'+
      (setup.className?('<div class="shell-rail-row"><span>Class</span><span>'+escapeHtml(setup.className)+'</span></div>'):'');
  }

  /* ── Right rail: general "what can I do" nav for non-Dashboard
     phases; Dashboard phase gets the Smart Query v2 entry point
     instead (the floating panel from smart-query-v2-ui.js is left as
     the actual interaction surface — this rail just surfaces it inline
     too, without duplicating any of that file's logic). */
  function rightRailContent(activePanel){
    if(activePanel==="panel-dashboard"){
      const ready=window.SmartQueryV2&&SmartQueryV2.isReady();
      return '<div class="shell-rail-title">Ask a question</div>'+
        '<div style="font-size:12.5px;margin-bottom:8px">Tap the 💬 button in the corner to ask anything about this class in plain language.</div>'+
        (ready?'<div class="shell-rail-empty">Question bank loaded.</div>':'<div class="shell-rail-empty">Loading question bank…</div>');
    }
    const nav={
      "panel-home":["Upload a file to get started"],
      "panel-setup":["Fill in Institution/Class details","Add Subjects and Tests","Download the template"],
      "panel-ai":["Choose which AI features to include","Run the analysis"],
      "panel-export":["Download the PDF report","Download the raw data"],
      "panel-about":["Read the FAQ for common questions"],
      "panel-faq":["Search or browse by audience"]
    };
    const items=nav[activePanel];
    if(!items) return "";
    return '<div class="shell-rail-title">What you can do here</div>'+
      items.map(t=>'<div class="shell-rail-row"><span>'+escapeHtml(t)+'</span></div>').join("");
  }

  function refreshRails(){
    const activeEl=document.querySelector(".panel.active");
    const activeId=activeEl?activeEl.id:"panel-home";
    setLeftRail(leftRailContent());
    setRightRail(rightRailContent(activeId));
  }

  function renderShellChrome(){
    refreshRails();
    // Re-populate on panel switch — goStep()/openBucket() toggle the
    // "active" class on .panel elements; observe that instead of
    // requiring a manual setLeftRail/setRightRail call added into every
    // existing render function individually.
    const main=document.getElementById("main");
    if(main && window.MutationObserver){
      const obs=new MutationObserver(function(muts){
        if(muts.some(m=>m.attributeName==="class")) refreshRails();
      });
      document.querySelectorAll(".panel").forEach(function(p){
        obs.observe(p,{attributes:true,attributeFilter:["class"]});
      });
    }
    // Also refresh whenever student data changes shape (upload/re-analyse)
    // — cheap poll rather than hooking every mutation site individually.
    setInterval(function(){
      const students=(window.APP&&APP.students)||[];
      if(students.length!==_lastCount){ _lastCount=students.length; refreshRails(); }
    },1500);
  }
  let _lastCount=0;

  window.renderShellChrome=renderShellChrome;
  window.setLeftRail=setLeftRail;
  window.setRightRail=setRightRail;

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",renderShellChrome);
  } else {
    renderShellChrome();
  }

})();
