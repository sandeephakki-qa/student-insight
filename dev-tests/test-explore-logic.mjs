// Filter, grouping, paging, link-safety, preferences storage. Node only.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../bal/explore/feed-logic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const domainMap = L.buildDomainMap({ sources: [{ id: 'pib', domains: ['pib.gov.in'] }, { id: 'ugc', domains: ['ugc.gov.in'] }] });
const mk = (o) => ({ id: o.id || 'a', title: 'T', date: '2026-11-20', checkedOn: '2026-11-20', source: 'PIB', sourceId: 'pib', url: 'https://pib.gov.in/x', lang: 'en', states: ['all'], levels: ['any'], topics: ['policy'], kind: 'news', summary: '', ...o });
const prefs = { v: 1, lang: 'en', state: '', level: 'ug', topics: [] };

// filters
ok(L.matchesPrefs(mk({}), prefs), 'any level + all states + en matches');
ok(!L.matchesPrefs(mk({ lang: 'hi' }), prefs), 'language mismatch (English user, Hindi item, no region)');
const kn = { ...prefs, lang: 'kn' };
ok(L.matchesPrefs(mk({ lang: 'kn' }), kn), 'Kannada item for Kannada user');
ok(L.matchesPrefs(mk({ lang: 'en', states: ['Karnataka'] }), kn), 'English item tagged Karnataka also shown to a Kannada user (regional data)');
ok(!L.matchesPrefs(mk({ lang: 'en', states: ['Kerala'] }), kn), 'other state English item not shown to a Kannada user');
ok(L.matchesPrefs(mk({ lang: 'hi', states: ['Bihar'] }), { ...prefs, lang: 'hi' }), 'Hindi belt state item shown to Hindi user');
eq(L.primaryStateFor('kn'), 'Karnataka', 'primary state for Kannada'); eq(L.primaryStateFor('hi'), '', 'no single state for Hindi'); eq(L.primaryStateFor('en'), '', 'none for English');
ok(!L.matchesPrefs(mk({ levels: ['school'] }), prefs), 'level mismatch');
ok(L.matchesPrefs(mk({ levels: ['school', 'ug'] }), prefs), 'level list contains');
ok(!L.matchesPrefs(mk({ states: ['Karnataka'] }), prefs), 'state item hidden when no state chosen');
ok(L.matchesPrefs(mk({ states: ['Karnataka'] }), { ...prefs, state: 'Karnataka' }), 'state match');
ok(!L.matchesPrefs(mk({ states: ['Kerala'] }), { ...prefs, state: 'Karnataka' }), 'other state hidden');
ok(L.matchesPrefs(mk({ states: ['all'] }), { ...prefs, state: 'Karnataka' }), '"all" always matches');
ok(!L.matchesPrefs(mk({ topics: ['policy'] }), { ...prefs, topics: ['exam'] }), 'topic filter excludes');
ok(L.matchesPrefs(mk({ topics: ['policy', 'exam'] }), { ...prefs, topics: ['exam'] }), 'topic filter includes');
ok(!L.matchesPrefs(mk({}), null), 'empty prefs matches nothing');
eq(L.collectStates([mk({ states: ['all'] }), mk({ states: ['Kerala', 'Assam'] })]), ['Assam', 'Kerala'], 'states derived from data, sorted');
// placeholder + safety in visibleItems
const items = [mk({ id: '1' }), mk({ id: '2', placeholder: true }), mk({ id: '3', url: 'http://pib.gov.in/x' }), mk({ id: '4', url: 'https://evil.example/x' }), mk({ id: '5', sourceId: 'zzz' })];
eq(L.visibleItems(items, { prefs, domainMap, qa: false }).map((i) => i.id), ['1'], 'prod: placeholder, http, bad host, unknown source hidden');
eq(L.visibleItems(items, { prefs, domainMap, qa: true }).map((i) => i.id), ['1', '2'], 'QA: placeholder shown');
ok(L.isSafeUrl('https://www.pib.gov.in/a', ['pib.gov.in']), 'subdomain ok');
ok(!L.isSafeUrl('https://pib.gov.in.evil.example/a', ['pib.gov.in']), 'look-alike host blocked');
ok(!L.isSafeUrl('https://user:pw@pib.gov.in/a', ['pib.gov.in']), 'credentials in url blocked');
ok(!L.isSafeUrl('javascript:alert(1)', ['pib.gov.in']) && !L.isSafeUrl('not a url', ['pib.gov.in']), 'junk urls blocked');
// day grouping, boundaries (date strings only)
eq(L.addDays('2026-03-01', -1), '2026-02-28', 'yesterday across month end');
eq(L.addDays('2027-01-01', -1), '2026-12-31', 'yesterday across year end');
eq(L.addDays('2024-03-01', -1), '2024-02-29', 'leap day');
const g = L.groupByDay([mk({ id: 'a', date: '2026-11-22' }), mk({ id: 'b', date: '2026-11-22' }), mk({ id: 'c', date: '2026-11-21' }), mk({ id: 'd', date: '2026-11-19' })], '2026-11-22');
eq(g.map((x) => [x.label, x.items.length]), [['today', 2], ['yesterday', 1], ['date', 1]], 'Today / Yesterday / dated groups');
eq(L.groupByDay([mk({ date: '2026-12-31' })], '2027-01-01')[0].label, 'yesterday', 'Yesterday across year boundary');
eq(L.groupByDay([mk({ date: '2026-11-23' })], '2026-11-22')[0].label, 'date', 'future date is a dated heading');
ok(/^\d{4}-\d{2}-\d{2}$/.test(L.localDateString(new Date(2026, 0, 5))) && L.localDateString(new Date(2026, 0, 5)) === '2026-01-05', 'localDateString zero-pads');
eq(L.formatDay('2026-11-01', 'en'), 'Nov 1, 2026', 'formatDay does not shift day (UTC safe)');
// paging
const big = Array.from({ length: 45 }, (_, i) => i);
eq([L.nextBatch(big, 0).length, L.nextBatch(big, 20).length, L.nextBatch(big, 40).length, L.nextBatch(big, 60).length], [20, 20, 5, 0], 'batches of 20');
eq(L.indexMonths({ schemaVersion: 1, months: ['2026-11', 'bad', '2026-10'] }), ['2026-11', '2026-10'], 'index months filtered');
eq(L.indexMonths({ schemaVersion: 2, months: ['2026-11'] }), [], 'unknown index schema ignored');
eq(L.indexMonths(null), [], 'null index ignored');
// preferences parsing
eq(L.parsePrefs(JSON.stringify(prefs)), prefs, 'valid prefs round trip');
eq(L.parsePrefs('{not json'), null, 'corrupt JSON -> null (picker shown again)');
eq(L.parsePrefs(JSON.stringify({ ...prefs, v: 0 })), null, 'old schema version -> null');
eq(L.parsePrefs(JSON.stringify({ ...prefs, v: 2 })), null, 'future schema version -> null');
eq(L.parsePrefs(JSON.stringify({ ...prefs, level: 'x' })), null, 'bad level -> null');
eq(L.parsePrefs(JSON.stringify({ ...prefs, topics: ['exam', 'evil', 'exam'] })).topics, ['exam'], 'unknown/duplicate topics dropped');
eq(L.parsePrefs(null), null, 'missing -> null');
// export / import code
const p2 = { v: 1, lang: 'hi', state: 'Tamil Nadu', level: 'pg', topics: ['exam', 'career'] };
eq(L.importCode(L.exportCode(p2)), p2, 'export/import code round trip');
eq(L.importCode('garbage'), null, 'bad code');
eq(L.importCode('STUDIN-EXPLORE-1:@@@'), null, 'bad base64');
eq(L.importCode('STUDIN-EXPLORE-1:' + Buffer.from('["en","","zz",[]]').toString('base64')), null, 'valid shape, invalid level');
// storage layer with blocked / throwing storage
const store = await import('../dal/explore/explore-data.js');
globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } };
eq(store.readPrefsText(), null, 'blocked storage: read -> null, no throw');
eq(store.writePrefsText('x'), false, 'blocked storage: write -> false, no throw');
store.clearPrefs(); ok(true, 'blocked storage: clear does not throw');
const mem = {}; globalThis.window = { localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: (k) => { delete mem[k]; } } };
ok(store.writePrefsText(L.serializePrefs(prefs)) && L.parsePrefs(store.readPrefsText()).level === 'ug', 'normal storage round trip');
ok(Object.keys(mem).join() === 'studin.explore.prefs.v1', 'uses the versioned key only');
mem['studin.explore.prefs.v1'] = '{{{'; eq(L.parsePrefs(store.readPrefsText()), null, 'corrupt stored value -> null');
delete globalThis.window;
// link-safety source scan (grep-style): no HTML sinks and no iframes in Explore UI/BAL/DAL code
const scan = ['ui/explore', 'bal/explore', 'dal/explore'].flatMap((d) => readdirSync(path.join(ROOT, d)).map((f) => path.join(ROOT, d, f)));
const BAD = /\.innerHTML|insertAdjacentHTML|outerHTML|document\.write|<iframe|createElement\(\s*['"]iframe|\beval\(|new Function\(/;
for (const f of scan) ok(!BAD.test(readFileSync(f, 'utf8')), 'no HTML sink / iframe / eval in ' + path.relative(ROOT, f));
const ui = readFileSync(path.join(ROOT, 'ui/explore/explore-ui.js'), 'utf8');
ok(ui.includes("target: '_blank'") && ui.includes("rel: 'noopener noreferrer'"), 'card links carry target=_blank + rel');
ok(!/fetch\(\s*['"`]https?:/.test(scan.map((f) => readFileSync(f, 'utf8')).join('\n')), 'no absolute-URL fetch in Explore code');
console.log(`explore logic tests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
