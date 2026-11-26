#!/usr/bin/env node
// Reads feed files YOU saved from your browser into data/explore/inbox/ (no website is contacted).
// Use this when a site blocks scripts (HTTP 403) but opens fine in Safari.
// File name must contain the PIB numbers:  lang6-reg17.xml  =  ...RssMain.aspx?ModId=6&Lang=6&Regid=17
// New feeds are added to data/explore/sources.json (language and states detected: review them),
// then the normal pipeline runs on the saved text: education filter, validation, month files.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, channelInfo, guessLanguage, guessStates, stableJson } from './lib.mjs';
import { runFetch } from './fetch-feeds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function runImport(opts = {}) {
  const dataDir = opts.dataDir ?? path.join(ROOT, 'data', 'explore');
  const inbox = opts.inboxDir ?? path.join(dataDir, 'inbox');
  const log = opts.log ?? ((...a) => console.log(...a));
  await mkdir(inbox, { recursive: true });
  const files = (await readdir(inbox)).filter((f) => /\.(xml|rss|txt)$/i.test(f));
  if (!files.length) { log(`No files in ${inbox}. Save a feed there first (see docs/explore/RUNBOOK.md, "When a site blocks scripts").`); return { imported: 0, skipped: [] }; }
  const srcFile = path.join(dataDir, 'sources.json');
  const doc = JSON.parse(await readFile(srcFile, 'utf8'));
  const byUrl = new Map(); const contents = new Map(); const ids = new Set(); const skipped = [];
  for (const f of files) {
    const m = /lang(\d+)[-_ ]*reg(?:id)?(\d+)/i.exec(f);
    if (!m) { skipped.push(`${f}: name must contain langN-regN, for example lang6-reg17.xml`); continue; }
    const [, lang, reg] = m; const url = `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=${lang}&Regid=${reg}`;
    const xml = await readFile(path.join(inbox, f), 'utf8'); const feed = parseFeed(xml);
    if (feed.error || !feed.items.length) { skipped.push(`${f}: ${feed.error || 'no items'} (did you save the page source, not a web archive?)`); continue; }
    let src = doc.sources.find((s) => s.feedUrl === url);
    if (!src) {
      const info = channelInfo(xml); const sample = feed.items.slice(0, 8).map((i) => i.title).join(' ');
      const g = guessLanguage(sample); const language = /^[a-z]{2,3}$/.test(info.language) ? info.language : (g.code || 'en'); const states = guessStates(info.title + ' ' + sample);
      src = { id: `pib-r${reg}-l${lang}`, name: 'PIB', homepage: 'https://pib.gov.in/', feedUrl: url, type: 'rss', language, level: ['any'], domains: ['pib.gov.in'], termsNote: 'PIB press releases, saved from a browser by the owner. Title, date and link only. Language and states detected automatically: review them.', checkedOn: new Date().toISOString().slice(0, 10), enabled: true, filter: 'education', section: (info.title || `PIB region ${reg}`).replace(/[<>]/g, '').slice(0, 60), ...(states.length ? { states } : {}) };
      doc.sources.push(src);
      log(`New feed ${src.id}: language ${src.language}${g.ambiguous ? '?' : ''}, states ${states.join(', ') || '(set by hand)'}, section "${src.section}"`);
    }
    byUrl.set(url, f); contents.set(url, xml); ids.add(src.id);
  }
  skipped.forEach((s) => log('SKIPPED ' + s));
  if (!ids.size) return { imported: 0, skipped };
  await writeFile(srcFile, stableJson(doc));
  const fetchImpl = async (url) => (contents.has(url) ? { status: 200, url, text: async () => contents.get(url) } : { status: 404, url, text: async () => '' });
  const r = await runFetch({ dataDir, log, fetchImpl, pauseMs: 0, onlySourceIds: ids, summaryFile: null });
  return { imported: ids.size, skipped, result: r };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runImport().then((r) => { if (r.result && r.result.allFailed) process.exit(2); }).catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
}
