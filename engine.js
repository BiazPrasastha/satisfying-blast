/* RRE Blast engine: shapes, board rules, bomb, search and the kind piece dealer. No DOM in here. */
const N = 8;
// [family, colour index, weight, picture, rotates]
const DEFS = [
  ['dot',   5, 0.8, ['#'], false],
  ['line2', 3, 4,   ['##'], true],
  ['line3', 3, 5,   ['###'], true],
  ['line4', 3, 3,   ['####'], true],
  ['line5', 3, 1.4, ['#####'], true],
  ['sq2',   1, 5,   ['##', '##'], false],
  ['sq3',   0, 1.6, ['###', '###', '###'], false],
  ['rect',  4, 3,   ['###', '###'], true],
  ['corner',2, 4,   ['#.', '##'], true],
  ['L4',    0, 3,   ['#.', '#.', '##'], true],
  ['J4',    1, 3,   ['.#', '.#', '##'], true],
  ['T4',    4, 3,   ['###', '.#.'], true],
  ['S4',    2, 2.5, ['.##', '##.'], true],
  ['Z4',    5, 2.5, ['##.', '.##'], true],
  ['bigL',  1, 1.4, ['#..', '#..', '###'], true],
];
function normalize(cells) {
  const mr = Math.min(...cells.map(c => c[0])), mc = Math.min(...cells.map(c => c[1]));
  return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const SHAPES = [];
for (const [fam, color, weight, rows, rotates] of DEFS) {
  let cur = [];
  rows.forEach((s, r) => [...s].forEach((ch, c) => { if (ch === '#') cur.push([r, c]); }));
  cur = normalize(cur);
  const seen = new Set(), variants = [];
  for (let k = 0; k < (rotates ? 4 : 1); k++) {
    const key = cur.map(x => x.join(',')).join(';');
    if (!seen.has(key)) { seen.add(key); variants.push(cur); }
    cur = normalize(cur.map(([r, c]) => [c, -r]));
  }
  variants.forEach((cells, i) => {
    const h = Math.max(...cells.map(c => c[0])) + 1, w = Math.max(...cells.map(c => c[1])) + 1;
    SHAPES.push({ id: fam + i, fam, color, weight: weight / variants.length, cells, offs: cells.map(([r, c]) => r * N + c), n: cells.length, h, w });
  });
}
const SHAPE_BY_ID = Object.fromEntries(SHAPES.map(s => [s.id, s]));

function fitsAt(b, p, r, c) {
  if (r < 0 || c < 0 || r + p.h > N || c + p.w > N) return false;
  const base = r * N + c;
  for (let k = 0; k < p.offs.length; k++) if (b[base + p.offs[k]]) return false;
  return true;
}
function placementsOf(b, p) {
  const out = [];
  for (let r = 0; r + p.h <= N; r++) for (let c = 0; c + p.w <= N; c++) if (fitsAt(b, p, r, c)) out.push([r, c]);
  return out;
}
function place(b, p, r, c) {
  const nb = b.slice(), base = r * N + c;
  for (let k = 0; k < p.offs.length; k++) nb[base + p.offs[k]] = p.color + 1;
  const rows = [], cols = [];
  for (let i = r; i < r + p.h; i++) { let f = true; for (let j = 0; j < N; j++) if (!nb[i * N + j]) { f = false; break; } if (f) rows.push(i); }
  for (let j = c; j < c + p.w; j++) { let f = true; for (let i = 0; i < N; i++) if (!nb[i * N + j]) { f = false; break; } if (f) cols.push(j); }
  const cleared = [];
  if (rows.length || cols.length) {
    const mark = new Uint8Array(64);
    for (const i of rows) for (let j = 0; j < N; j++) mark[i * N + j] = 1;
    for (const j of cols) for (let i = 0; i < N; i++) mark[i * N + j] = 1;
    for (let k = 0; k < 64; k++) if (mark[k]) { cleared.push(k); nb[k] = 0; }
  }
  return { board: nb, rows, cols, lines: rows.length + cols.length, cleared };
}
function anyFits(b, pieces) {
  for (const p of pieces) if (p && placementsOf(b, p).length) return true;
  return false;
}
// The bomb breaks its own cell, the 8 cells around it, and the whole row and column it sits on.
function bombZone(r, c) {
  const set = new Set();
  for (let j = 0; j < N; j++) set.add(r * N + j);
  for (let i = 0; i < N; i++) set.add(i * N + c);
  for (let i = Math.max(0, r - 1); i <= Math.min(N - 1, r + 1); i++)
    for (let j = Math.max(0, c - 1); j <= Math.min(N - 1, c + 1); j++) set.add(i * N + j);
  return [...set];
}
function applyBomb(b, r, c) {
  const nb = b.slice(), zone = bombZone(r, c), cleared = [];
  for (const i of zone) if (nb[i]) { nb[i] = 0; cleared.push(i); }
  return { board: nb, zone, cleared };
}
// Higher is a healthier board: few lonely holes, few ragged edges, some room.
function boardScore(b) {
  let empt = 0, iso = 0, tr = 0;
  for (let i = 0; i < 64; i++) {
    const r = i >> 3, c = i & 7, v = b[i] ? 1 : 0;
    if (!v) {
      empt++;
      let free = 0;
      if (r > 0 && !b[i - 8]) free++;
      if (r < 7 && !b[i + 8]) free++;
      if (c > 0 && !b[i - 1]) free++;
      if (c < 7 && !b[i + 1]) free++;
      if (free === 0) iso++;
    }
    if (c < 7 && v !== (b[i + 1] ? 1 : 0)) tr++;
    if (r < 7 && v !== (b[i + 8] ? 1 : 0)) tr++;
  }
  return empt * 0.25 - iso * 6 - tr * 0.7;
}
const LINEW = 10;
const PERMS = {};
function permutations(n) {
  if (PERMS[n]) return PERMS[n];
  const out = [];
  (function rec(cur, rest) { if (!rest.length) { out.push(cur); return; } rest.forEach((x, i) => rec([...cur, x], rest.filter((_, j) => j !== i))); })([], [...Array(n).keys()]);
  return (PERMS[n] = out);
}
// Beam search over every order of the pieces. Reports how many can be placed in a row,
// how good the board ends up, and the best first move (piece index, row, col).
function search(b, ps, beam = 6) {
  const best = { placed: 0, score: -1e9, clears: 0, first: null };
  for (const perm of permutations(ps.length)) {
    let states = [{ b, clears: 0, bonus: 0, first: null, score: boardScore(b) }], depth = 0;
    for (const pi of perm) {
      const p = ps[pi], next = [];
      for (const s of states) {
        for (const [r, c] of placementsOf(s.b, p)) {
          const res = place(s.b, p, r, c), bonus = s.bonus + res.lines * LINEW;
          next.push({ b: res.board, clears: s.clears + res.lines, bonus, first: s.first || [pi, r, c], score: boardScore(res.board) + bonus });
        }
      }
      if (!next.length) break;
      next.sort((x, y) => y.score - x.score);
      states = next.slice(0, beam);
      depth++;
    }
    if (depth && (depth > best.placed || (depth === best.placed && states[0].score > best.score))) {
      best.placed = depth; best.score = states[0].score; best.clears = states[0].clears; best.first = states[0].first;
    }
  }
  return best;
}
function wpick(list, wf, rng) {
  let t = 0; const ws = list.map(x => { const w = Math.max(0.0001, wf(x)); t += w; return w; });
  let r = rng() * t;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}
// kindness = chance a set is chosen to fit the board; otherwise the set is simply random
// (but never a set where nothing at all can be placed).
function generateSet(b, kindness, rng = Math.random) {
  const info = SHAPES.map(p => {
    let cnt = 0, maxLines = 0;
    for (const [r, c] of placementsOf(b, p)) { cnt++; const l = place(b, p, r, c).lines; if (l > maxLines) maxLines = l; }
    return { p, cnt, maxLines };
  });
  const placeable = info.filter(x => x.cnt > 0);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (!placeable.length) return { pieces: shuffle(wpickN(SHAPES, 3, rng)), kind: false };

  if (rng() < kindness) {
    const helpers = placeable.filter(x => x.maxLines > 0);
    const cands = [];
    for (let t = 0; t < 20; t++) {
      const pick = [];
      if (helpers.length && rng() < 0.9) pick.push(wpick(helpers, x => x.p.weight * (1 + x.maxLines * x.maxLines), rng));
      let guard = 0;
      while (pick.length < 3 && guard++ < 30) {
        const x = wpick(placeable, y => y.p.weight, rng);
        if (pick.some(y => y.p.id === x.p.id) && rng() < 0.85) continue;
        pick.push(x);
      }
      while (pick.length < 3) pick.push(placeable[Math.floor(rng() * placeable.length)]);
      const ps = pick.map(x => x.p), ev = search(b, ps, 4);
      const robust = pick.reduce((s, x) => s + Math.log2(1 + x.cnt), 0) * 1.2;
      const variety = new Set(ps.map(p => p.fam)).size * 3;
      cands.push({ ps, ev, total: ev.placed * 1000 + ev.score + ev.clears * 10 + robust + variety });
    }
    cands.sort((a, c) => c.total - a.total);
    const top = cands.slice(0, 4), w = [0.4, 0.3, 0.2, 0.1];
    let r = rng(), ch = top[0];
    for (let i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) { ch = top[i]; break; } }
    return { pieces: shuffle([...ch.ps]), kind: true, solvable: ch.ev.placed === 3 };
  }
  for (let t = 0; t < 14; t++) {
    const ps = wpickN(SHAPES, 3, rng);
    if (anyFits(b, ps)) return { pieces: ps, kind: false };
  }
  return { pieces: shuffle(wpickN(placeable.map(x => x.p), 3, rng)), kind: false };
}
function wpickN(list, n, rng) {
  const out = []; let guard = 0;
  while (out.length < n) {
    const x = wpick(list, s => s.weight, rng);
    if (out.some(y => y.id === x.id) && guard++ < 20) continue;
    out.push(x);
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { N, SHAPES, SHAPE_BY_ID, fitsAt, placementsOf, place, anyFits, bombZone, applyBomb, boardScore, search, generateSet };
}
