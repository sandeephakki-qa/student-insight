#!/usr/bin/env node
// Explore feed fetcher. Runs ONLY in GitHub Actions (or by hand). Browsers never call source sites.
// Usage: node scripts/explore/fetch-feeds.mjs [--no-network] [--raw=N]
//   --no-network : skip every feed request, only merge curated.json into the month files
// Env: EXPLORE_REPO_URL, EXPLORE_CONTACT (User-Agent), GITHUB_STEP_SUMMARY (job summary file)
import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFeed, toDateString, validateItem, validateSources, idFor, monthOf, isEducation, classify, blocked,
  mergeById, stableJson, pruneMonths, hostAllowed
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TIMEOUT_MS = 15000;
const MAX_BYTES = 3_000_000;

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
};
const strip = (obj, keys) => JSON.parse(JSON.stringify(obj, (k, v) => (keys.includes(k) ? undefined : v)));

// Writes only when content differs once volatile keys (timestamps) are ignored. Returns true if written.
async function writeIfMeaningful(file, next, volatileKeys = []) {
  const old = existsSync(file) ? await readJson(file) : null;
  if (old && JSON.stringify(strip(old, volatileKeys)) === JSON.stringify(strip(next, volatileKeys))) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stableJson(next));
  return true;
}

export async function runFetch(opts = {}) {
  const dataDir = opts.dataDir ?? path.join(ROOT, 'data', 'explore');
  const rulesDir = opts.rulesDir ?? HERE;
  const log = opts.log ?? ((...a) => console.log(...a));
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const pauseMs = opts.pauseMs ?? 2000;
  const noNetwork = !!opts.noNetwork;
  const rawN = opts.rawN ?? 20;
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const ua = `StudIn-Explore/1.0 (+${opts.repoUrl ?? process.env.EXPLORE_REPO_URL ?? 'https://github.com/OWNER/REPO'}; contact: ${opts.contact ?? process.env.EXPLORE_CONTACT ?? 'SET-EXPLORE_CONTACT-REPO-VARIABLE'})`;

  const sourcesDoc = await readJson(path.join(dataDir, 'sources.json'));
  const srcErrors = validateSources(sourcesDoc);
  if (srcErrors.length) { srcErrors.forEach((e) => log('SOURCES INVALID:', e)); throw new Error('sources.json invalid'); }
  const sources = new Map(sourcesDoc.sources.map((s) => [s.id, s]));
  const rules = await readJson(path.join(rulesDir, 'keywords.json'));
  const blockWords = (await readJson(path.join(rulesDir, 'blocklist.json'))).words;
  const oldStatus = await readJson(path.join(dataDir, 'status.json'), { schemaVersion: 1, sources: {} });
  const status = { schemaVersion: 1, sources: { ...oldStatus.sources } };
  const queue = (await readJson(path.join(dataDir, 'review-queue.json'), { schemaVersion: 1, items: [] }));
  const queueById = new Map(queue.items.map((i) => [i.id, i]));
  const summary = [];
  const fetched = []; // validated items from feeds
  const rejected = [];
  let attempted = 0, succeeded = 0;

  const rssSources = sourcesDoc.sources.filter((s) => s.enabled && s.type === 'rss');
  for (let i = 0; i < rssSources.length; i++) {
    const s = rssSources[i];
    const row = { id: s.id, state: 'SKIPPED', detail: '' };
    summary.push(row);
    if (noNetwork) { row.detail = '--no-network'; continue; }
    if (i > 0) await sleep(pauseMs);
    attempted++;
    const st = status.sources[s.id] = { ...(status.sources[s.id] || {}), lastAttempt: now.toISOString() };
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      let res;
      try { res = await fetchImpl(s.feedUrl, { headers: { 'User-Agent': ua, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: ctl.signal, redirect: 'follow' }); }
      finally { clearTimeout(timer); }
      if (res.status !== 200) throw new Error('HTTP ' + res.status);
      if (res.url && !hostAllowed(new URL(res.url).hostname, s.domains)) throw new Error('redirected to non-allowlisted host');
      const body = await res.text();
      if (body.length > MAX_BYTES) throw new Error('response too large');
      const parsed = parseFeed(body, rules.ministryHintTags);
      if (parsed.error) throw new Error(parsed.error);
      log(`[${s.id}] ${parsed.items.length} raw items; fields seen: ${[...new Set(parsed.items.flatMap((x) => x.fields))].join(', ') || '(none)'}`);
      parsed.items.slice(0, rawN).forEach((x, n) => log(`[${s.id}] raw ${n + 1}: ${JSON.stringify({ title: x.title, link: x.link, pubDate: x.pubDate, hints: x.hints })}`));
      let kept = 0, dropped = 0, rej = 0, held = 0;
      for (const x of parsed.items) {
        if (s.filter === 'education' && !isEducation(x, rules).ok) { dropped++; continue; }
        const date = toDateString(x.pubDate);
        const cls = classify(x.title, rules);
        const item = {
          id: idFor(x.link), title: x.title, date: date ?? '', checkedOn: today, source: s.name, sourceId: s.id, url: x.link,
          lang: s.language, states: Array.isArray(s.states) && s.states.length ? [...s.states] : ['all'], levels: [...(s.level.length ? s.level : ['any'])], topics: cls.topics, kind: cls.kind, summary: ''
        };
        const errs = validateItem(item, s);
        if (errs.length) { rej++; rejected.push({ source: s.id, title: x.title.slice(0, 80), errors: errs }); log(`[${s.id}] REJECTED "${x.title.slice(0, 60)}": ${errs.join('; ')}`); continue; }
        const hit = blocked(item.title, blockWords);
        if (hit) { held++; if (!queueById.has(item.id)) queueById.set(item.id, { id: item.id, title: item.title, url: item.url, sourceId: item.sourceId, date: item.date, matched: hit, queuedOn: today }); continue; }
        fetched.push(item); kept++;
      }
      row.state = 'OK'; row.detail = `${parsed.items.length} items, ${kept} kept, ${dropped} not education, ${rej} rejected, ${held} to review queue`;
      status.sources[s.id] = { ...st, lastSuccess: now.toISOString(), lastError: null, count: kept };
      succeeded++;
    } catch (err) {
      const msg = err && err.name === 'AbortError' ? 'timeout after 15 s' : String(err && err.message ? err.message : err);
      row.state = 'ERROR'; row.detail = msg + ' (previous data kept)';
      status.sources[s.id] = { ...st, lastError: msg };
      log(`[${s.id}] ERROR: ${msg}`);
    }
  }

  // curated (authoritative for curated sources)
  const curatedDoc = await readJson(path.join(dataDir, 'curated.json'), { schemaVersion: 1, items: [] });
  const curated = [];
  for (const c of curatedDoc.items) {
    const s = sources.get(c.sourceId);
    const errs = validateItem(c, s, { curated: true });
    if (!s || s.type !== 'curated' || !s.enabled) errs.push('sourceId is not an enabled curated source');
    if (errs.length) { rejected.push({ source: c.sourceId, title: String(c.title).slice(0, 80), errors: errs }); log(`[curated] REJECTED "${String(c.title).slice(0, 60)}": ${errs.join('; ')}`); continue; }
    curated.push(c);
  }
  const curatedIds = new Set(curated.map((c) => c.id));

  // month files
  const feedDir = path.join(dataDir, 'feed');
  await mkdir(feedDir, { recursive: true });
  const existingMonths = (await readdir(feedDir)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7));
  const byMonth = new Map();
  for (const m of existingMonths) {
    const doc = await readJson(path.join(feedDir, m + '.json'));
    // drop curated-source items that are no longer in curated.json
    byMonth.set(m, (doc.items || []).filter((it) => !(sources.get(it.sourceId)?.type === 'curated' && !curatedIds.has(it.id))));
  }
  const touch = (item) => { const m = monthOf(item.date); byMonth.set(m, mergeById(byMonth.get(m) || [], [item])); };
  fetched.forEach(touch);
  curated.forEach(touch); // curated last = wins on duplicate id
  const keep = new Set(pruneMonths([...byMonth.keys()].filter((m) => (byMonth.get(m) || []).length), 12));
  let changed = false;
  for (const m of existingMonths) if (!keep.has(m)) { await unlink(path.join(feedDir, m + '.json')); changed = true; log('pruned month', m); }
  for (const m of keep) if (await writeIfMeaningful(path.join(feedDir, m + '.json'), { schemaVersion: 1, month: m, items: byMonth.get(m) }, [])) changed = true;
  const months = [...keep].sort().reverse();
  const indexFile = path.join(dataDir, 'index.json');
  const oldIndex = existsSync(indexFile) ? await readJson(indexFile) : null;
  if (changed || !oldIndex || JSON.stringify(oldIndex.months) !== JSON.stringify(months)) {
    await writeFile(indexFile, stableJson({ updatedAt: now.toISOString(), months, schemaVersion: 1 })); changed = true;
  }
  if (await writeIfMeaningful(path.join(dataDir, 'status.json'), status, ['lastAttempt', 'lastSuccess'])) changed = true;
  const q = { schemaVersion: 1, items: [...queueById.values()].sort((a, b) => (a.id < b.id ? -1 : 1)) };
  if (q.items.length || existsSync(path.join(dataDir, 'review-queue.json'))) if (await writeIfMeaningful(path.join(dataDir, 'review-queue.json'), q, [])) changed = true;

  const lines = ['## Explore feed run', '', `Run date: ${today} · data changed: ${changed ? 'yes' : 'no'}`, '', '| Source | State | Detail |', '|---|---|---|', ...summary.map((r) => `| ${r.id} | ${r.state} | ${r.detail} |`)];
  if (rejected.length) lines.push('', `Rejected items: ${rejected.length} (see log)`);
  if (q.items.length) lines.push('', `Review queue: ${q.items.length} item(s) held back by the blocklist`);
  const md = lines.join('\n') + '\n';
  log(md);
  const sumFile = opts.summaryFile ?? process.env.GITHUB_STEP_SUMMARY;
  if (sumFile) await writeFile(sumFile, md, { flag: 'a' });
  const allFailed = attempted > 0 && succeeded === 0;
  return { changed, attempted, succeeded, allFailed, rejected, summary, months };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rawArg = args.find((a) => a.startsWith('--raw='));
  runFetch({ noNetwork: args.includes('--no-network'), rawN: rawArg ? Number(rawArg.slice(6)) : 20 })
    .then((r) => { if (r.allFailed) { console.error('All attempted sources failed: nothing to commit.'); process.exit(2); } })
    .catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}
