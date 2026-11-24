// Shared, dependency-free helpers for the Explore feed scripts. Node 18+.
import { createHash } from 'node:crypto';

export const ENUMS = {
  levels: ['school', 'ug', 'pg', 'phd', 'any'],
  topics: ['scholarship', 'exam', 'admission', 'policy', 'course', 'career'],
  kinds: ['deadline', 'notice', 'exam', 'news', 'career'],
  types: ['rss', 'curated']
};
export const LIMITS = { title: 200, summary: 300 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export const idFor = (url) => createHash('sha1').update(String(url).trim()).digest('hex').slice(0, 16);
export const monthOf = (date) => String(date).slice(0, 7);

/* ---------- text helpers ---------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}
// Removes tags by scanning (no regex backtracking on hostile input), decodes entities, collapses spaces.
export function stripHtml(input) {
  const s = String(input ?? '');
  let out = '';
  let inTag = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<') inTag = true;
    else if (c === '>' && inTag) { inTag = false; out += ' '; }
    else if (!inTag) out += c;
  }
  // a second pass handles entity-encoded tags such as &lt;b&gt;
  let text = decodeEntities(out);
  if (text.includes('<')) { let o2 = ''; let t = false; for (const c of text) { if (c === '<') t = true; else if (c === '>' && t) { t = false; o2 += ' '; } else if (!t) o2 += c; } text = o2; }
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------- tiny RSS/Atom parser ---------- */
function unwrapCdata(s) {
  const t = s.trim();
  return t.startsWith('<![CDATA[') && t.endsWith(']]>') ? t.slice(9, -3) : s;
}
// Returns the inner text of the first <tag>...</tag> in block, or null.
function firstTag(block, tag) {
  const open = block.indexOf('<' + tag);
  if (open < 0) return null;
  const afterName = block[open + tag.length + 1];
  if (afterName !== '>' && afterName !== ' ' && afterName !== '/' && afterName !== '\n' && afterName !== '\r' && afterName !== '\t') return firstTagFrom(block, tag, open + 1);
  const gt = block.indexOf('>', open);
  if (gt < 0) return null;
  if (block[gt - 1] === '/') return '';
  const close = block.indexOf('</' + tag + '>', gt);
  if (close < 0) return null;
  return block.slice(gt + 1, close);
}
function firstTagFrom(block, tag, from) {
  const sub = block.slice(from);
  return firstTag(sub, tag);
}
function allTags(block, tag) {
  const res = [];
  let pos = 0;
  for (;;) {
    const open = block.indexOf('<' + tag, pos);
    if (open < 0) break;
    const nm = block[open + tag.length + 1];
    if (nm !== '>' && nm !== ' ' && nm !== '/' && nm !== '\n' && nm !== '\r' && nm !== '\t') { pos = open + 1; continue; }
    const gt = block.indexOf('>', open);
    if (gt < 0) break;
    if (block[gt - 1] === '/') { pos = gt + 1; continue; }
    const close = block.indexOf('</' + tag + '>', gt);
    if (close < 0) break;
    res.push(block.slice(gt + 1, close));
    pos = close + tag.length + 3;
  }
  return res;
}
function atomLink(block) {
  let pos = 0;
  for (;;) {
    const open = block.indexOf('<link', pos);
    if (open < 0) return null;
    const gt = block.indexOf('>', open);
    if (gt < 0) return null;
    const tagText = block.slice(open, gt + 1);
    const rel = /rel\s*=\s*["']([^"']*)["']/.exec(tagText);
    const href = /href\s*=\s*["']([^"']*)["']/.exec(tagText);
    if (href && (!rel || rel[1] === 'alternate')) return decodeEntities(href[1]);
    pos = gt + 1;
  }
}
function splitBlocks(xml, tag) {
  return allTags(xml, tag);
}
/**
 * parseFeed(xml, hintTags) -> { items: [{title, link, pubDate, hints:[...], fields:[...]}], error? }
 * Only title, link and pubDate are meant to be published. `hints` (values of category/author-like tags)
 * exist only so an education filter can read them; they are never written to data files.
 * `fields` lists every child tag name seen (for PIB_FEED_NOTES.md).
 */
export function parseFeed(xml, hintTags = []) {
  const text = String(xml ?? '');
  if (!text.trim()) return { items: [], error: 'empty response' };
  const looksLikeFeed = text.includes('<rss') || text.includes('<feed') || text.includes('<rdf:RDF') || text.includes('<channel');
  if (!looksLikeFeed) return { items: [], error: 'not an RSS/Atom document' };
  let blocks = splitBlocks(text, 'item');
  if (!blocks.length) blocks = splitBlocks(text, 'entry');
  const opened = text.split('<' + (text.includes('<item') ? 'item' : 'entry')).length - 1;
  if (opened > blocks.length) return { items: [], error: 'malformed XML: unclosed item' };
  const items = blocks.map((b) => {
    const rawTitle = firstTag(b, 'title');
    let rawLink = firstTag(b, 'link');
    if (rawLink === null || rawLink === '') rawLink = atomLink(b) ?? firstTag(b, 'guid');
    const rawDate = firstTag(b, 'pubDate') ?? firstTag(b, 'dc:date') ?? firstTag(b, 'published') ?? firstTag(b, 'updated');
    const hints = [];
    for (const t of hintTags) for (const v of allTags(b, t)) hints.push(stripHtml(unwrapCdata(v)));
    const fields = [];
    let p = 0;
    for (;;) {
      const o = b.indexOf('<', p);
      if (o < 0) break;
      const c = b[o + 1];
      if (c && c !== '/' && c !== '!' && c !== '?') {
        let e = o + 1;
        while (e < b.length && !/[\s>\/]/.test(b[e])) e++;
        const name = b.slice(o + 1, e);
        if (name && !fields.includes(name)) fields.push(name);
      }
      p = o + 1;
    }
    return {
      title: rawTitle == null ? '' : stripHtml(unwrapCdata(rawTitle)),
      link: rawLink == null ? '' : stripHtml(unwrapCdata(rawLink)),
      pubDate: rawDate == null ? '' : stripHtml(unwrapCdata(rawDate)),
      hints, fields
    };
  });
  return { items };
}

/** RFC-822 / ISO date -> "YYYY-MM-DD" (UTC calendar date) or null. */
export function toDateString(s) {
  const t = Date.parse(String(s ?? '').trim());
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/* ---------- allowlist / validation ---------- */
export function hostAllowed(host, domains) {
  const h = String(host).toLowerCase();
  return (domains || []).some((d) => { const x = String(d).toLowerCase(); return h === x || h.endsWith('.' + x); });
}
export function parseHttps(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.username === '' && u.password === '' ? u : null; } catch { return null; }
}

/** Returns an array of error strings (empty = valid). `source` may be undefined (unknown sourceId). */
export function validateItem(item, source, { curated = false } = {}) {
  const e = [];
  if (!item || typeof item !== 'object') return ['item is not an object'];
  const need = ['id', 'title', 'date', 'checkedOn', 'source', 'sourceId', 'url', 'lang', 'states', 'levels', 'topics', 'kind'];
  for (const k of need) if (item[k] === undefined || item[k] === null) e.push('missing ' + k);
  if (e.length) return e;
  if (typeof item.title !== 'string' || !item.title.trim()) e.push('empty title');
  else {
    if (item.title.length > LIMITS.title) e.push('title longer than ' + LIMITS.title);
    if (item.title.includes('<') || item.title.includes('>')) e.push('title contains HTML characters');
  }
  if (!DATE_RE.test(item.date) || Number.isNaN(Date.parse(item.date))) e.push('bad date');
  if (!DATE_RE.test(item.checkedOn)) e.push('bad checkedOn');
  const u = parseHttps(item.url);
  if (!u) e.push('url is not https');
  else if (!source) e.push('unknown sourceId ' + item.sourceId);
  else if (!hostAllowed(u.hostname, source.domains)) e.push('host not allowlisted: ' + u.hostname);
  if (u && item.id !== idFor(item.url)) e.push('id is not the hash of url');
  if (!Array.isArray(item.states) || !item.states.length || item.states.some((s) => typeof s !== 'string' || !s)) e.push('bad states');
  if (!Array.isArray(item.levels) || !item.levels.length || item.levels.some((l) => !ENUMS.levels.includes(l))) e.push('bad levels');
  if (!Array.isArray(item.topics) || item.topics.some((t) => !ENUMS.topics.includes(t))) e.push('bad topics');
  if (!ENUMS.kinds.includes(item.kind)) e.push('bad kind');
  if (typeof item.lang !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(item.lang)) e.push('bad lang');
  const summary = item.summary ?? '';
  if (typeof summary !== 'string') e.push('summary not a string');
  else {
    if (!curated && summary !== '') e.push('summary allowed only on curated items');
    if (summary.length > LIMITS.summary) e.push('summary longer than ' + LIMITS.summary);
    if (summary.includes('<')) e.push('summary contains HTML characters');
  }
  if (item.placeholder !== undefined && item.placeholder !== true) e.push('placeholder must be true when present');
  if (item.placeholder === true && !curated) e.push('placeholder only on curated items');
  return e;
}

export function validateSources(doc) {
  const e = [];
  if (!doc || doc.schemaVersion !== 1 || !Array.isArray(doc.sources)) return ['sources.json: need schemaVersion 1 and a sources array'];
  const seen = new Set();
  doc.sources.forEach((s, i) => {
    const p = `sources[${i}]${s && s.id ? ' (' + s.id + ')' : ''}: `;
    for (const k of ['id', 'name', 'homepage', 'type', 'language', 'level', 'domains', 'termsNote', 'checkedOn', 'enabled'])
      if (s[k] === undefined) e.push(p + 'missing ' + k);
    if (!('feedUrl' in s)) e.push(p + 'missing feedUrl');
    if (typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) e.push(p + 'id must be a lowercase slug');
    if (seen.has(s.id)) e.push(p + 'duplicate id'); seen.add(s.id);
    if (!ENUMS.types.includes(s.type)) e.push(p + 'bad type');
    if (!Array.isArray(s.domains) || !s.domains.length) e.push(p + 'domains must be a non-empty array');
    if (!Array.isArray(s.level) || s.level.some((l) => !ENUMS.levels.includes(l))) e.push(p + 'bad level tags');
    if (!DATE_RE.test(String(s.checkedOn))) e.push(p + 'bad checkedOn');
    if (typeof s.enabled !== 'boolean') e.push(p + 'enabled must be boolean');
    const home = parseHttps(s.homepage);
    if (!home) e.push(p + 'homepage not https'); else if (!hostAllowed(home.hostname, s.domains)) e.push(p + 'homepage host not in domains');
    if (s.feedUrl !== null && s.feedUrl !== undefined) {
      const f = parseHttps(s.feedUrl);
      if (!f) e.push(p + 'feedUrl not https'); else if (!hostAllowed(f.hostname, s.domains)) e.push(p + 'feedUrl host not in domains');
    }
    if (s.type === 'rss' && s.enabled && !s.feedUrl) e.push(p + 'enabled rss source needs feedUrl');
    if (s.type === 'curated' && s.feedUrl) e.push(p + 'curated source must have feedUrl null');
    if (s.states !== undefined && (!Array.isArray(s.states) || !s.states.length || s.states.some((x) => typeof x !== 'string' || !x))) e.push(p + 'states must be a non-empty array of names when present');
    if (s.filter !== undefined && s.filter !== 'education') e.push(p + 'filter must be "education" when present');
  });
  return e;
}

/* ---------- classification ---------- */
function hasWord(text, word) {
  const t = text.toLowerCase(); const w = word.toLowerCase();
  let from = 0;
  for (;;) {
    const i = t.indexOf(w, from);
    if (i < 0) return false;
    const before = i === 0 ? ' ' : t[i - 1];
    const after = i + w.length >= t.length ? ' ' : t[i + w.length];
    const edge = (c) => !/[\p{L}\p{N}]/u.test(c);
    if (edge(before) && edge(after)) return true;
    from = i + 1;
  }
}
export function isEducation(entry, rules) {
  const hints = (entry.hints || []).map((h) => h.toLowerCase());
  if (rules.ministries.some((m) => hints.includes(m.toLowerCase()))) return { ok: true, why: 'ministry' };
  const hit = rules.titleKeywords.find((k) => hasWord(entry.title, k));
  return hit ? { ok: true, why: 'keyword:' + hit } : { ok: false, why: 'no match' };
}
export function classify(title, rules) {
  const kind = (rules.kindRules.find((r) => r.words.some((w) => hasWord(title, w))) || {}).kind || rules.defaultKind;
  const topics = rules.topicRules.filter((r) => r.words.some((w) => hasWord(title, w))).map((r) => r.topic);
  return { kind, topics: topics.length ? topics : [...rules.defaultTopics] };
}
// Whole-word match (so "Skilling" does not trip "kill"). List inflections explicitly in blocklist.json.
export function blocked(title, words) {
  return words.find((w) => hasWord(title, w)) || null;
}

/* ---------- merge / deterministic output ---------- */
export function sortItems(items) {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** existing + incoming (incoming overrides fields except checkedOn). Curated flag decides precedence. */
export function mergeById(existing, incoming) {
  const map = new Map(existing.map((i) => [i.id, i]));
  for (const n of incoming) {
    const old = map.get(n.id);
    map.set(n.id, old ? { ...n, checkedOn: old.checkedOn } : n);
  }
  return sortItems([...map.values()]);
}
export function stableJson(obj) { return JSON.stringify(obj, null, 2) + '\n'; }
export function pruneMonths(months, keep = 12) { return [...months].sort().reverse().slice(0, keep); }
export const isMonth = (m) => MONTH_RE.test(m);
