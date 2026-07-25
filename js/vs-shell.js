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
  // vs-shell-plan-v2 Task 7: session-persistent (in-memory only,
  // NO_PERSISTENCE — resets on reload) panel state, promoted from a
  // closure-local var to APP.shellState so it's inspectable the same
  // way other app state is. Survives Home -> Setup -> Dashboard
  // navigation because #app-shell-body itself is never torn down.
  if(typeof window !== "undefined" && !window.APP) window.APP = {};
  if(typeof window !== "undefined" && !APP.shellState){
    APP.shellState = {
      start: { width: 240, collapsed: false },
      end:   { width: 240, collapsed: false }
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

  function vsShellToggle(side){
    const s = state[side];
    s.collapsed = !s.collapsed;
    const panel = document.getElementById(`shell-panel-${side}`);
    const btn = document.getElementById(`shell-panel-${side}-toggle`);
    if(panel) panel.dataset.collapsed = s.collapsed ? "true" : "false";
    if(btn){
      btn.setAttribute("aria-expanded", s.collapsed ? "false" : "true");
      btn.setAttribute("aria-label", s.collapsed ? "Expand panel" : "Collapse panel");
    }
    applyWidth(side);
  }
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
    applyWidth("start");
    applyWidth("end");
    initDivider("shell-divider-start", "start");
    initDivider("shell-divider-end", "end");
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initShell);
  } else {
    initShell();
  }

})();
