// Career Bible: searchable, linked tree (stage > path > course > careers) built with native <details>.
// Text only (createElement + textContent). Structure comes from data/explore/careers.json; related courses and
// official exam links are looked up LIVE from courses.json / exams.json / linkstatus.json, so they stay current.
import { srT } from '../../core/render-i18n.js';
import { filterTree, pathTo, relatedCourses, tokens, countNodes, validBible } from '../../bal/explore/bible-logic.js';
import { examMap, linkState } from '../../bal/explore/courses-logic.js';
import { localDateString, formatDay, isSafeUrl } from '../../bal/explore/feed-logic.js';
import { loadCareers, loadCourses, loadExams, loadLinkStatus } from '../../dal/explore/explore-data.js';

const t = (k, p) => srT(k, p);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
const ctx = { doc: null, exams: new Map(), hosts: [], links: null, courseIds: new Set(), host: null, q: '' };

// text with the search words highlighted (DOM nodes only)
function marked(text, toks) {
  const span = document.createElement('span');
  if (!toks.length) { span.textContent = text; return span; }
  const lower = text.toLowerCase(); let i = 0;
  const hits = [];
  toks.forEach((w) => { let p = lower.indexOf(w); while (p >= 0) { hits.push([p, p + w.length]); p = lower.indexOf(w, p + w.length); } });
  hits.sort((a, b) => a[0] - b[0]);
  for (const [a, b] of hits) { if (a < i) continue; span.append(text.slice(i, a)); span.append(el('mark', 'cb-mark', text.slice(a, b))); i = b; }
  span.append(text.slice(i));
  return span;
}
function badge(id) {
  const ls = linkState(ctx.links, id, localDateString());
  if (ls.kind === 'none') return null;
  const lang = window.SR_LANG || 'en';
  const text = ls.kind === 'ok' ? t('link_ok', { date: formatDay(ls.date, lang) }) : ls.kind === 'changed' ? t('link_changed', { date: formatDay(ls.date, lang) }) : ls.kind === 'moved' ? t('link_moved', { host: ls.host || '' }) : t('link_bad');
  return el('span', 'cr-badge cr-' + ls.kind, text);
}
function actions(n) {
  const box = el('div', 'cb-actions');
  const exams = (n.ex || []).map((id) => ctx.exams.get(id)).filter(Boolean).filter((e) => isSafeUrl(e.url, ctx.hosts));
  if (exams.length) {
    const ul = el('ul', 'cb-exams-list'); ul.setAttribute('aria-label', t('bible_exams'));
    exams.forEach((e) => {
      const li = el('li'); const a = el('a', 'explore-link cr-examlink', e.name); a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.append(el('span', 'sr-only', ' ' + t('explore_opens_new_tab')), el('span', '', ' ↗')); li.append(a);
      const b = badge(e.id); if (b) li.append(' ', b); ul.append(li);
    });
    box.append(el('p', 'cr-h', t('bible_exams')), ul);
  }
  const ids = [...relatedCourses(n)].filter((id) => ctx.courseIds.has(id));
  if (ids.length) {
    const b = el('button', 'btn btn-secondary btn-sm', t('bible_courses', { n: ids.length })); b.type = 'button';
    b.addEventListener('click', () => document.dispatchEvent(new CustomEvent('explore:courses', { detail: { ids, label: n.t } })));
    box.append(b);
  }
  return box.children.length ? box : null;
}
function body(host, n, toks) {
  if (n.s) { const note = el('span', 'cb-note'); note.append(marked(n.s, toks)); host.append(note); }
  if (n.x) { const x = el('span', 'cb-exams'); x.append(el('strong', '', t('explore_bible_entry') + ' '), marked(n.x, toks)); host.append(x); }
  const a = (n.a && !n.m) ? null : actions(n); if (a) host.append(a);   // while searching, ancestors show no buttons
}
function nodeEl(n, depth, toks, openAll) {
  const kids = Array.isArray(n.c) ? n.c : [];
  if (!kids.length) {
    const li = el('li', 'cb-leaf' + (n.m ? ' cb-hit' : '')); li.dataset.id = n.id || '';
    const lt = el('span', 'cb-title'); lt.append(marked(n.t, toks)); li.append(lt); body(li, n, toks); return li;
  }
  const li = el('li', 'cb-branch' + (n.m ? ' cb-hit' : ''));
  const d = el('details', 'cb-d cb-depth-' + Math.min(depth, 4)); d.dataset.id = n.id || '';
  d.open = openAll || (toks.length > 0 && (!!n.m || !!n.a));
  const sum = el('summary', 'cb-sum'); const ttl = el('span', 'cb-title'); ttl.append(marked(n.t, toks)); sum.append(ttl); d.append(sum);
  const inner = el('div', 'cb-inner'); body(inner, n, toks); if (inner.children.length) d.append(inner);
  const ul = el('ul', 'cb-list'); kids.forEach((k) => ul.append(nodeEl(k, depth + 1, toks, openAll))); d.append(ul);
  li.append(d); return li;
}
function setHere(id) {
  const bar = ctx.host.querySelector('#cb-here'); if (!bar) return;
  const p = id ? pathTo(ctx.doc.tree, id) : [];
  bar.textContent = p.length ? t('bible_here') + ' ' + p.join(' › ') : '';
}
function renderTree() {
  const out = ctx.host.querySelector('#cb-tree'); const count = ctx.host.querySelector('#cb-count');
  const toks = tokens(ctx.q);
  const nodes = filterTree(ctx.doc.tree, ctx.q);
  out.replaceChildren();
  if (!nodes.length) { out.append(el('p', 'cb-note', t('bible_nomatch'))); count.textContent = ''; return; }
  const ul = el('ul', 'cb-list cb-root'); nodes.forEach((n) => ul.append(nodeEl(n, 1, toks, false))); out.append(ul);
  count.textContent = toks.length ? t('bible_count', { n: countNodes(nodes) }) : '';
}

export async function buildBible(host) {
  host.replaceChildren(); ctx.host = host;
  let doc, courses, exams;
  try { [doc, courses, exams] = await Promise.all([loadCareers(), loadCourses().catch(() => null), loadExams().catch(() => null)]); } catch (e) { doc = null; }
  if (!validBible(doc)) { host.append(el('p', 'cb-note', t('explore_bible_failed'))); return; }
  try { ctx.links = await loadLinkStatus(); } catch (e) { ctx.links = null; }
  ctx.doc = doc; ctx.exams = exams ? examMap(exams) : new Map(); ctx.hosts = exams ? exams.hosts : [];
  ctx.courseIds = new Set(courses && Array.isArray(courses.courses) ? courses.courses.map((c) => c.id) : []);
  const q = el('input', 'explore-code'); q.type = 'search'; q.id = 'cb-q'; q.placeholder = t('bible_search'); q.setAttribute('aria-label', t('bible_search')); q.autocomplete = 'off';
  let timer = null; q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { ctx.q = q.value; renderTree(); }, 150); });
  const tools = el('div', 'cb-tools');
  const setAll = (open) => host.querySelectorAll('details.cb-d').forEach((d) => { d.open = open; });
  const a = el('button', 'btn btn-secondary btn-sm', t('explore_bible_expand')); a.type = 'button'; a.addEventListener('click', () => setAll(true));
  const b = el('button', 'btn btn-secondary btn-sm', t('explore_bible_collapse')); b.type = 'button'; b.addEventListener('click', () => setAll(false));
  tools.append(a, b);
  const here = el('p', 'cb-here'); here.id = 'cb-here'; here.setAttribute('role', 'status'); here.setAttribute('aria-live', 'polite');
  const count = el('p', 'cb-note'); count.id = 'cb-count';
  const tree = el('div'); tree.id = 'cb-tree';
  host.append(q, tools, here, count, tree);
  if (doc.note) host.append(el('p', 'cb-note cb-disclaimer', doc.note));
  host.addEventListener('toggle', (ev) => { const d = ev.target; if (d && d.open && d.dataset && d.dataset.id) setHere(d.dataset.id); }, true);
  host.addEventListener('click', (ev) => { const li = ev.target.closest && ev.target.closest('li.cb-leaf'); if (li && li.dataset.id) setHere(li.dataset.id); });
  renderTree();
}
