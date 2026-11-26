// Explore: pure feed logic (no DOM, no network, no storage). Used by ui/explore/explore-ui.js.
// Safety rule: an item is shown only if its url is https AND its host is on the allowlist
// of its own source (data/explore/sources.json "domains"). Checked again here at render time.

export const LEVELS = ['school', 'ug', 'pg', 'phd'];
export const TOPICS = ['scholarship', 'exam', 'admission', 'policy', 'course', 'career'];
export const PREFS_VERSION = 1;
export const PAGE_SIZE = 20;
const SHARE_PREFIX = 'STUDIN-EXPLORE-1:';

/* ---------- link safety ---------- */
export function buildDomainMap(sourcesDoc) {
  const map = new Map();
  const list = sourcesDoc && Array.isArray(sourcesDoc.sources) ? sourcesDoc.sources : [];
  for (const s of list) if (s && typeof s.id === 'string' && Array.isArray(s.domains)) map.set(s.id, s.domains.map((d) => String(d).toLowerCase()));
  return map;
}
export function isSafeUrl(url, domains) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return Array.isArray(domains) && domains.some((d) => host === d || host.endsWith('.' + d));
}
export function isRenderable(item, domainMap) {
  return !!item && typeof item.title === 'string' && item.title.length > 0 && typeof item.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && isSafeUrl(item.url, domainMap.get(item.sourceId));
}

/* ---------- preferences (stored as one JSON string by dal/explore/prefs-store.js) ---------- */
export function normalizePrefs(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== PREFS_VERSION) return null;      // unknown / old schema: ask again
  if (typeof raw.lang !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(raw.lang)) return null;
  if (!LEVELS.includes(raw.level)) return null;
  const state = typeof raw.state === 'string' ? raw.state.slice(0, 60) : '';
  const topics = Array.isArray(raw.topics) ? raw.topics.filter((t) => TOPICS.includes(t)) : [];
  return { v: PREFS_VERSION, lang: raw.lang, state, level: raw.level, topics: [...new Set(topics)] };
}
export function parsePrefs(text) {
  if (typeof text !== 'string' || !text) return null;
  try { return normalizePrefs(JSON.parse(text)); } catch (e) { return null; }
}
export function serializePrefs(p) { return JSON.stringify(normalizePrefs({ ...p, v: PREFS_VERSION })); }
// Short copy-paste code for moving choices to another device (plain text, no network).
export function exportCode(p) {
  const n = normalizePrefs({ ...p, v: PREFS_VERSION });
  if (!n) return '';
  const json = JSON.stringify([n.lang, n.state, n.level, n.topics]);
  const bytes = new TextEncoder().encode(json);
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return SHARE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function importCode(code) {
  const t = String(code || '').trim();
  if (!t.startsWith(SHARE_PREFIX)) return null;
  try {
    const b64 = t.slice(SHARE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const [lang, state, level, topics] = JSON.parse(new TextDecoder().decode(bytes));
    return normalizePrefs({ v: PREFS_VERSION, lang, state, level, topics });
  } catch (e) { return null; }
}

/* ---------- filtering ---------- */
export function collectStates(items) {
  const set = new Set();
  for (const it of items) for (const s of it.states || []) if (s && s !== 'all') set.add(s);
  return [...set].sort((a, b) => a.localeCompare(b, 'en'));
}
// Home states of each app language (India). Selecting a language also pulls items from these states.
export const LANGUAGE_REGIONS = {
  en: [], hi: ['Uttar Pradesh', 'Bihar', 'Madhya Pradesh', 'Rajasthan', 'Haryana', 'Delhi', 'Jharkhand', 'Chhattisgarh', 'Uttarakhand', 'Himachal Pradesh'],
  kn: ['Karnataka'], ta: ['Tamil Nadu', 'Puducherry'], te: ['Andhra Pradesh', 'Telangana'], mr: ['Maharashtra'],
  bn: ['West Bengal', 'Tripura'], gu: ['Gujarat'], ml: ['Kerala', 'Lakshadweep'], pa: ['Punjab', 'Chandigarh'],
  or: ['Odisha'], as: ['Assam'], ur: ['Jammu and Kashmir']
};
export const regionsFor = (lang) => LANGUAGE_REGIONS[lang] || [];
// A suggested single state for a language (only when the language has one dominant home state).
export const primaryStateFor = (lang) => { const r = regionsFor(lang); return r.length && lang !== 'hi' ? r[0] : ''; };

export function matchesPrefs(item, prefs) {
  if (!prefs) return false;
  const regions = regionsFor(prefs.lang);
  const states = item.states || [];
  const inRegion = states.some((x) => regions.includes(x));
  if (item.lang !== prefs.lang && !inRegion) return false;        // chosen language OR its home states (any language)
  const levels = item.levels || [];
  if (!(levels.includes('any') || levels.includes(prefs.level))) return false;
  if (!(states.includes('all') || inRegion || (prefs.state && states.includes(prefs.state)))) return false;
  if (prefs.topics.length && !(item.topics || []).some((t) => prefs.topics.includes(t))) return false;
  return true;
}
// Placeholder (owner-to-edit) items are visible only in the QA build.
export function visibleItems(items, { prefs, domainMap, qa }) {
  return items.filter((it) => (qa || it.placeholder !== true) && isRenderable(it, domainMap) && matchesPrefs(it, prefs));
}
export function sortNewestFirst(items) {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* ---------- day grouping (date strings only: time-zone safe) ---------- */
export function localDateString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}
// -> [{ date, label: 'today' | 'yesterday' | 'date', items }] in the order given
export function groupByDay(items, todayStr) {
  const yesterday = addDays(todayStr, -1);
  const groups = [];
  for (const it of items) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== it.date) {
      g = { date: it.date, label: it.date === todayStr ? 'today' : it.date === yesterday ? 'yesterday' : 'date', items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}
export const sectionOf = (it) => it.section || it.source || '';
// Order for "By section": sections with the newest item first, newest first inside each section.
export function sortBySection(items) {
  const newest = new Map();
  for (const it of items) { const k = sectionOf(it); if (!newest.has(k) || newest.get(k) < it.date) newest.set(k, it.date); }
  return [...items].sort((a, b) => {
    const ka = sectionOf(a), kb = sectionOf(b);
    if (ka !== kb) return newest.get(ka) < newest.get(kb) ? 1 : newest.get(ka) > newest.get(kb) ? -1 : ka < kb ? -1 : 1;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1;
  });
}
// Same shape as groupByDay so the UI can render both: { date: <group key>, label: 'section', items }
export function groupBySection(items) {
  const groups = [];
  for (const it of items) {
    const k = sectionOf(it); let g = groups[groups.length - 1];
    if (!g || g.date !== k) { g = { date: k, label: 'section', items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return groups;
}
export function formatDay(dateStr, locale) {
  const [y, m, d] = dateStr.split('-').map(Number);
  try { return new Intl.DateTimeFormat(locale || 'en', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))); }
  catch (e) { return dateStr; }
}

/* ---------- paging ---------- */
export function nextBatch(list, offset, size = PAGE_SIZE) { return list.slice(offset, offset + size); }
export function indexMonths(indexDoc) {
  const ok = indexDoc && indexDoc.schemaVersion === 1 && Array.isArray(indexDoc.months);
  return ok ? indexDoc.months.filter((m) => /^\d{4}-\d{2}$/.test(m)).slice(0, 12) : [];
}

/* ---------- Career Bible tree (data/explore/careers.json) ---------- */
export function validTree(doc, maxDepth = 8) {
  const ok = (n, d) => n && typeof n.t === 'string' && n.t.length > 0 && d <= maxDepth
    && (n.s === undefined || typeof n.s === 'string') && (n.x === undefined || typeof n.x === 'string')
    && (n.c === undefined || (Array.isArray(n.c) && n.c.every((k) => ok(k, d + 1))));
  return !!doc && doc.schemaVersion === 1 && Array.isArray(doc.tree) && doc.tree.length > 0 && doc.tree.every((n) => ok(n, 1));
}
