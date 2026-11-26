#!/usr/bin/env node
// Daily official-site checker. For every URL in data/explore/exams.json it records: is the site reachable,
// did it move to another host, and did the page content change since the last run.
// It copies NO page text: it keeps only a hash. 1 request per URL per run, robots.txt respected,
// 2 s pause, 15 s timeout, honest User-Agent. Output: data/explore/linkstatus.json (written every run).
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostAllowed, parseHttps, stableJson, stripHtml } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_BYTES = 1_500_000;

// minimal robots.txt reader: returns true if `pathname` is disallowed for "*"
export function robotsDisallows(txt, pathname) {
  let applies = false; let seenAgent = false; const rules = [];
  for (const raw of String(txt).split('\n')) {
    const line = raw.split('#')[0].trim();
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!seenAgent) applies = false; seenAgent = true; if (v === '*') applies = true; }
    else { seenAgent = false; if (applies && k === 'disallow' && v) rules.push(v); if (applies && k === 'allow' && v) rules.push('!' + v); }
  }
  let blocked = false, best = -1;
  for (const r of rules) { const allow = r.startsWith('!'); const p = allow ? r.slice(1) : r; if (pathname.startsWith(p) && p.length > best) { best = p.length; blocked = !allow; } }
  return blocked;
}
export function pageHash(html) {
  const noScripts = String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return createHash('sha256').update(stripHtml(noScripts)).digest('hex').slice(0, 16);
}

export async function runCheck(opts = {}) {
  const dataDir = opts.dataDir ?? path.join(ROOT, 'data', 'explore');
  const log = opts.log ?? ((...a) => console.log(...a));
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const pauseMs = opts.pauseMs ?? 2000;
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const ua = `StudIn-Explore/1.0 (+${opts.repoUrl ?? process.env.EXPLORE_REPO_URL ?? 'https://github.com/OWNER/REPO'}; contact: ${opts.contact ?? process.env.EXPLORE_CONTACT ?? 'SET-EXPLORE_CONTACT-REPO-VARIABLE'})`;
  const exams = JSON.parse(await readFile(path.join(dataDir, 'exams.json'), 'utf8'));
  const file = path.join(dataDir, 'linkstatus.json');
  const prev = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : { items: {} };
  const out = { schemaVersion: 1, checkedOn: today, items: {} };
  const robotsCache = new Map();
  const rows = [];
  const get = async (url) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try { return await fetchImpl(url, { headers: { 'User-Agent': ua, Accept: 'text/html,*/*' }, signal: ctl.signal, redirect: 'follow' }); } finally { clearTimeout(t); }
  };
  let first = true;
  for (const ex of exams.exams) {
    const u = parseHttps(ex.url); const before = prev.items?.[ex.id];
    const keep = (extra) => ({ url: ex.url, ...extra });
    if (!u || !hostAllowed(u.hostname, exams.hosts)) { out.items[ex.id] = keep({ status: 'invalid', checkedOn: today }); rows.push([ex.id, 'INVALID', 'url not https or host not in hosts']); continue; }
    if (!first) await sleep(pauseMs); first = false;
    try {
      if (!robotsCache.has(u.hostname)) {
        let txt = '';
        try { const r = await get(`https://${u.hostname}/robots.txt`); if (r.status === 200) txt = await r.text(); } catch (e) { /* no robots.txt: allowed */ }
        robotsCache.set(u.hostname, txt);
        await sleep(pauseMs);
      }
      if (robotsDisallows(robotsCache.get(u.hostname), u.pathname)) { out.items[ex.id] = keep({ status: 'robots', checkedOn: today }); rows.push([ex.id, 'SKIPPED', 'robots.txt disallows']); continue; }
      const res = await get(ex.url);
      const finalHost = res.url ? new URL(res.url).hostname : u.hostname;
      if (res.status !== 200) { out.items[ex.id] = keep({ status: 'error', http: res.status, checkedOn: today, lastOk: before?.lastOk, hash: before?.hash, changedOn: before?.changedOn }); rows.push([ex.id, 'ERROR', 'HTTP ' + res.status]); continue; }
      const body = await res.text();
      if (body.length > MAX_BYTES) throw new Error('response too large');
      const hash = pageHash(body);
      const moved = finalHost.replace(/^www\./, '') !== u.hostname.replace(/^www\./, '');
      const changed = before?.hash && before.hash !== hash;
      out.items[ex.id] = keep({ status: moved ? 'moved' : 'ok', http: 200, checkedOn: today, lastOk: today, hash, changedOn: changed ? today : before?.changedOn, ...(moved ? { movedTo: finalHost } : {}) });
      rows.push([ex.id, moved ? 'MOVED' : 'OK', (moved ? 'now ' + finalHost + '; ' : '') + (changed ? 'page changed today' : 'unchanged or first check')]);
    } catch (err) {
      const msg = err && err.name === 'AbortError' ? 'timeout' : String(err && err.message || err);
      out.items[ex.id] = keep({ status: 'error', http: 0, checkedOn: today, lastOk: before?.lastOk, hash: before?.hash, changedOn: before?.changedOn });
      rows.push([ex.id, 'ERROR', msg]);
    }
  }
  const ok = rows.filter((r) => r[1] === 'OK').length;
  const md = ['## Official links check', '', `Date: ${today} · ${ok}/${rows.length} reachable`, '', '| Link | State | Detail |', '|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') + '\n';
  log(md);
  if (!opts.noWrite) await writeFile(file, stableJson(out));
  const sum = 'summaryFile' in opts ? opts.summaryFile : process.env.GITHUB_STEP_SUMMARY;   // null = tests: write nothing
  if (sum) await writeFile(sum, md, { flag: 'a' });
  return { out, rows, ok, total: rows.length, allFailed: rows.length > 0 && ok === 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCheck().then((r) => { if (r.allFailed) { console.error('Every link check failed (network problem?). Not committing.'); process.exit(2); } })
    .catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}
