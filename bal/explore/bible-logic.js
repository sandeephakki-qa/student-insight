// Career Bible: pure tree helpers (search, path, related courses). No DOM, no network.
import { norm } from './courses-logic.js';

const hay = (n) => norm([n.t, n.s, n.x].join(' '));
export const tokens = (q) => norm(q).split(' ').filter(Boolean);

// Keep nodes that match every search word, plus their ancestors. A matching node keeps its full subtree.
export function filterTree(nodes, q) {
  const toks = tokens(q);
  if (!toks.length) return nodes;
  const walk = (n) => {
    if (toks.every((t) => hay(n).includes(t))) return { ...n, m: true };
    const kids = (n.c || []).map(walk).filter(Boolean);
    return kids.length ? { ...n, c: kids, a: true } : null;   // a = ancestor of a match: shown open
  };
  return nodes.map(walk).filter(Boolean);
}
export function pathTo(nodes, id, trail = []) {
  for (const n of nodes) {
    const here = [...trail, n.t];
    if (n.id === id) return here;
    const sub = n.c ? pathTo(n.c, id, here) : [];
    if (sub.length) return sub;
  }
  return [];
}
// Unique course ids referenced by a node and everything below it.
export function relatedCourses(n, acc = new Set()) {
  (n.cr || []).forEach((id) => acc.add(id));
  (n.c || []).forEach((k) => relatedCourses(k, acc));
  return acc;
}
export function countNodes(nodes) { return nodes.reduce((a, n) => a + 1 + countNodes(n.c || []), 0); }
export function validBible(doc, maxDepth = 8) {
  const ok = (n, d) => n && typeof n.t === 'string' && n.t && d <= maxDepth
    && (n.s === undefined || typeof n.s === 'string') && (n.x === undefined || typeof n.x === 'string')
    && (n.cr === undefined || (Array.isArray(n.cr) && n.cr.every((x) => typeof x === 'string')))
    && (n.ex === undefined || (Array.isArray(n.ex) && n.ex.every((x) => typeof x === 'string')))
    && (n.c === undefined || (Array.isArray(n.c) && n.c.every((k) => ok(k, d + 1))));
  return !!doc && doc.schemaVersion === 1 && Array.isArray(doc.tree) && doc.tree.length > 0 && doc.tree.every((n) => ok(n, 1));
}
