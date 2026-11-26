#!/usr/bin/env node
// Looks at every feed URL in scripts/explore/pib-feed-urls.txt ONCE (polite, from your computer) and works out
// its language (from the script of the headlines) and region (from the channel title). It never guesses silently:
// it prints a table, and with --apply it adds the feeds to data/explore/sources.json for you to review.
//   EXPLORE_CONTACT=you@example.com node scripts/explore/discover-pib.mjs           (just look)
//   EXPLORE_CONTACT=you@example.com node scripts/explore/discover-pib.mjs --apply   (add to sources.json)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, channelInfo, guessLanguage, guessStates, parseHttps, hostAllowed, stableJson } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const apply = process.argv.includes('--apply');
const includeOther = process.argv.includes('--include-other');
const ua = `StudIn-Explore/1.0 (+${process.env.EXPLORE_REPO_URL ?? 'https://github.com/OWNER/REPO'}; contact: ${process.env.EXPLORE_CONTACT ?? 'SET-EXPLORE_CONTACT'})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urls = (await readFile(path.join(HERE(), 'pib-feed-urls.txt'), 'utf8')).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
function HERE() { return path.dirname(fileURLToPath(import.meta.url)); }
const srcFile = path.join(ROOT, 'data', 'explore', 'sources.json');
const doc = JSON.parse(await readFile(srcFile, 'utf8'));
const known = new Set(doc.sources.map((s) => s.feedUrl));
const rows = [];
let first = true;
for (const url of [...new Set(urls)]) {
  const u = new URL(url); const mod = u.searchParams.get('ModId'); const lang = u.searchParams.get('Lang'); const reg = u.searchParams.get('Regid');
  if (mod !== '6' && !includeOther) { rows.push({ url, state: 'SKIPPED', note: 'ModId=' + mod + ' is not press releases' }); continue; }
  if (!first) await sleep(2000); first = false;
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/rss+xml, application/xml, text/xml' }, signal: ctl.signal }).finally(() => clearTimeout(timer));
    if (res.status !== 200) { rows.push({ url, state: 'ERROR', note: 'HTTP ' + res.status }); continue; }
    const xml = await res.text(); const feed = parseFeed(xml);
    if (feed.error || !feed.items.length) { rows.push({ url, state: 'ERROR', note: feed.error || 'no items' }); continue; }
    const info = channelInfo(xml); const sample = feed.items.slice(0, 8).map((i) => i.title).join(' ');
    const g = guessLanguage(sample); const lg = /^[a-z]{2,3}$/.test(info.language) ? info.language : g.code;
    const states = guessStates(info.title + ' ' + sample);
    rows.push({ url, state: 'OK', lang, reg, title: info.title, language: lg, ambiguous: g.ambiguous && !/^[a-z]{2,3}$/.test(info.language), states, items: feed.items.length, sample: feed.items[0].title.slice(0, 70) });
  } catch (e) { rows.push({ url, state: 'ERROR', note: e && e.name === 'AbortError' ? 'timeout' : String(e && e.message || e) }); }
}
console.log('\nLang= Reg=  language  states-guess                    channel title / sample headline');
for (const r of rows) console.log(r.state === 'OK' ? `${String(r.lang).padEnd(5)} ${String(r.reg).padEnd(4)}  ${(r.language || '?') + (r.ambiguous ? '?' : '')}`.padEnd(24) + `${(r.states.join(', ') || '(set by hand)').padEnd(32)} ${r.title || ''} | ${r.sample}` : `${r.state}  ${r.url}  ${r.note || ''}`);
console.log('\n"?" after a language means the script is shared (Devanagari = Hindi or Marathi, Bengali script = Bengali or Assamese): check it.');
if (!apply) { console.log('Run again with --apply to add these feeds to data/explore/sources.json.'); process.exit(0); }
let added = 0;
for (const r of rows.filter((x) => x.state === 'OK' && !known.has(x.url))) {
  const p = parseHttps(r.url); if (!p || !hostAllowed(p.hostname, ['pib.gov.in'])) continue;
  const section = (r.title || `PIB region ${r.reg}`).replace(/[<>]/g, '').slice(0, 60);
  doc.sources.push({ id: `pib-r${r.reg}-l${r.lang}`, name: 'PIB', homepage: 'https://pib.gov.in/', feedUrl: r.url, type: 'rss', language: r.language || 'en', level: ['any'], domains: ['pib.gov.in'], termsNote: 'PIB press releases. Title, date and link only. Language and states were detected automatically: review them.', checkedOn: new Date().toISOString().slice(0, 10), enabled: true, filter: 'education', section, ...(r.states.length ? { states: r.states } : {}) });
  added++;
}
await writeFile(srcFile, stableJson(doc));
console.log(`\nAdded ${added} source(s) to data/explore/sources.json. Open it, check "language" and "states" for each pib-r... entry, then run: npm run explore:update`);
