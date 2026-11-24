// Explore tab UI. Lazy-loaded by goStep('explore') (core/state-nav.js).
// Rules: links only (target=_blank rel="noopener noreferrer"), no iframes, no innerHTML with data
// (every node is built with createElement + textContent), no tracking, nothing leaves the device.
import { srT, SR_STRINGS_EN } from '../../core/render-i18n.js';
import {
  LEVELS, TOPICS, PAGE_SIZE, primaryStateFor, buildDomainMap, visibleItems, sortNewestFirst, collectStates, groupByDay, formatDay,
  localDateString, nextBatch, indexMonths, parsePrefs, serializePrefs, exportCode, importCode
} from '../../bal/explore/feed-logic.js';
import { buildBible } from './career-bible.js';
import { loadIndex, loadSources, loadMonth, loadStrings, loadQaFlag, readPrefsText, writePrefsText } from '../../dal/explore/explore-data.js';

const S = {
  ready: false, root: null, prefs: null, domainMap: new Map(), qa: false, months: [], nextMonth: 0, all: [],
  filtered: [], shown: 0, lastDate: null, lastSection: null, loading: false, metaLoaded: false, saveFailed: false
};

/* ---------- tiny DOM helpers (text only) ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
const t = (key, params) => srT(key, params);


function setStatus(text) { const el = S.root && S.root.querySelector('#explore-status'); if (el) el.textContent = text || ''; }

function subTabs() {
  const mk = (id, key, on) => h('button', { type: 'button', role: 'tab', id, class: 'explore-sub' + (on ? ' active' : ''), 'aria-selected': on ? 'true' : 'false', tabindex: on ? '0' : '-1' }, t(key));
  const news = mk('sub-news', 'explore_sub_news', true), courses = mk('sub-courses', 'explore_sub_courses', false);
  const show = async (which) => {
    const isNews = which === 'news';
    news.classList.toggle('active', isNews); courses.classList.toggle('active', !isNews);
    news.setAttribute('aria-selected', String(isNews)); courses.setAttribute('aria-selected', String(!isNews));
    news.tabIndex = isNews ? 0 : -1; courses.tabIndex = isNews ? -1 : 0;
    S.root.querySelector('#explore-news').hidden = !isNews; S.root.querySelector('#explore-courses').hidden = isNews;
    if (!isNews) { try { const m = await import('./courses-ui.js'); await m.buildCourses(S.root.querySelector('#explore-courses')); } catch (e) { console.error('Courses failed:', e); } }
  };
  news.addEventListener('click', () => show('news')); courses.addEventListener('click', () => show('courses'));
  const key = (ev) => { if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); const to = ev.currentTarget === news ? courses : news; to.focus(); to.click(); } };
  news.addEventListener('keydown', key); courses.addEventListener('keydown', key);
  if (!subTabs.wired) {      // Career Bible asks to open Courses filtered to a few ids
    subTabs.wired = true;
    document.addEventListener('explore:courses', async (ev) => {
      try { await show('courses'); const m = await import('./courses-ui.js'); m.applyIds(ev.detail.ids, ev.detail.label); courses.scrollIntoView && courses.scrollIntoView({ block: 'nearest' }); } catch (e) { console.error('Open courses failed:', e); }
    });
  }
  return h('div', { class: 'explore-subtabs', role: 'tablist', 'aria-label': t('explore_sub_aria') }, news, courses);
}

/* ---------- one-time boot: CSS, strings, QA flag, skeleton ---------- */
function addCss() {
  if (document.getElementById('explore-css')) return Promise.resolve();
  return new Promise((resolve) => {
    const link = h('link', { rel: 'stylesheet', href: 'css/explore.css', id: 'explore-css' });
    const done = () => resolve();
    link.addEventListener('load', done); link.addEventListener('error', done);
    setTimeout(done, 1500);
    document.head.appendChild(link);
  });
}
async function boot(root) {
  S.root = root;
  const [, strings, qa] = await Promise.all([addCss(), loadStrings().catch(() => null), loadQaFlag()]);
  if (strings) for (const k of Object.keys(strings)) if (k[0] !== '_') SR_STRINGS_EN[k] = strings[k]; // English fallback for every UI language
  S.qa = !!qa;
  const bible = h('details', { class: 'explore-bible', id: 'explore-bible' },
    h('summary', { class: 'explore-bible-sum' }, t('explore_bible_title')),
    h('p', { class: 'explore-note' }, t('explore_bible_intro')),
    h('div', { id: 'explore-bible-body' }));
  bible.open = !!(window.matchMedia && window.matchMedia('(min-width:1000px)').matches);   // open on desktop, collapsed on phones
  root.replaceChildren(
    h('div', { class: 'explore-shell' }, bible,
    h('div', { class: 'explore-wrap' },
      h('div', { class: 'explore-mast' },
        h('h2', { class: 'explore-title', id: 'explore-title', tabindex: '-1' }, t('explore_title')),
        h('span', { class: 'explore-date' }, formatDay(localDateString(), window.SR_LANG || 'en'))),
      subTabs(),
      h('div', { id: 'explore-news', role: 'tabpanel', 'aria-labelledby': 'sub-news' },
        h('p', { class: 'explore-intro' }, t('explore_intro')),
        h('div', { id: 'explore-head' }),
        h('div', { id: 'explore-status', class: 'explore-status', role: 'status', 'aria-live': 'polite' }),
        h('div', { id: 'explore-body' })),
      h('div', { id: 'explore-courses', role: 'tabpanel', 'aria-labelledby': 'sub-courses', hidden: true })
    ))
  );
  buildBible(root.querySelector('#explore-bible-body')).catch(() => {});
  S.ready = true;
}

/* ---------- data ---------- */
async function loadMeta() {
  const [index, sources] = await Promise.all([loadIndex(), loadSources()]);
  S.months = indexMonths(index);
  S.domainMap = buildDomainMap(sources);
  S.nextMonth = 0; S.all = []; S.metaLoaded = true;
  if (S.months.length) await loadNextMonth();
}
async function loadNextMonth() {
  const m = S.months[S.nextMonth];
  const doc = await loadMonth(m);
  if (!doc || doc.schemaVersion !== 1 || !Array.isArray(doc.items)) throw new Error('bad month file ' + m);
  S.nextMonth++;
  S.all = S.all.concat(doc.items);
  recompute();
}
function recompute() { S.filtered = sortNewestFirst(visibleItems(S.all, { prefs: S.prefs, domainMap: S.domainMap, qa: S.qa })); }
const hasMore = () => S.shown < S.filtered.length || S.nextMonth < S.months.length;

/* ---------- chips + share ---------- */
function languageOptions() {
  const sel = document.getElementById('language-select');
  const opts = sel ? Array.from(sel.options).map((o) => ({ value: o.value, label: o.textContent })) : [];
  return opts.length ? opts : [{ value: 'en', label: 'EN' }];
}
function labelForLang(code) { const o = languageOptions().find((x) => x.value === code); return o ? o.label : code.toUpperCase(); }

function renderHead() {
  const head = S.root.querySelector('#explore-head');
  const p = S.prefs;
  if (!p) { head.replaceChildren(); return; }
  const chips = [labelForLang(p.lang), p.state || null, t('explore_level_' + p.level), ...p.topics.map((x) => t('explore_topic_' + x))].filter(Boolean);
  const change = h('button', { type: 'button', class: 'explore-iconbtn', 'aria-label': t('explore_change_choices'), title: t('explore_change_choices') }, '⚙');
  change.addEventListener('click', () => openPicker());
  const code = h('input', { type: 'text', readonly: true, class: 'explore-code', id: 'explore-code', value: exportCode(p), 'aria-label': t('explore_share_export_label') });
  const copy = h('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, t('explore_share_copy'));
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code.value); setStatus(t('explore_share_copied')); }
    catch (e) { code.focus(); code.select(); }
  });
  const imp = h('input', { type: 'text', class: 'explore-code', id: 'explore-import', autocomplete: 'off', spellcheck: 'false', 'aria-label': t('explore_share_import_label') });
  const apply = h('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, t('explore_share_apply'));
  apply.addEventListener('click', () => {
    const np = importCode(imp.value);
    if (!np) { setStatus(t('explore_share_invalid')); return; }
    savePrefs(np); showFeed(true);
  });
  head.replaceChildren(
    h('div', { class: 'explore-chiprow' },
      h('ul', { class: 'explore-chips', 'aria-label': t('explore_chips_aria') }, ...chips.map((c) => h('li', { class: 'explore-chip' }, c))),
      change),
    h('details', { class: 'explore-share' },
      h('summary', {}, t('explore_share_summary')),
      h('div', { class: 'explore-sharebody' }, h('label', { for: 'explore-code' }, t('explore_share_export_label')), code, copy,
        h('label', { for: 'explore-import' }, t('explore_share_import_label')), imp, apply))
  );
}

/* ---------- picker ---------- */
function savePrefs(p) {
  S.prefs = parsePrefs(serializePrefs(p));
  S.saveFailed = !writePrefsText(serializePrefs(S.prefs));
}
async function openPicker() {
  const body = S.root.querySelector('#explore-body');
  setStatus('');
  if (!S.metaLoaded) { try { await loadMeta(); } catch (e) { /* picker still works without derived states */ } }
  const cur = S.prefs || { lang: window.SR_LANG || 'en', state: '', level: '', topics: [] };
  const langSel = h('select', { id: 'explore-lang', class: 'explore-field' }, ...languageOptions().map((o) => h('option', { value: o.value, selected: o.value === cur.lang }, o.label)));
  const states = collectStates(S.all);
  const stateSel = states.length
    ? h('select', { id: 'explore-state', class: 'explore-field' }, h('option', { value: '' }, t('explore_picker_state_all')), ...states.map((s) => h('option', { value: s, selected: s === cur.state }, s)))
    : null;
  const level = h('fieldset', { class: 'explore-fieldset' }, h('legend', {}, t('explore_picker_level')),
    ...LEVELS.map((l) => h('label', { class: 'explore-opt' }, h('input', { type: 'radio', name: 'explore-level', value: l, checked: l === cur.level }), ' ', t('explore_level_' + l))));
  const topics = h('fieldset', { class: 'explore-fieldset' }, h('legend', {}, t('explore_picker_topics')),
    ...TOPICS.map((x) => h('label', { class: 'explore-opt' }, h('input', { type: 'checkbox', name: 'explore-topic', value: x, checked: cur.topics.includes(x) }), ' ', t('explore_topic_' + x))));
  const save = h('button', { type: 'button', class: 'btn btn-primary' }, t('explore_picker_save'));
  const cancel = S.prefs ? h('button', { type: 'button', class: 'btn btn-secondary' }, t('explore_picker_cancel')) : null;
  save.addEventListener('click', () => {
    const picked = body.querySelector('input[name="explore-level"]:checked');
    if (!picked) { setStatus(t('explore_pick_level')); return; }
    savePrefs({ v: 1, lang: langSel.value, state: stateSel ? stateSel.value : '', level: picked.value,
      topics: Array.from(body.querySelectorAll('input[name="explore-topic"]:checked')).map((i) => i.value) });
    showFeed(true);
  });
  if (cancel) cancel.addEventListener('click', () => showFeed(false));
  body.replaceChildren(h('section', { class: 'explore-picker card' }, h('h3', {}, t('explore_picker_title')),
    h('label', { for: 'explore-lang', class: 'explore-lbl' }, t('explore_picker_lang')), langSel,
    stateSel ? h('label', { for: 'explore-state', class: 'explore-lbl' }, t('explore_picker_state')) : null, stateSel,
    level, topics, h('div', { class: 'explore-actions' }, save, cancel)));
  langSel.focus();
}

/* ---------- feed ---------- */
function resetFeedDom() {
  S.shown = 0; S.lastDate = null; S.lastSection = null;
  S.root.querySelector('#explore-body').replaceChildren(h('div', { id: 'explore-feed' }), h('div', { id: 'explore-foot', class: 'explore-foot' }));
}
function buildCard(it) {
  const link = h('a', { class: 'explore-link', href: it.url, target: '_blank', rel: 'noopener noreferrer' },
    it.title, h('span', { class: 'sr-only' }, ' ' + t('explore_opens_new_tab')), h('span', { class: 'explore-ext', 'aria-hidden': 'true' }, ' ↗'));
  const card = h('article', { class: 'explore-card' },
    h('div', { class: 'explore-kindrow' },
      h('span', { class: 'explore-kind explore-kind-' + it.kind }, t('explore_kind_' + it.kind)),
      it.placeholder === true ? h('span', { class: 'explore-badge' }, t('explore_placeholder_badge')) : null),
    h('h4', { class: 'explore-card-title' }, link),
    h('p', { class: 'explore-meta' }, t('explore_meta', { source: it.source, date: formatDay(it.date, S.prefs.lang) }), ' · ', t('explore_checked_on', { date: formatDay(it.checkedOn || it.date, S.prefs.lang) })));
  card.append(shareRow(it));
  if (it.kind === 'deadline') card.append(h('p', { class: 'explore-confirm' }, t('explore_confirm_official')));
  if (typeof it.summary === 'string' && it.summary) card.append(h('details', { class: 'explore-sum' }, h('summary', {}, it.summary)));
  return card;
}
function shareRow(it) {
  const row = h('div', { class: 'explore-share-row' });
  const copy = h('button', { type: 'button', class: 'explore-act' }, t('explore_copy_link'));
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(it.url); setStatus(t('explore_link_copied')); }
    catch (e) { window.prompt && setStatus(it.url); }
  });
  row.append(copy);
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const share = h('button', { type: 'button', class: 'explore-act' }, t('explore_share'));
    share.addEventListener('click', () => { navigator.share({ title: it.title, url: it.url }).catch(() => {}); });
    row.prepend(share);
  }
  return row;
}
function appendBatch() {
  const feed = S.root.querySelector('#explore-feed');
  if (!feed) return;
  const batch = nextBatch(S.filtered, S.shown, PAGE_SIZE);
  const today = localDateString();
  for (const g of groupByDay(batch, today)) {
    let section = S.lastDate === g.date ? S.lastSection : null;
    if (!section) {
      const label = g.label === 'today' ? t('explore_day_today') : g.label === 'yesterday' ? t('explore_day_yesterday') : formatDay(g.date, S.prefs.lang);
      section = h('section', { class: 'explore-day', 'aria-label': label }, h('h3', { class: 'explore-day-h' }, label));
      feed.append(section);
      S.lastDate = g.date; S.lastSection = section;
    }
    for (const it of g.items) section.append(buildCard(it));
  }
  S.shown += batch.length;
}
function renderFoot() {
  const foot = S.root.querySelector('#explore-foot');
  if (!foot) return;
  if (S.shown === 0) {
    foot.replaceChildren(h('p', { class: 'explore-empty' }, t('explore_empty')), h('p', { class: 'explore-note' }, t('explore_empty_hint')),
      (() => { const b = h('button', { type: 'button', class: 'btn btn-secondary' }, t('explore_change_choices')); b.addEventListener('click', () => openPicker()); return b; })());
  } else if (hasMore()) {
    const b = h('button', { type: 'button', class: 'btn btn-secondary', id: 'explore-more' }, t('explore_load_more'));
    b.addEventListener('click', () => more());
    foot.replaceChildren(b);
    watch(b);
  } else {
    foot.replaceChildren(h('p', { class: 'explore-end' }, t('explore_caught_up')));
  }
}
let observer = null;
function watch(el) {
  if (observer) observer.disconnect();
  if (typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) more(); }, { rootMargin: '200px' });
  observer.observe(el);
}
function showError(retry) {
  const foot = S.root.querySelector('#explore-foot') || S.root.querySelector('#explore-body');
  const b = h('button', { type: 'button', class: 'btn btn-secondary' }, t('explore_retry'));
  b.addEventListener('click', retry);
  foot.replaceChildren(h('p', { class: 'explore-error' }, t('explore_error')), b);
}
async function fillTo(target) {
  while (S.filtered.length < target && S.nextMonth < S.months.length) await loadNextMonth();
}
async function more() {
  if (S.loading) return;
  S.loading = true;
  if (observer) observer.disconnect();
  try {
    await fillTo(S.shown + PAGE_SIZE);
    appendBatch(); renderFoot();
    setStatus(navigator.onLine === false ? t('explore_offline') : '');
  } catch (e) { showError(() => more()); }
  finally { S.loading = false; }
}
async function showFeed(reload) {
  if (!S.prefs) { await openPicker(); return; }
  renderHead();
  setStatus(S.saveFailed ? t('explore_prefs_unsaved') : t('explore_loading'));
  if (!S.metaLoaded || reload) {
    resetFeedDom();
    try {
      if (!S.metaLoaded) await loadMeta(); else recompute();
    } catch (e) { setStatus(''); showError(() => showFeed(true)); return; }
  } else if (S.root.querySelector('#explore-feed') && S.shown > 0) { setStatus(S.saveFailed ? t('explore_prefs_unsaved') : ''); return; }
  else resetFeedDom();
  S.loading = true;
  try {
    await fillTo(PAGE_SIZE);
    appendBatch(); renderFoot();
    setStatus(S.saveFailed ? t('explore_prefs_unsaved') : (navigator.onLine === false ? t('explore_offline') : ''));
  } catch (e) { setStatus(''); showError(() => showFeed(true)); }
  finally { S.loading = false; }
}

/* ---------- language change: follow the app's language selector ---------- */
let langWired = false;
function wireLanguage() {
  const sel = document.getElementById('language-select');
  if (langWired || !sel) return;
  langWired = true;
  sel.addEventListener('change', async () => {
    const lang = sel.value;
    if (!S.ready || !S.prefs || !/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(lang)) return;
    const state = primaryStateFor(lang);
    savePrefs({ ...S.prefs, lang, state });
    try {
      if (document.body.classList.contains('explore-active')) { await showFeed(true); }
      const m = await import('./courses-ui.js'); m.applyState(state);
    } catch (e) { console.error('Language follow failed (ignored):', e); }
  });
}

/* ---------- entry point (called by goStep) ---------- */
export async function renderExplore() {
  const root = document.getElementById('panel-explore');
  if (!root) return;
  try {
    if (!S.ready) await boot(root);
    wireLanguage();
    if (!S.prefs) S.prefs = parsePrefs(readPrefsText());   // corrupt / old / blocked storage -> null -> picker
    if (!S.prefs) await openPicker(); else await showFeed(false);
  } catch (e) {
    console.error('Explore render failed (Insight unaffected):', e);
    try { setStatus(t('explore_error')); } catch (e2) { /* ignore */ }
  }
}

