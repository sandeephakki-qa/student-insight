/* ============================================================
   Student Insight — App Shell engine
   Rebuilt to match uploaded wireframes exactly:
   - Left rail: plain bullet list (uploaded file name, institute/
     individual name, number of records, single/multiple files)
   - Breadcrumb row, full width, above the 3-column body
   - Right rail: two stacked boxes — numbered "Actionable items"
     step list, and a Sample Files / About / FAQ's quick-link box
   Persistent on every screen (matches all 4 wireframes showing the
   same rail content regardless of which screen is centered).
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
  function setBreadcrumb(html){
    const el=document.getElementById("shell-breadcrumb");
    if(el) el.innerHTML=html||"";
  }

  /* ── Left rail — wireframe: "Just plan data in bullet points"
     - Uploaded file name
     - Institute or individual and name of it
     - Number of records
     - Single file or multiple files ── */
  function leftRailContent(){
    const setup=(window.APP&&APP.setup)||{};
    const students=(window.APP&&APP.students)||[];
    const single=window.APP&&APP.homeSingleFile;
    const sections=(window.APP&&APP.sections)||[];

    let fileName="—";
    if(single&&single.fileName) fileName=single.fileName;
    else if(sections.length===1&&sections[0].fileName) fileName=sections[0].fileName;
    else if(sections.length>1) fileName=sections.length+" files";

    const nameLabel = setup.mode==="individual"
      ? (students[0]&&students[0].name ? "Individual — "+students[0].name : "Individual")
      : (setup.institutionName ? "Institution — "+setup.institutionName : "Institution");

    const recordCount = students.length || "—";
    const fileMode = sections.length>1 ? "Multiple files" : "Single file";

    return '<div class="shell-bullet-title">Just plan data<br>in bullet points</div>'+
      '<div class="shell-bullet">- Uploaded file name<br><span>'+escapeHtml(fileName)+'</span></div>'+
      '<div class="shell-bullet">- Institute or individual<br>and name of it<br><span>'+escapeHtml(nameLabel)+'</span></div>'+
      '<div class="shell-bullet">- Number of<br>records<br><span>'+escapeHtml(recordCount)+'</span></div>'+
      '<div class="shell-bullet">- Single file or<br>multiple files<br><span>'+escapeHtml(fileMode)+'</span></div>';
  }

  /* ── Right rail — wireframe: numbered "Actionable items of
     Dashboard in sequence/step by step flow" box, then a separate
     Sample Files / About / FAQ's quick-link box underneath. ── */
  const STEP_FLOW={
    "panel-home":["Upload your filled sheet","Or try a sample file","Or build a new template"],
    "panel-setup":["Choose how to start","Fill in institution/class","Add subjects and tests","Download the template","Upload it back on Home"],
    "panel-ai":["Choose which AI features to include","Run the analysis"],
    "panel-dashboard":["Review the class overview","Check flagged students","Use Smart Search for quick answers","Export the PDF reports"],
    "panel-export":["Download the PDF report","Download the raw data"],
    "panel-about":["Read how the app works"],
    "panel-faq":["Search or browse by audience"]
  };

  function rightRailContent(activePanel){
    const steps=STEP_FLOW[activePanel]||["Get started from Home"];
    const stepsHtml=steps.map((s,i)=>'<div class="shell-step"><span class="shell-step-num">'+(i+1)+'</span>'+escapeHtml(s)+'</div>').join("");
    return '<div class="shell-rail-box">'+
        '<div class="shell-rail-title">Actionable items<br>of Dashboard in<br>sequence/<br>step by step<br>flow</div>'+
        stepsHtml+
      '</div>'+
      '<div class="shell-rail-box shell-rail-links">'+
        '<div class="shell-link" onclick="if(typeof showSampleFiles===\'function\')showSampleFiles();">Sample Files</div>'+
        '<div class="shell-link" onclick="if(typeof goStep===\'function\')goStep(\'about\');">About</div>'+
        '<div class="shell-link" onclick="if(typeof goStep===\'function\')goStep(\'faq\');">FAQ\'s</div>'+
      '</div>';
  }

  /* ── Breadcrumb — wireframe: "Home > Dashboard > Export Reports",
     full width, directly under the header, above the 3-column body. ── */
  const CRUMB_LABEL={
    "panel-home":"Home","panel-setup":"Setup","panel-ai":"AI Features",
    "panel-dashboard":"Dashboard","panel-export":"Export Reports",
    "panel-about":"About","panel-faq":"FAQ's"
  };
  function breadcrumbContent(activePanel){
    const label=CRUMB_LABEL[activePanel]||"Home";
    return activePanel==="panel-home"
      ? "Home"
      : "Home &gt; "+escapeHtml(label);
  }

  function refreshShell(){
    const activeEl=document.querySelector(".panel.active");
    const activeId=activeEl?activeEl.id:"panel-home";
    setLeftRail(leftRailContent());
    setRightRail(rightRailContent(activeId));
    setBreadcrumb(breadcrumbContent(activeId));
  }

  let _lastCount=0;
  function renderShellChrome(){
    refreshShell();
    const main=document.getElementById("main");
    if(main && window.MutationObserver){
      const obs=new MutationObserver(function(muts){
        if(muts.some(m=>m.attributeName==="class")) refreshShell();
      });
      document.querySelectorAll(".panel").forEach(function(p){
        obs.observe(p,{attributes:true,attributeFilter:["class"]});
      });
    }
    setInterval(function(){
      const students=(window.APP&&APP.students)||[];
      if(students.length!==_lastCount){ _lastCount=students.length; refreshShell(); }
    },1500);
  }

  window.renderShellChrome=renderShellChrome;
  window.setLeftRail=setLeftRail;
  window.setRightRail=setRightRail;

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",renderShellChrome);
  } else {
    renderShellChrome();
  }

})();
