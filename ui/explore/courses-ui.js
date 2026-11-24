// Courses explorer UI: Country > State, stream, level, type, search. Text only (no innerHTML).
// Every course links to the official admission site of its exam/body; details are never copied here.
import { srT } from '../../core/render-i18n.js';
import { STREAMS, COURSE_LEVELS, COURSE_PAGE, examMap, buildIndex, filterCourses, examsFor, linkState, validCourses, validExams } from '../../bal/explore/courses-logic.js';
import { localDateString, formatDay, isSafeUrl } from '../../bal/explore/feed-logic.js';
import { loadCourses, loadExams, loadStates, loadLinkStatus } from '../../dal/explore/explore-data.js';

const t = (k, p) => srT(k, p);
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v === false || v == null) continue; if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : String(v)); }
  for (const k of kids) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const S = { built: false, index: [], exams: new Map(), hosts: [], links: null, filters: { q: '', stream: '', level: '', type: '', state: '' }, results: [], shown: 0, host: null };

function countryOptions() {
  const sel = document.getElementById('country-select');
  const o = sel ? Array.from(sel.options).map((x) => ({ value: x.value, label: x.textContent })) : [];
  return o.length ? o : [{ value: 'IN', label: 'India' }];
}
function badge(examId) {
  const ls = linkState(S.links, examId, localDateString());
  if (ls.kind === 'none') return null;
  const text = ls.kind === 'ok' ? t('link_ok', { date: formatDay(ls.date, window.SR_LANG || 'en') })
    : ls.kind === 'changed' ? t('link_changed', { date: formatDay(ls.date, window.SR_LANG || 'en') })
    : ls.kind === 'moved' ? t('link_moved', { host: ls.host || '' }) : t('link_bad');
  return el('span', { class: 'cr-badge cr-' + ls.kind }, text);
}
function examLink(e) {
  const safe = isSafeUrl(e.url, S.hosts);
  const row = el('li', { class: 'cr-exam' });
  if (safe) row.append(el('a', { class: 'explore-link cr-examlink', href: e.url, target: '_blank', rel: 'noopener noreferrer' }, e.name, el('span', { class: 'sr-only' }, ' ' + t('explore_opens_new_tab')), el('span', { 'aria-hidden': 'true' }, ' ↗')));
  else row.append(document.createTextNode(e.name));
  const b = badge(e.id); if (b) row.append(' ', b);
  return row;
}
function card(c) {
  const ex = examsFor(c, S.exams, S.filters.state);
  const all = [...ex.national, ...ex.state];
  const first = all.find((e) => isSafeUrl(e.url, S.hosts));
  const node = el('article', { class: 'explore-card cr-card' },
    el('div', { class: 'explore-kindrow' }, el('span', { class: 'explore-kind' }, c.tp === 'general' ? t('courses_general') : t('courses_nongeneral')), el('span', { class: 'cr-cat' }, c.cat)),
    el('h4', { class: 'explore-card-title' }, c.n),
    el('p', { class: 'explore-meta' }, el('strong', {}, t('courses_dur') + ' '), c.dur),
    el('p', { class: 'explore-meta' }, el('strong', {}, t('courses_typical') + ' '), c.el));
  if (all.length || ex.hiddenState || ex.noneForState) {
    const ul = el('ul', { class: 'cr-exams', 'aria-label': t('courses_exams') }); all.forEach((e) => ul.append(examLink(e)));
    node.append(el('p', { class: 'cr-h' }, t('courses_exams')), ul);
    if (ex.hiddenState) node.append(el('p', { class: 'explore-note' }, t('courses_state_hint', { n: ex.hiddenState })));
    if (ex.noneForState) node.append(el('p', { class: 'explore-note' }, t('courses_no_state_exam')));
  } else node.append(el('p', { class: 'explore-note' }, t('courses_no_exam')));
  if (first) node.append(el('a', { class: 'btn btn-primary cr-go', href: first.url, target: '_blank', rel: 'noopener noreferrer' }, t('courses_official'), el('span', { class: 'sr-only' }, ' ' + t('explore_opens_new_tab')), ' ↗'));
  return node;
}
function render(more) {
  const list = S.host.querySelector('#cr-list'), count = S.host.querySelector('#cr-count'), foot = S.host.querySelector('#cr-foot');
  if (!more) { S.results = filterCourses(S.index, S.filters); S.shown = 0; list.replaceChildren(); count.textContent = t('courses_count', { n: S.results.length }); }
  const batch = S.results.slice(S.shown, S.shown + COURSE_PAGE);
  batch.forEach((c) => list.append(card(c))); S.shown += batch.length;
  if (!S.results.length) { const b = el('button', { type: 'button', class: 'btn btn-secondary' }, t('courses_reset')); b.addEventListener('click', resetFilters); foot.replaceChildren(el('p', { class: 'explore-empty' }, t('courses_none')), b); }
  else if (S.shown < S.results.length) { const b = el('button', { type: 'button', class: 'btn btn-secondary' }, t('courses_more')); b.addEventListener('click', () => render(true)); foot.replaceChildren(b); }
  else foot.replaceChildren();
}
function resetFilters() {
  S.filters = { q: '', stream: '', level: '', type: '', state: S.filters.state };
  S.host.querySelector('#cr-q').value = ''; S.host.querySelector('#cr-level').value = ''; S.host.querySelector('#cr-type').value = '';
  S.host.querySelectorAll('input[name="cr-stream"]').forEach((r) => { r.checked = r.value === ''; });
  render(false);
}
function select(id, label, opts, value, onChange) {
  const s = el('select', { id, class: 'explore-field' }, ...opts.map((o) => el('option', { value: o.value, selected: o.value === value }, o.label)));
  s.addEventListener('change', () => onChange(s.value));
  return el('div', { class: 'cr-ctl' }, el('label', { for: id, class: 'explore-lbl' }, label), s);
}

// Called when the app language changes: jump the state filter to the language's home state.
export function applyState(state) {
  if (!S.built || !S.host) return;
  const sel = S.host.querySelector('#cr-state');
  if (!sel) return;
  const ok = !state || Array.from(sel.options).some((o) => o.value === state);
  sel.value = ok ? state : ''; S.filters.state = sel.value; render(false);
}
export async function buildCourses(host) {
  S.host = host;
  if (S.built) return;
  host.replaceChildren(el('p', { class: 'explore-status' }, t('explore_loading')));
  let courses, exams, states;
  try { [courses, exams, states] = await Promise.all([loadCourses(), loadExams(), loadStates()]); } catch (e) { courses = null; }
  if (!validCourses(courses) || !validExams(exams)) { host.replaceChildren(el('p', { class: 'explore-error' }, t('courses_failed'))); return; }
  try { S.links = await loadLinkStatus(); } catch (e) { S.links = null; }       // optional: no badges until the first daily check
  S.exams = examMap(exams); S.hosts = exams.hosts; S.index = buildIndex(courses.courses, S.exams);
  const country = (window.APP_COUNTRY_CODE || (document.getElementById('country-select') || {}).value || 'IN');
  const q = el('input', { type: 'search', id: 'cr-q', class: 'explore-code', autocomplete: 'off', placeholder: t('courses_search'), 'aria-label': t('courses_search') });
  let timer = null;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { S.filters.q = q.value; render(false); }, 150); });
  const streamSet = el('fieldset', { class: 'explore-fieldset cr-streams' }, el('legend', {}, t('courses_stream')),
    ...[['', t('stream_all')], ...STREAMS.map((s) => [s, t('stream_' + s)])].map(([v, l]) => {
      const r = el('input', { type: 'radio', name: 'cr-stream', value: v, checked: v === '' });
      r.addEventListener('change', () => { S.filters.stream = v; render(false); });
      return el('label', { class: 'explore-opt' }, r, ' ', l);
    }));
  const noData = country !== 'IN';
  host.replaceChildren(...[
    el('p', { class: 'explore-intro' }, t('courses_intro')),
    noData ? el('p', { class: 'explore-note' }, t('courses_country_none')) : null,
    el('div', { class: 'cr-controls' },
      select('cr-country', t('courses_country'), countryOptions(), 'IN', () => {}),
      select('cr-state', t('courses_state'), [{ value: '', label: t('courses_state_all') }, ...states.states.map((s) => ({ value: s, label: s }))], '', (v) => { S.filters.state = v; render(false); }),
      select('cr-level', t('courses_level'), [{ value: '', label: t('level_all') }, ...COURSE_LEVELS.map((l) => ({ value: l, label: t('level_' + l) }))], '', (v) => { S.filters.level = v; render(false); }),
      select('cr-type', t('courses_type'), [{ value: '', label: t('type_all') }, { value: 'general', label: t('type_general') }, { value: 'non-general', label: t('type_non') }], '', (v) => { S.filters.type = v; render(false); })),
    el('div', { class: 'cr-ctl cr-search' }, el('label', { for: 'cr-q', class: 'explore-lbl' }, t('courses_search')), q),
    streamSet,
    el('p', { id: 'cr-count', class: 'explore-status', role: 'status', 'aria-live': 'polite' }),
    el('p', { class: 'explore-note' }, t('courses_live_note')),
    el('div', { id: 'cr-list' }), el('div', { id: 'cr-foot', class: 'explore-foot' })].filter(Boolean));
  S.built = true;
  render(false);
}
