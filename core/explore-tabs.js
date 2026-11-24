// Insight | Explore top-level tabs: tab state, #insight / #explore hash routing, last-tab memory,
// and the QA build ribbon. Deliberately tiny and eager (Insight-only users load only this file).
// The Explore feature itself (ui/explore/, bal/explore/, dal/explore/, css/explore.css,
// i18n/explore/en.json) is lazy-loaded by goStep('explore') in core/state-nav.js.
// Upward calls (goStep) go through core/ports.js to keep the import graph acyclic.
import { port } from './ports.js';
import { APP } from './app-state.js';

const goStep = port('goStep');
const TAB_KEY = 'studin.explore.tab.v1';   // UI preference only: 'insight' | 'explore'. Never student data.
let applyingHash = false;                  // true while we change the hash ourselves
let lastInsightStep = 'home';

function lsGet() { try { return window.localStorage.getItem(TAB_KEY); } catch (e) { return null; } }
function lsSet(v) { try { window.localStorage.setItem(TAB_KEY, v); } catch (e) { /* blocked storage: fall back silently */ } }

function paintTabs(tab) {
  document.body.classList.toggle('explore-active', tab === 'explore');
  document.querySelectorAll('.studin-tab').forEach((b) => {
    const on = b.getAttribute('data-tab') === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.setAttribute('tabindex', on ? '0' : '-1');
  });
}

function setHash(tab) {
  const want = '#' + tab;
  if (window.location.hash === want) return;
  applyingHash = true;
  try {
    // entering Explore adds a history entry (Back returns to Insight); leaving it replaces the entry
    if (tab === 'explore') window.history.pushState(null, '', want);
    else window.history.replaceState(null, '', want);
  } catch (e) { /* history blocked: ignore */ }
  applyingHash = false;
}

// Called by goStep() after APP.currentStep is set.
let pendingRestore = null;   // runs once, right after the app's own boot goStep('home')
export function onStepChanged(step) {
  if (pendingRestore) { const run = pendingRestore; pendingRestore = null; if (step !== 'explore') setTimeout(run, 0); }
  const tab = step === 'explore' ? 'explore' : 'insight';
  if (tab === 'insight') lastInsightStep = step;
  paintTabs(tab);
  lsSet(tab);
  if (tab === 'explore' || window.location.hash === '#explore') setHash(tab);
}

function showTab(tab) {
  if (tab === 'explore') { if (APP.currentStep !== 'explore') goStep('explore'); return; }
  if (APP.currentStep === 'explore') goStep(lastInsightStep || 'home');
}

function onTabKey(ev) {
  const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
  if (!(ev.key in keys)) return;
  const tabs = Array.from(document.querySelectorAll('.studin-tab'));
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  ev.preventDefault();
  const k = keys[ev.key];
  const next = k === 'first' ? tabs[0] : k === 'last' ? tabs[tabs.length - 1] : tabs[(i + k + tabs.length) % tabs.length];
  next.focus();
  showTab(next.getAttribute('data-tab'));
}

function onHashChange() {
  if (applyingHash) return;
  const h = window.location.hash;
  if (h === '#explore') showTab('explore');
  else if (h === '#insight' || h === '') showTab('insight');
}

async function initQaRibbon() {
  const env = (window.APP_CONFIG && window.APP_CONFIG.env) || 'PROD';
  if (env !== 'QA') return;                         // only the QA site has a flag file; PROD and LOCAL never ask for it
  try {
    const res = await fetch('qa-build.json', { cache: 'no-store' });
    if (!res.ok) return;
    const q = await res.json();
    if (!q || q.qa !== true) return;
    const el = document.createElement('div');
    el.className = 'studin-qa-ribbon';
    el.setAttribute('role', 'note');
    const sha = String(q.sha || '').replace(/[^0-9a-f]/gi, '').slice(0, 12);
    const feed = String(q.feedUpdatedAt || '').slice(0, 16).replace('T', ' ');
    el.textContent = 'QA build ' + (sha || 'unknown') + (feed ? ' · feed ' + feed + ' UTC' : '');
    document.body.appendChild(el);
  } catch (e) { /* no flag file: not a QA build */ }
}

// First visit only: ask Insight or Explore, then go there. Waits until the existing first-visit overlays
// (intro slider, video) are closed so two pop-ups never stack. Choice is remembered (no repeat on later visits).
const WELCOME_KEY = 'studin.explore.welcome.v1';
function overlayOpen() {
  return ['si-onboard', 'si-videos'].some((id) => { const e = document.getElementById(id); return e && !e.hidden && window.getComputedStyle(e).display !== 'none'; });
}
function initWelcome() {
  const box = document.getElementById('studin-welcome');
  let done = false; try { done = window.localStorage.getItem(WELCOME_KEY) === '1'; } catch (e) { done = false; }
  if (!box || done || window.location.hash === '#explore' || window.location.hash === '#insight' || lsGet() !== null) return;
  const btns = Array.from(box.querySelectorAll('[data-choose]'));
  const close = (choice) => {
    try { window.localStorage.setItem(WELCOME_KEY, '1'); } catch (e) { /* ignore */ }
    box.hidden = true; document.removeEventListener('keydown', onKey, true);
    if (choice === 'explore') goStep('explore'); else lsSet('insight');
  };
  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); close('insight'); return; }
    if (ev.key === 'Tab') { const i = btns.indexOf(document.activeElement); ev.preventDefault(); btns[(i + (ev.shiftKey ? -1 : 1) + btns.length) % btns.length].focus(); }
  }
  btns.forEach((b) => b.addEventListener('click', () => close(b.getAttribute('data-choose'))));
  const show = () => { box.hidden = false; document.addEventListener('keydown', onKey, true); btns[0].focus(); };
  const wait = window.setInterval(() => { if (!overlayOpen()) { window.clearInterval(wait); show(); } }, 400);
}

function init() {
  document.querySelectorAll('.studin-tab').forEach((b) => {
    b.addEventListener('click', () => showTab(b.getAttribute('data-tab')));
    b.addEventListener('keydown', onTabKey);
  });
  window.addEventListener('hashchange', onHashChange);
  initQaRibbon();
  initWelcome();
  // Restore the last tab AFTER the app's own boot has called goStep('home') (it does so asynchronously,
  // so a fixed timer is not reliable). Safety net: run anyway after 6 s.
  const h = window.location.hash;
  const want = h === '#explore' ? 'explore' : h === '#insight' ? 'insight' : (lsGet() === 'explore' ? 'explore' : 'insight');
  if (want === 'explore') {
    pendingRestore = () => { if (APP.currentStep !== 'explore') goStep('explore'); };
    setTimeout(() => { if (pendingRestore) { const run = pendingRestore; pendingRestore = null; run(); } }, 6000);
  }
}

if (typeof document !== 'undefined') {
  // Module scripts run before DOMContentLoaded, so register for it unless the page is already fully loaded.
  if (document.readyState === 'complete') init();
  else document.addEventListener('DOMContentLoaded', init);
}
