// Fetcher + data-contract tests. Local fixtures only, no network.
import { readFileSync, mkdtempSync, cpSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFetch } from '../scripts/explore/fetch-feeds.mjs';
import { validateAll } from '../scripts/explore/validate.mjs';
import { parseFeed, stripHtml, validateItem, idFor } from '../scripts/explore/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FIX = (n) => readFileSync(path.join(HERE, 'fixtures/explore', n), 'utf8');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

function tmpData(onlySource) {
  const dir = mkdtempSync(path.join(tmpdir(), 'explore-'));
  cpSync(path.join(ROOT, 'data/explore'), dir, { recursive: true });
  // start from empty feed so only fixtures count
  for (const f of readdirSync(path.join(dir, 'feed'))) writeFileSync(path.join(dir, 'feed', f), '');
  writeFileSync(path.join(dir, 'curated.json'), JSON.stringify({ schemaVersion: 1, items: [] }));
  const s = JSON.parse(readFileSync(path.join(dir, 'sources.json'), 'utf8'));
  s.sources.forEach((x) => { if (x.type === 'rss') x.enabled = x.id === onlySource; });
  writeFileSync(path.join(dir, 'sources.json'), JSON.stringify(s));
  for (const f of readdirSync(path.join(dir, 'feed'))) { try { require; } catch {} }
  return dir;
}
import { rmSync } from 'node:fs';
function fresh(only = 'pib') { const d = tmpData(only); rmSync(path.join(d, 'feed'), { recursive: true }); rmSync(path.join(d, 'index.json')); rmSync(path.join(d, 'status.json')); return d; }
const res = (body, status = 200, url = 'https://pib.gov.in/RssMain.aspx') => ({ status, url, text: async () => body });
const quiet = () => {};
const run = (dir, body, extra = {}) => runFetch({ dataDir: dir, log: quiet, pauseMs: 0, now: new Date('2026-11-22T06:00:00Z'), summaryFile: null, fetchImpl: async () => (typeof body === 'function' ? body() : res(body)), ...extra });
const months = (dir) => (existsSync(path.join(dir, 'feed')) ? readdirSync(path.join(dir, 'feed')) : []);
const items = (dir) => months(dir).flatMap((f) => JSON.parse(readFileSync(path.join(dir, 'feed', f), 'utf8')).items);

// native-language filter (Kannada / Tamil headlines)
{
  const { isEducation } = await import('../scripts/explore/lib.mjs');
  const rules = JSON.parse(readFileSync(path.join(ROOT, 'scripts/explore/keywords.json'), 'utf8'));
  ok(isEducation({ title: 'ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿ ಆಹ್ವಾನ', hints: [] }, rules).ok, 'Kannada scholarship headline kept');
  ok(isEducation({ title: 'பள்ளி மாணவர்களுக்கு புதிய திட்டம்', hints: [] }, rules).ok, 'Tamil school headline kept');
  ok(!isEducation({ title: 'ರೈಲು ಮಾರ್ಗ ಉದ್ಘಾಟನೆ', hints: [] }, rules).ok, 'Kannada railway headline dropped');
}
// parser
{
  const p = parseFeed(FIX('valid.xml'), ['category']);
  eq(p.items.length, 4, 'valid: 4 raw items');
  eq(p.items[0].hints, ['Ministry of Education'], 'category hint read');
  eq(p.items[1].title, 'NEET exam last date extended', 'CDATA unwrapped');
  eq(p.items[3].title, 'Skilling programme launched for youth & students', 'entities decoded');
  ok(!JSON.stringify(p).includes('MUST NEVER'), 'description never read');
  ok(parseFeed(FIX('empty.xml')).items.length === 0 && !parseFeed(FIX('empty.xml')).error, 'empty feed: no items, no error');
  ok(parseFeed('<html>nope</html>').error, 'non-feed rejected');
  ok(parseFeed(FIX('malformed.xml')).items.length === 0, 'malformed: no crash, no item');
  eq(stripHtml('<b>a</b> &lt;i&gt;b&lt;/i&gt;  c'), 'a b c', 'stripHtml');
}
// valid run: education filter, dedupe, month file, contract valid
{
  const d = fresh();
  const r = await run(d, FIX('valid.xml'));
  ok(!r.allFailed && r.succeeded === 1, 'valid: success');
  const it = items(d);
  eq(it.map((i) => i.url).sort(), ['https://pib.gov.in/PressReleasePage.aspx?PRID=1001', 'https://pib.gov.in/PressReleasePage.aspx?PRID=1004', 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1002'], 'railway item filtered out, 3 education items kept');
  ok(it.every((i) => i.summary === ''), 'auto items have empty summary');
  eq(it.find((i) => i.url.endsWith('1002')).kind, 'deadline', 'kind rule: last date -> deadline');
  eq(await validateAll(d), [], 'output passes explore:validate');
  // second identical run: nothing meaningful changed
  const before = readFileSync(path.join(d, 'index.json'), 'utf8');
  const r2 = await run(d, FIX('valid.xml'), { now: new Date('2026-11-23T06:00:00Z') });
  ok(r2.changed === false, 'rerun with same data: changed=false (no timestamp-only commits)');
  eq(readFileSync(path.join(d, 'index.json'), 'utf8'), before, 'index.json untouched');
}
// empty / malformed => error or no items; previous data kept
{
  const d = fresh();
  await run(d, FIX('valid.xml'));
  const n = items(d).length;
  const r = await run(d, FIX('malformed.xml'));
  ok(r.allFailed, 'malformed feed counted as failure');
  eq(items(d).length, n, 'malformed: previous items kept');
  const r2 = await run(d, '', {});
  ok(r2.allFailed, 'empty body is a failure');
  const r3 = await run(d, FIX('empty.xml'));
  ok(!r3.allFailed && items(d).length === n, 'empty feed: success, data kept');
  const r4 = await run(d, () => res('x', 503));
  ok(r4.allFailed && r4.summary[0].detail.includes('HTTP 503'), 'non-200 logged');
  const r5 = await run(d, () => { const e = new Error('t'); e.name = 'AbortError'; throw e; });
  ok(r5.allFailed && r5.summary[0].detail.includes('timeout'), 'timeout logged');
  const st = JSON.parse(readFileSync(path.join(d, 'status.json'), 'utf8'));
  ok(st.sources.pib.lastError, 'status.json records lastError');
  eq(items(d).length, n, 'errors never delete data');
  const r6 = await run(d, () => res(FIX('valid.xml'), 200, 'https://evil.example/feed'));
  ok(r6.allFailed && r6.summary[0].detail.includes('redirected'), 'redirect to non-allowlisted host rejected');
}
// huge title, HTML in title
{
  const d = fresh(); const r = await run(d, FIX('huge-title.xml'));
  eq(items(d).length, 0, 'huge title rejected'); ok(r.rejected.length === 1, 'huge title logged as rejected');
  const d2 = fresh(); await run(d2, FIX('html-title.xml'));
  const t = items(d2).map((i) => i.title);
  ok(t.length === 2 && t.every((x) => !x.includes('<') && !x.includes('>')), 'HTML stripped from titles: ' + JSON.stringify(t));
  ok(!t.join('').includes('<script'), 'no script tag text');
}
// links
{
  const d = fresh(); const r = await run(d, FIX('bad-links.xml'));
  eq(items(d).map((i) => i.url), ['https://pib.gov.in/PressReleasePage.aspx?PRID=4005'], 'only https + allowlisted host kept');
  eq(r.rejected.length, 4, '4 bad links rejected');
}
// duplicates
{
  const d = fresh(); await run(d, FIX('duplicates.xml'));
  eq(items(d).length, 1, 'duplicate items deduped by id');
}
// blocklist -> review queue, not published
{
  const d = fresh(); await run(d, FIX('blocklisted.xml'));
  eq(items(d).map((i) => i.title), ['Student scholarship portal reopens'], 'blocklisted title not published');
  const q = JSON.parse(readFileSync(path.join(d, 'review-queue.json'), 'utf8'));
  eq(q.items.map((i) => i.matched), ['suicide'], 'blocklisted item in review-queue.json');
}
// curated: authoritative, summary allowed, removal propagates
{
  const d = fresh('none');
  const cur = JSON.parse(readFileSync(path.join(ROOT, 'data/explore/curated.json'), 'utf8'));
  writeFileSync(path.join(d, 'curated.json'), JSON.stringify(cur));
  await run(d, '', { noNetwork: true });
  eq(items(d).length, 10, 'curated merged into month files');
  cur.items.pop(); writeFileSync(path.join(d, 'curated.json'), JSON.stringify(cur));
  await run(d, '', { noNetwork: true });
  eq(items(d).length, 9, 'item removed from curated.json is removed from feed');
  eq(await validateAll(d), [], 'curated output valid');
}
// contract negatives
{
  const d = fresh('none');
  const cur = JSON.parse(readFileSync(path.join(ROOT, 'data/explore/curated.json'), 'utf8'));
  cur.items[0].url = 'http://www.ugc.gov.in/'; cur.items[1].title = 'x'.repeat(201);
  writeFileSync(path.join(d, 'curated.json'), JSON.stringify(cur));
  await run(d, '', { noNetwork: true });
  const errs = await validateAll(d);
  ok(errs.length === 2 && errs.every((e) => e.startsWith('curated.json[')), 'validator flags exactly the 2 bad curated items: ' + JSON.stringify(errs));
  eq(items(d).length, 8, 'run drops the 2 invalid curated items from the feed');
  const src = JSON.parse(readFileSync(path.join(ROOT, 'data/explore/sources.json'), 'utf8')).sources;
  const base = cur.items[2];
  const bad = { ...base, summary: 'x' };
  ok(validateItem(bad, src.find((s) => s.id === base.sourceId), { curated: false }).some((e) => e.includes('summary')), 'summary on non-curated item rejected');
  ok(validateItem({ ...base, url: 'https://www.ugc.gov.in/', id: idFor('https://www.ugc.gov.in/'), sourceId: 'nta' }, src.find((s) => s.id === 'nta'), { curated: true }).some((e) => e.includes('allowlisted')), 'cross-source host rejected');
}
// inbox import (files saved from a browser; no network)
{
  const { runImport } = await import('../scripts/explore/import-inbox.mjs');
  const d = fresh('none'); const inbox = path.join(d, 'inbox'); const { mkdirSync } = await import('node:fs'); mkdirSync(inbox);
  writeFileSync(path.join(inbox, 'lang6-reg17.xml'), '<rss version="2.0"><channel><title>PIB Bengaluru</title><item><title>ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿ ಆಹ್ವಾನ</title><link>https://pib.gov.in/PressReleasePage.aspx?PRID=9001</link><pubDate>Fri, 20 Nov 2026 10:30:00 +0530</pubDate></item><item><title>ರೈಲು ಮಾರ್ಗ ಉದ್ಘಾಟನೆ</title><link>https://pib.gov.in/PressReleasePage.aspx?PRID=9002</link><pubDate>Fri, 20 Nov 2026 11:00:00 +0530</pubDate></item></channel></rss>');
  writeFileSync(path.join(inbox, 'wrongname.xml'), '<rss><channel><item><title>x</title></item></channel></rss>');
  const r = await runImport({ dataDir: d, log: () => {} });
  ok(r.imported === 1 && r.skipped.length === 1, 'import: 1 file used, 1 skipped for its name');
  const src = JSON.parse(readFileSync(path.join(d, 'sources.json'), 'utf8')).sources.find((s) => s.id === 'pib-r17-l6');
  ok(src && src.language === 'kn' && src.states.join() === 'Karnataka' && src.section === 'PIB Bengaluru', 'import: source created with detected language, state and section');
  const got = items(d);
  ok(got.length === 1 && got[0].lang === 'kn' && got[0].section === 'PIB Bengaluru' && got[0].states.join() === 'Karnataka', 'import: education item kept with section and state; railway item filtered');
  eq(await validateAll(d), [], 'import output passes explore:validate');
}
// real repo data
eq(await validateAll(), [], 'repo data/explore validates');
console.log(`explore fetcher/contract tests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
