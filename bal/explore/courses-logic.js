// Courses explorer: pure filtering/search logic (no DOM, no network, no storage).
export const STREAMS = ['pcm', 'pcb', 'commerce', 'arts'];
export const COURSE_LEVELS = ['after10', 'after12', 'graduation'];
export const COURSE_PAGE = 20;
export const CHANGED_DAYS = 30;

export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function examMap(examsDoc) {
  const m = new Map();
  for (const e of (examsDoc && examsDoc.exams) || []) m.set(e.id, e);
  return m;
}
// Search text per course: name, tags, category and names of its exams.
export function buildIndex(courses, exams) {
  return courses.map((c) => ({ c, name: norm(c.n), hay: norm([c.n, c.a, c.cat, c.el, ...(c.ex || []).map((id) => (exams.get(id) || {}).name)].join(' ')) }));
}
export function filterCourses(index, { q = '', stream = '', level = '', type = '' } = {}) {
  const toks = norm(q).split(' ').filter(Boolean);
  const hits = index.filter(({ c, hay }) =>
    (!stream || c.st === 'any' || c.st.includes(stream))
    && (!level || c.lv.includes(level))
    && (!type || c.tp === type)
    && toks.every((t) => hay.includes(t)));
  if (!toks.length) return hits.map((x) => x.c);
  // name matches first, then the rest (stable)
  const inName = (x) => toks.every((t) => x.name.includes(t));
  return [...hits.filter(inName), ...hits.filter((x) => !inName(x))].map((x) => x.c);
}
// Exams to show for a course: all national ones, plus the state ones for the chosen state.
export function examsFor(course, exams, state) {
  const list = (course.ex || []).map((id) => exams.get(id)).filter(Boolean);
  const national = list.filter((e) => e.scope === 'national');
  const stateAll = list.filter((e) => e.scope === 'state');
  const mine = state ? stateAll.filter((e) => e.state === state) : [];
  return { national, state: mine, hiddenState: state ? 0 : stateAll.length, noneForState: !!state && stateAll.length > 0 && mine.length === 0 };
}
export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}
// -> { kind: 'ok'|'changed'|'bad'|'moved'|'none', date, host }
export function linkState(linkDoc, id, todayStr) {
  const it = linkDoc && linkDoc.items && linkDoc.items[id];
  if (!it) return { kind: 'none' };
  if (it.status === 'error') return { kind: 'bad', date: it.checkedOn };
  if (it.status === 'moved') return { kind: 'moved', date: it.checkedOn, host: it.movedTo };
  if (it.status === 'ok') {
    if (it.changedOn && daysBetween(it.changedOn, todayStr) <= CHANGED_DAYS && daysBetween(it.changedOn, todayStr) >= 0) return { kind: 'changed', date: it.changedOn };
    return { kind: 'ok', date: it.checkedOn };
  }
  return { kind: 'none' };
}
export function validCourses(doc) {
  return !!doc && doc.schemaVersion === 1 && Array.isArray(doc.courses) && doc.courses.every((c) => c && typeof c.id === 'string' && typeof c.n === 'string' && Array.isArray(c.lv) && Array.isArray(c.ex));
}
export function validExams(doc) {
  return !!doc && doc.schemaVersion === 1 && Array.isArray(doc.exams) && Array.isArray(doc.hosts);
}
