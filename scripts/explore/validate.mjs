#!/usr/bin/env node
// Validates every data/explore file against docs/explore/DATA_CONTRACT.md. No network.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateItem, validateSources, isMonth, monthOf, ENUMS, parseHttps, hostAllowed } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));

export async function validateAll(dataDir = path.join(ROOT, 'data', 'explore')) {
  const errors = [];
  const add = (where, list) => list.forEach((e) => errors.push(`${where}: ${e}`));
  const need = (f) => { if (!existsSync(path.join(dataDir, f))) { errors.push(`${f}: missing`); return false; } return true; };
  const load = async (f) => { try { return await readJson(path.join(dataDir, f)); } catch (e) { errors.push(`${f}: cannot parse (${e.message})`); return null; } };

  let sources = new Map();
  if (need('sources.json')) {
    const doc = await load('sources.json');
    if (doc) { const e = validateSources(doc); add('sources.json', e); if (!e.length) sources = new Map(doc.sources.map((s) => [s.id, s])); }
  }
  const seenIds = new Map(); // id -> where, across all feed files (a url must appear once)
  if (need('curated.json')) {
    const doc = await load('curated.json');
    if (doc) {
      if (doc.schemaVersion !== 1 || !Array.isArray(doc.items)) errors.push('curated.json: need schemaVersion 1 and an items array');
      else {
        const ids = new Set();
        doc.items.forEach((it, i) => {
          const s = sources.get(it.sourceId);
          add(`curated.json[${i}]`, validateItem(it, s, { curated: true }));
          if (s && s.type !== 'curated') errors.push(`curated.json[${i}]: source ${s.id} is not a curated source`);
          if (ids.has(it.id)) errors.push(`curated.json[${i}]: duplicate id`); ids.add(it.id);
        });
      }
    }
  }
  const feedDir = path.join(dataDir, 'feed');
  const monthsOnDisk = existsSync(feedDir) ? (await readdir(feedDir)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  for (const m of monthsOnDisk) {
    const file = `feed/${m}.json`;
    if (!isMonth(m)) { errors.push(`${file}: file name must be YYYY-MM.json`); continue; }
    const doc = await load(file);
    if (!doc) continue;
    if (doc.schemaVersion !== 1 || doc.month !== m || !Array.isArray(doc.items)) { errors.push(`${file}: need schemaVersion 1, month "${m}" and an items array`); continue; }
    doc.items.forEach((it, i) => {
      const s = sources.get(it.sourceId);
      add(`${file}[${i}]`, validateItem(it, s, { curated: s ? s.type === 'curated' : false }));
      if (it.date && monthOf(it.date) !== m) errors.push(`${file}[${i}]: date ${it.date} is not in month ${m}`);
      if (seenIds.has(it.id)) errors.push(`${file}[${i}]: duplicate id (also in ${seenIds.get(it.id)})`); else seenIds.set(it.id, file);
    });
    const sorted = [...doc.items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1));
    if (JSON.stringify(sorted.map((i) => i.id)) !== JSON.stringify(doc.items.map((i) => i.id))) errors.push(`${file}: items not in deterministic order (date desc, id asc)`);
  }
  if (need('index.json')) {
    const idx = await load('index.json');
    if (idx) {
      if (idx.schemaVersion !== 1) errors.push('index.json: schemaVersion must be 1');
      if (Number.isNaN(Date.parse(idx.updatedAt))) errors.push('index.json: bad updatedAt');
      if (!Array.isArray(idx.months) || idx.months.some((m) => !isMonth(m))) errors.push('index.json: months must be YYYY-MM strings');
      else {
        if (JSON.stringify(idx.months) !== JSON.stringify([...idx.months].sort().reverse())) errors.push('index.json: months must be newest first');
        if (JSON.stringify([...idx.months].sort()) !== JSON.stringify([...monthsOnDisk].sort())) errors.push('index.json: months do not match feed/ files');
        if (idx.months.length > 12) errors.push('index.json: more than 12 months');
      }
    }
  }
  if (existsSync(path.join(dataDir, 'careers.json'))) {
    const c = await load('careers.json');
    const ok = (n, d) => n && typeof n.t === 'string' && n.t && d <= 8 && (n.c === undefined || (Array.isArray(n.c) && n.c.every((k) => ok(k, d + 1))));
    if (c && !(c.schemaVersion === 1 && Array.isArray(c.tree) && c.tree.length && c.tree.every((n) => ok(n, 1)))) errors.push('careers.json: need schemaVersion 1 and a tree of {t, s?, x?, c?} nodes, depth <= 8');
  }
  // exams / courses / states (Courses explorer)
  let examIds = new Set(), stateNames = new Set();
  if (existsSync(path.join(dataDir, 'states.json'))) {
    const st = await load('states.json');
    if (st && (st.schemaVersion !== 1 || !Array.isArray(st.states) || !st.states.length)) errors.push('states.json: need schemaVersion 1 and a states array');
    else if (st) stateNames = new Set(st.states);
  }
  if (existsSync(path.join(dataDir, 'exams.json'))) {
    const ex = await load('exams.json');
    if (ex) {
      if (ex.schemaVersion !== 1 || !Array.isArray(ex.exams) || !Array.isArray(ex.hosts)) errors.push('exams.json: need schemaVersion 1, hosts[] and exams[]');
      else ex.exams.forEach((e, i) => {
        const w = `exams.json[${i}]${e && e.id ? ' (' + e.id + ')' : ''}`;
        if (!e.id || !e.name || !e.url) { errors.push(w + ': id, name and url are required'); return; }
        if (examIds.has(e.id)) errors.push(w + ': duplicate id'); examIds.add(e.id);
        const u = parseHttps(e.url);
        if (!u) errors.push(w + ': url must be https without credentials');
        else if (!hostAllowed(u.hostname, ex.hosts)) errors.push(w + ': host ' + u.hostname + ' not in hosts');
        if (!['national', 'state'].includes(e.scope)) errors.push(w + ': scope must be national or state');
        if (e.scope === 'state' && stateNames.size && !stateNames.has(e.state)) errors.push(w + ': unknown state "' + e.state + '"');
        if (String(e.name).length > 120) errors.push(w + ': name too long');
      });
    }
  }
  if (existsSync(path.join(dataDir, 'courses.json'))) {
    const cs = await load('courses.json');
    if (cs) {
      if (cs.schemaVersion !== 1 || !Array.isArray(cs.courses)) errors.push('courses.json: need schemaVersion 1 and courses[]');
      else {
        const seen = new Set();
        cs.courses.forEach((c, i) => {
          const w = `courses.json[${i}]${c && c.id ? ' (' + c.id + ')' : ''}`;
          for (const k of ['id', 'n', 'cat', 'st', 'lv', 'tp', 'dur', 'el', 'ex']) if (c[k] === undefined) errors.push(w + ': missing ' + k);
          if (seen.has(c.id)) errors.push(w + ': duplicate id'); seen.add(c.id);
          if (!['general', 'non-general'].includes(c.tp)) errors.push(w + ': tp must be general or non-general');
          if (!Array.isArray(c.lv) || c.lv.some((l) => !['after10', 'after12', 'graduation'].includes(l))) errors.push(w + ': bad lv');
          const streams = ['pcm', 'pcb', 'commerce', 'arts', 'any'];
          if (c.st !== 'any' && (!Array.isArray(c.st) || c.st.some((x) => !streams.includes(x)))) errors.push(w + ': bad st');
          if (!Array.isArray(c.ex) || c.ex.some((x) => examIds.size && !examIds.has(x))) errors.push(w + ': ex must list known exam ids');
          if (String(c.n).includes('<') || String(c.el).includes('<')) errors.push(w + ': HTML characters not allowed');
        });
      }
    }
  }
  if (existsSync(path.join(dataDir, 'linkstatus.json'))) {
    const ls = await load('linkstatus.json');
    if (ls && (ls.schemaVersion !== 1 || typeof ls.items !== 'object' || ls.items === null)) errors.push('linkstatus.json: need schemaVersion 1 and an items object');
  }
  if (existsSync(path.join(dataDir, 'status.json'))) {
    const st = await load('status.json');
    if (st && (st.schemaVersion !== 1 || typeof st.sources !== 'object' || st.sources === null)) errors.push('status.json: need schemaVersion 1 and a sources object');
  }
  if (existsSync(path.join(dataDir, 'review-queue.json'))) {
    const q = await load('review-queue.json');
    if (q && (q.schemaVersion !== 1 || !Array.isArray(q.items))) errors.push('review-queue.json: need schemaVersion 1 and an items array');
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateAll().then((errors) => {
    if (errors.length) { errors.forEach((e) => console.error('INVALID', e)); console.error(`explore:validate FAIL (${errors.length} problem(s))`); process.exit(1); }
    console.log('explore:validate PASS (sources, curated, feed months, index, status)');
  }).catch((e) => { console.error('FATAL', e.message); process.exit(1); });
}
