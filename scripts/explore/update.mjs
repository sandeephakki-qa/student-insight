#!/usr/bin/env node
// One command to refresh Explore data from YOUR computer (no GitHub Actions needed):
//   EXPLORE_CONTACT=you@example.com npm run explore:update            (fetch, check links, validate)
//   EXPLORE_CONTACT=you@example.com npm run explore:update -- --push  (also git add, commit, push)
// If a step fails completely (for example no internet) its files are put back exactly as they were,
// so you never commit "everything is broken" data.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(ROOT, 'data', 'explore');
const push = process.argv.includes('--push');

const snap = (dir = DATA, out = {}) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) snap(p, out); else out[p] = readFileSync(p); } return out; };
const restore = (s) => { rmSync(DATA, { recursive: true, force: true }); for (const [p, buf] of Object.entries(s)) { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, buf); } };
const run = (label, script) => {
  const before = snap();
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'explore', script)], { stdio: 'inherit', env: process.env });
  if (r.status === 2) { restore(before); console.log(`${label}: every request failed (internet? site blocking?). Files restored, nothing to commit from this step.`); return 'failed'; }
  if (r.status !== 0) { restore(before); console.log(`${label}: stopped with an error. Files restored.`); return 'error'; }
  return 'ok';
};

if (!process.env.EXPLORE_CONTACT) console.log('Tip: set EXPLORE_CONTACT=your-email so the sites you visit can reach you. Example: EXPLORE_CONTACT=me@example.com npm run explore:update');
const feed = run('News (PIB)', 'fetch-feeds.mjs');
if (feed === 'failed') { console.log('\nIf the sites block scripts (HTTP 403): save the feeds from Safari and run  npm run explore:import  (see RUNBOOK.md).'); }
const links = run('Official links check', 'check-links.mjs');
const v = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'explore', 'validate.mjs')], { stdio: 'inherit' });
if (v.status !== 0) { console.log('\nData is INVALID: not committing. Read the INVALID lines above.'); process.exit(1); }
console.log(`\nSummary: news ${feed}, links ${links}, validation ok.`);
const git = (args) => spawnSync('git', args, { cwd: ROOT, stdio: 'inherit' });
if (!push) { console.log('\nNext: git add data/explore && git commit -m "Update Explore data" && git push   (or run again with -- --push)'); process.exit(0); }
git(['add', 'data/explore']);
const quiet = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT });
if (quiet.status === 0) { console.log('No changes to commit.'); process.exit(0); }
git(['commit', '-m', `chore(explore): update data ${new Date().toISOString().slice(0, 10)}`]);
process.exit(git(['push']).status || 0);
