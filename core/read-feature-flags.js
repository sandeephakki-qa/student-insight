import { FEATURE_REGISTRY } from './feature-registry.js';

// Reads Feature_X rows from the parsed SETUP sheet.
//
// STEP 5 (05-premium-feature-locking.md): two-state (true/false) →
// three-state ("on"/"off"/"locked"). Missing row now defaults to
// "locked" (was "true"/on) — this is the deliberate, Sandy-authorized
// behavior change this step implements, NOT a bug: Compare/Scholarship/
// SmartSearch/Reports move from "everyone has it" to "Pro-only, unlock
// by contacting Sandy" as of this step forward. A row explicitly present
// still works both directions: "Yes" → "on", anything else present
// (including "No") → "off". See core/feature-registry.js's isFeatureOn()
// and its callers for how "off" and "locked" now differ (RESOLVED
// 2026-08-28 — off hides the nav row/launcher entirely, locked keeps it
// visible with a Pro-upsell modal on click).
//
// setupSheet: APP.rawData["SETUP"] as produced by parseWorkbookSheets()
// in core/template-upload.js — an array of rows, each row an array/object
// whose first two positional values are [label, value] (col A / col B
// of the SETUP sheet). This is NOT an array of {label,value} objects —
// confirmed against the real parse output (see buildSetupKv() in
// template-upload.js, which this mirrors) before writing this function.

export function readFeatureFlags(setupSheet) {
  const kv = {};
  (setupSheet || []).forEach(row => {
    const rawK = Object.values(row)[0], rawV = Object.values(row)[1];
    const k = String(rawK === undefined || rawK === null ? "" : rawK).trim();
    const v = String(rawV === undefined || rawV === null ? "" : rawV).trim();
    if (k && v) kv[k] = v;
  });

  const flags = {};
  let anyMissing = false;
  for (const key in FEATURE_REGISTRY) {
    const { setupKey, defaultState } = FEATURE_REGISTRY[key];
    if (Object.prototype.hasOwnProperty.call(kv, setupKey)) {
      flags[key] = kv[setupKey] === "Yes" ? "on" : "off";
    } else {
      flags[key] = defaultState; // "locked" per step 5 — see file header
      anyMissing = true;
    }
  }
  flags._anyRowMissing = anyMissing; // drives the one-time informational toast
  return flags;
}
