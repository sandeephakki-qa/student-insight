// Career Bible: collapsible tree (stage > path > course > careers) built with native <details>.
// Text only (createElement + textContent). Content comes from data/explore/careers.json (owner-written).
import { srT } from '../../core/render-i18n.js';
import { validTree } from '../../bal/explore/feed-logic.js';
import { loadCareers } from '../../dal/explore/explore-data.js';

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

function nodeEl(n, depth) {
  const kids = Array.isArray(n.c) ? n.c : [];
  const body = (host) => {
    if (n.s) host.append(el('span', 'cb-note', n.s));
    if (n.x) { const x = el('span', 'cb-exams'); x.append(el('strong', '', srT('explore_bible_entry') + ' '), document.createTextNode(n.x)); host.append(x); }
  };
  if (!kids.length) { const li = el('li', 'cb-leaf'); li.append(el('span', 'cb-title', n.t)); body(li); return li; }
  const li = el('li', 'cb-branch');
  const d = el('details', 'cb-d cb-depth-' + Math.min(depth, 4));
  if (depth === 1) d.open = false;
  const sum = el('summary', 'cb-sum');
  sum.append(el('span', 'cb-title', n.t));
  d.append(sum);
  const inner = el('div', 'cb-inner'); body(inner); d.append(inner);
  const ul = el('ul', 'cb-list'); kids.forEach((k) => ul.append(nodeEl(k, depth + 1))); d.append(ul);
  li.append(d); return li;
}

export async function buildBible(host) {
  host.replaceChildren();
  let doc;
  try { doc = await loadCareers(); } catch (e) { doc = null; }
  if (!validTree(doc)) { host.append(el('p', 'cb-note', srT('explore_bible_failed'))); return; }
  const tools = el('div', 'cb-tools');
  const setAll = (open) => host.querySelectorAll('details.cb-d').forEach((d) => { d.open = open; });
  const a = el('button', 'btn btn-secondary btn-sm', srT('explore_bible_expand')); a.type = 'button'; a.addEventListener('click', () => setAll(true));
  const b = el('button', 'btn btn-secondary btn-sm', srT('explore_bible_collapse')); b.type = 'button'; b.addEventListener('click', () => setAll(false));
  tools.append(a, b);
  const ul = el('ul', 'cb-list cb-root'); doc.tree.forEach((n) => ul.append(nodeEl(n, 1)));
  host.append(tools, ul);
  if (doc.note) host.append(el('p', 'cb-note cb-disclaimer', doc.note));
}
