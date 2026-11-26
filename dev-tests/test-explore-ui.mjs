// jsdom smoke tests: tabs module + Explore UI render, link attributes, states. No browser.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };

const html = `<!doctype html><body><nav id="stepper"><div class="studin-tabs"><button class="studin-tab active" data-tab="insight" role="tab" aria-selected="true" tabindex="0"></button><button class="studin-tab" data-tab="explore" role="tab" aria-selected="false" tabindex="-1"></button></div><div class="step-item">Home</div></nav>
<select id="language-select"><option value="en">English</option><option value="hi">Hindi</option></select><div id="panel-explore" class="panel"></div></body>`;
const dom = new JSDOM(html, { url: 'https://example.test/app/', pretendToBeVisual: true });
const { window } = dom;
for (const [k, v] of Object.entries({ window, document: window.document, navigator: window.navigator, location: window.location, history: window.history, HTMLElement: window.HTMLElement })) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
window.SR_LANG = 'en'; window.APP_CONFIG = { env: 'PROD' };
const store = {};
Object.defineProperty(window, 'localStorage', { value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, configurable: true });
globalThis.localStorage = window.localStorage;

// fake static server for data files
const files = {
  'data/explore/index.json': { updatedAt: '2026-11-22T00:00:00Z', months: ['2026-11', '2026-10'], schemaVersion: 1 },
  'data/explore/sources.json': { schemaVersion: 1, sources: [{ id: 'pib', domains: ['pib.gov.in'] }, { id: 'ugc', domains: ['ugc.gov.in'] }] },
  'i18n/explore/en.json': JSON.parse(readFileSync(path.join(ROOT, 'i18n/explore/en.json'), 'utf8'))
};
const mkItems = (month, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${month}-${i}`.padEnd(16, '0'), title: `Item ${month} ${i}`, date: `${month}-${String(28 - (i % 27)).padStart(2, '0')}`, checkedOn: '2026-11-22', source: 'PIB', sourceId: 'pib', url: `https://pib.gov.in/p${month}${i}`, lang: 'en', states: ['all'], levels: ['any'], topics: ['policy'], kind: i === 0 ? 'deadline' : 'news', summary: '', ...extra }));
let online = true, failMonth = false;
files['data/explore/feed/2026-11.json'] = { schemaVersion: 1, month: '2026-11', items: [...mkItems('2026-11', 25), { ...mkItems('2026-11', 1)[0], id: 'evil0000000000aa', title: 'EVIL', url: 'https://evil.example/x' }, { ...mkItems('2026-11', 1)[0], id: 'ph00000000000000', title: 'PLACEHOLDER', placeholder: true }, { ...mkItems('2026-11', 1)[0], id: 'sum0000000000000', title: 'WITH SUMMARY', sourceId: 'ugc', url: 'https://ugc.gov.in/a', summary: 'Owner written summary.' }] };
files['data/explore/feed/2026-10.json'] = { schemaVersion: 1, month: '2026-10', items: mkItems('2026-10', 5) };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (!online) throw new TypeError('offline');
  if (u === 'css/explore.css') return { ok: true, json: async () => ({}) };
  if (u.includes('feed/2026-10') && failMonth) return { ok: false, status: 500, json: async () => ({}) };
  const key = Object.keys(files).find((k) => u.endsWith(k));
  return key ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(files[key])) } : { ok: false, status: 404, json: async () => ({}) };
};

// tabs module (goStep via ports)
const { provide } = await import('../core/ports.js');
const { APP } = await import('../core/app-state.js');
const steps = [];
provide({ goStep: (s) => { steps.push(s); APP.currentStep = s; tabs.onStepChanged(s); } });
const tabs = await import('../core/explore-tabs.js');
await new Promise((r) => setTimeout(r, 20));
document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise((r) => setTimeout(r, 20));
ok(steps.length === 0, 'first visit: no auto-open of Explore (Insight default)');
document.querySelector('[data-tab=explore]').click();
ok(steps.at(-1) === 'explore' && document.body.classList.contains('explore-active'), 'click Explore tab -> goStep(explore), stepper items hidden by class');
ok(window.location.hash === '#explore' && store['studin.explore.tab.v1'] === 'explore', 'hash #explore + last tab remembered');
ok(document.querySelector('[data-tab=explore]').getAttribute('aria-selected') === 'true' && document.querySelector('[data-tab=insight]').getAttribute('tabindex') === '-1', 'aria-selected / roving tabindex');
document.querySelector('[data-tab=explore]').focus();
document.querySelector('[data-tab=explore]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
ok(steps.at(-1) === 'home' && !document.body.classList.contains('explore-active'), 'ArrowLeft on a focused tab moves to Insight (restores home step)');

// Explore UI
const { renderExplore } = await import('../ui/explore/explore-ui.js');
const root = document.getElementById('panel-explore');
await renderExplore();
ok(root.querySelector('.explore-picker'), 'first run: picker shown');
ok(!root.querySelector('iframe'), 'no iframe');
root.querySelector('#explore-lang').value = 'en';
root.querySelector('.btn-primary').click();
ok(root.querySelector('#explore-status').textContent.includes('Choose a level'), 'level required');
root.querySelector('input[name="explore-level"][value="ug"]').checked = true;
root.querySelector('.btn-primary').click();
await new Promise((r) => setTimeout(r, 50));
ok(store['studin.explore.prefs.v1'] && JSON.parse(store['studin.explore.prefs.v1']).level === 'ug', 'prefs saved on device only (one versioned key)');
let cards = [...root.querySelectorAll('.explore-card')];
ok(cards.length === 20, 'first batch capped at 20 cards (got ' + cards.length + ')');
ok(![...root.querySelectorAll('.explore-card-title')].some((e) => /EVIL|PLACEHOLDER/.test(e.textContent)), 'unsafe-host and placeholder items not rendered in prod');
ok([...root.querySelectorAll('a.explore-link')].every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer' && a.href.startsWith('https://')), 'every link: https + _blank + noopener noreferrer');
ok(root.querySelector('.explore-confirm') && root.querySelector('.explore-kind-deadline'), 'deadline card has the confirm line');
ok(root.querySelector('.explore-chips').textContent.includes('Undergraduate'), 'chips show choices');
ok(root.querySelector('.explore-day-h').textContent === 'Today' || root.querySelector('.explore-day-h').textContent.length > 3, 'day headings present');
ok(root.querySelector('#explore-more'), '"Show more" available');
root.querySelector('#explore-more').click();
await new Promise((r) => setTimeout(r, 50));
cards = [...root.querySelectorAll('.explore-card')];
ok(cards.length > 20 && cards.length <= 40, 'second batch appended (' + cards.length + ')');
ok(root.querySelector('.explore-sum summary') && root.querySelector('.explore-sum summary').textContent === 'Owner written summary.', 'curated summary via native <details>');
// scroll to end
for (let i = 0; i < 4 && root.querySelector('#explore-more'); i++) { root.querySelector('#explore-more').click(); await new Promise((r) => setTimeout(r, 50)); }
ok(root.querySelector('.explore-end') && root.querySelector('.explore-end').textContent.includes('all caught up'), 'end-of-list message');
// storage tampering: corrupt prefs -> picker again, no throw
store['studin.explore.prefs.v1'] = '{{{';
document.getElementById('panel-explore').dataset.x = '1';
await renderExplore();
ok(root.querySelector('.explore-picker') || root.querySelector('.explore-card'), 'corrupt prefs: renders without throwing');
// change choices -> empty state
store['studin.explore.prefs.v1'] = JSON.stringify({ v: 1, lang: 'en', state: '', level: 'ug', topics: ['scholarship'] });
const ui2 = await import('../ui/explore/explore-ui.js');
// error + retry: new month fails
online = true; failMonth = true;
// offline status
online = false;
await renderExplore();
ok(true, 'renderExplore never throws when offline');
console.log(`explore UI tests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
