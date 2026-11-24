// Courses explorer logic + daily link checker. Local data and fake fetch only.
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../bal/explore/courses-logic.js';
import { runCheck, robotsDisallows, pageHash } from '../scripts/explore/check-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => JSON.parse(readFileSync(path.join(ROOT, 'data/explore', f), 'utf8'));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };

const courses = J('courses.json'), exams = J('exams.json'), states = J('states.json');
const em = C.examMap(exams); const idx = C.buildIndex(courses.courses, em);
ok(C.validCourses(courses) && C.validExams(exams), 'data docs valid');
ok(states.states.length === 36, '28 states + 8 UTs = 36 (got ' + states.states.length + ')');
ok(courses.courses.every((c) => c.ex.every((id) => em.has(id))), 'every course exam id exists');
ok(exams.exams.filter((e) => e.scope === 'state').every((e) => states.states.includes(e.state)), 'every state exam names a real state');
ok(courses.courses.some((c) => c.tp === 'non-general') && courses.courses.some((c) => c.tp === 'general'), 'both general and non-general courses');
const f = (o) => C.filterCourses(idx, o).map((c) => c.id);
ok(f({}).length === courses.courses.length, 'no filter = all');
ok(f({ stream: 'commerce' }).every((id) => { const c = courses.courses.find((x) => x.id === id); return c.st === 'any' || c.st.includes('commerce'); }), 'stream filter');
ok(!f({ stream: 'arts' }).includes('mbbs-medicine'), 'MBBS not in Arts');
ok(f({ stream: 'pcb' }).includes('mbbs-medicine'), 'MBBS in PCB');
ok(f({ level: 'after10' }).every((id) => courses.courses.find((x) => x.id === id).lv.includes('after10')), 'level filter');
ok(f({ type: 'non-general' }).length > 20 && f({ type: 'non-general' }).every((id) => courses.courses.find((x) => x.id === id).tp === 'non-general'), 'non-general filter');
ok(f({ q: 'pilot' }).some((id) => id.includes('pilot')), 'search by name');
ok(f({ q: 'neet' }).includes('mbbs-medicine'), 'search by tag');
ok(f({ q: 'kcet' }).includes('b-tech-be-engineering'), 'search by exam id name');
ok(f({ q: 'zzzzqqq' }).length === 0, 'no match');
ok(f({ q: 'MERCHANT   navy!' }).length > 0, 'search is case/space/punctuation tolerant');
ok(f({ q: 'pilot' })[0].includes('pilot') || f({ q: 'pilot' })[0].includes('drone'), 'name matches rank first');
const eng = courses.courses.find((c) => c.id === 'b-tech-be-engineering');
const none = C.examsFor(eng, em, '');
ok(none.state.length === 0 && none.hiddenState > 5 && none.national.length >= 3, 'no state: national only + hint count');
const ka = C.examsFor(eng, em, 'Karnataka');
ok(ka.state.map((e) => e.id).join() === 'kcet' && ka.hiddenState === 0, 'Karnataka shows KCET');
ok(C.examsFor(eng, em, 'Goa').noneForState === true, 'state without exam gets the "none yet" flag');
// link state
const links = { items: { a: { status: 'ok', checkedOn: '2026-11-24', changedOn: '2026-11-20' }, b: { status: 'ok', checkedOn: '2026-11-24', changedOn: '2026-09-01' }, c: { status: 'error', checkedOn: '2026-11-24' }, d: { status: 'moved', movedTo: 'x.gov.in', checkedOn: '2026-11-24' } } };
ok(C.linkState(links, 'a', '2026-11-24').kind === 'changed', 'recent change flagged');
ok(C.linkState(links, 'b', '2026-11-24').kind === 'ok', 'old change not flagged');
ok(C.linkState(links, 'c', '2026-11-24').kind === 'bad' && C.linkState(links, 'd', '2026-11-24').kind === 'moved' && C.linkState(links, 'zz', '2026-11-24').kind === 'none', 'bad / moved / none');
ok(C.linkState(null, 'a', '2026-11-24').kind === 'none', 'no linkstatus file = no badges');
// robots + hash
ok(robotsDisallows('User-agent: *\nDisallow: /private\n', '/private/x') && !robotsDisallows('User-agent: *\nDisallow: /private\n', '/open'), 'robots basic');
ok(!robotsDisallows('User-agent: *\nDisallow: /\nAllow: /exams\n', '/exams/jee') && robotsDisallows('User-agent: *\nDisallow: /\nAllow: /exams\n', '/other'), 'robots allow overrides');
ok(!robotsDisallows('User-agent: googlebot\nDisallow: /\n', '/x'), 'robots other agents ignored');
ok(pageHash('<p>a</p><script>x=1</script>') === pageHash('<p>a</p><script>x=2</script>') && pageHash('<p>a</p>') !== pageHash('<p>b</p>'), 'hash ignores scripts, sees text');
// daily checker with fake fetch
const dir = mkdtempSync(path.join(tmpdir(), 'lk-')); cpSync(path.join(ROOT, 'data/explore'), dir, { recursive: true });
const ex2 = J('exams.json'); ex2.exams = ex2.exams.slice(0, 6); writeFileSync(path.join(dir, 'exams.json'), JSON.stringify(ex2));
const ids = ex2.exams.map((e) => e.id);
let version = 1;
const fake = async (url) => {
  const h = new URL(url).hostname;
  if (url.endsWith('/robots.txt')) return { status: h === new URL(ex2.exams[1].url).hostname ? 200 : 404, url, text: async () => 'User-agent: *\nDisallow: /' };
  if (url === ex2.exams[2].url) return { status: 503, url, text: async () => '' };
  if (url === ex2.exams[3].url) return { status: 200, url: 'https://elsewhere.example/', text: async () => '<p>moved</p>' };
  if (url === ex2.exams[4].url) { const e = new Error('t'); e.name = 'AbortError'; throw e; }
  return { status: 200, url, text: async () => `<html><script>var t=${Math.random()}</script><p>page v${version}</p></html>` };
};
const q = { dataDir: dir, log: () => {}, fetchImpl: fake, pauseMs: 0, summaryFile: null, now: new Date('2026-11-24T02:00:00Z') };
const r1 = await runCheck(q);
const it = r1.out.items;
ok(it[ids[0]].status === 'ok' && it[ids[0]].hash && !it[ids[0]].changedOn, 'ok + hash on first run, no change flagged');
ok(it[ids[1]].status === 'robots', 'robots.txt disallow respected (page not fetched)');
ok(it[ids[2]].status === 'error' && it[ids[2]].http === 503, 'HTTP error recorded');
ok(it[ids[3]].status === 'moved' && it[ids[3]].movedTo === 'elsewhere.example', 'redirect to another host = moved');
ok(it[ids[4]].status === 'error', 'timeout recorded as error');
version = 2;
const r2 = await runCheck({ ...q, now: new Date('2026-11-25T02:00:00Z') });
ok(r2.out.items[ids[0]].changedOn === '2026-11-25', 'content change detected next day');
ok(r2.out.checkedOn === '2026-11-25', 'checkedOn bumped every run (daily proof of life)');
const r3 = await runCheck({ ...q, now: new Date('2026-11-26T02:00:00Z') });
ok(r3.out.items[ids[0]].changedOn === '2026-11-25', 'changedOn kept when page unchanged');
ok(JSON.stringify(r1.out).indexOf('page v') === -1, 'no page text stored (hash only)');
const rAll = await runCheck({ ...q, fetchImpl: async () => { throw new Error('offline'); }, noWrite: true });
ok(rAll.allFailed, 'all links failing is reported (workflow will not commit)');
console.log(`explore courses/links tests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
