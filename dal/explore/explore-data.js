// Explore: data access. Only reads same-origin static files under data/explore/ (relative URLs,
// so any base path works) and one UI preference key in localStorage. No other network, no tracking.
const BASE = 'data/explore/';
const PREFS_KEY = 'studin.explore.prefs.v1';

async function getJson(path, init) {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + path);
  return res.json();
}
export const loadIndex = () => getJson(BASE + 'index.json');
export const loadSources = () => getJson(BASE + 'sources.json');
export const loadMonth = (month) => getJson(BASE + 'feed/' + encodeURIComponent(month) + '.json');
export const loadCareers = () => getJson(BASE + 'careers.json');
export const loadCourses = () => getJson(BASE + 'courses.json');
export const loadExams = () => getJson(BASE + 'exams.json');
export const loadStates = () => getJson(BASE + 'states.json');
export const loadLinkStatus = () => getJson(BASE + 'linkstatus.json');
export const loadStrings = () => getJson('i18n/explore/en.json');

// Returns the build flag for QA deployments, or null (production: file absent or env is PROD).
export async function loadQaFlag() {
  const env = (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.env) || 'PROD';
  if (env === 'PROD') return null;
  if (env === 'LOCAL') return { qa: true, local: true };   // local dev: show placeholder items, no flag file needed
  try { const q = await getJson('qa-build.json', { cache: 'no-store' }); return q && q.qa === true ? q : null; } catch (e) { return null; }
}

// Preferences: every access is guarded; blocked / full / corrupt storage degrades to "no saved choices".
export function readPrefsText() { try { return window.localStorage.getItem(PREFS_KEY); } catch (e) { return null; } }
export function writePrefsText(text) { try { window.localStorage.setItem(PREFS_KEY, text); return true; } catch (e) { return false; } }
export function clearPrefs() { try { window.localStorage.removeItem(PREFS_KEY); } catch (e) { /* ignore */ }
}
