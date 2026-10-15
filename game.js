/* Satisfy Blast: the page logic. Uses engine.js (rules, dealer) and highscore.js (best score). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const app = $('#app'), boardEl = $('#board'), trayEl = $('#tray'), bw = $('#bw'), layer = $('#layer');
  const scoreEl = $('#score'), bestEl = $('#best'), comboEl = $('#combo'), toastEl = $('#toast');
  const overEl = $('#over'), fx = $('#fx'), fctx = fx.getContext('2d'), bombBtn = $('#bomb');
  const gear = $('#gear'), menu = $('#menu'), undoBtn = $('#undo');
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const GAME_KEY = 'satisfy-blast.game.v1', SETTINGS_KEY = 'satisfy-blast.settings.v1';
  const BOMB = { id: 'bomb', w: 1, h: 1, n: 0 };
  const BOMB_SVG = '<svg class="bsvg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="14" r="7.5" fill="#3A3358" stroke="#8F87B3" stroke-width="1.2"/><path d="M7 12.5a4.5 4.5 0 0 1 3-3" fill="none" stroke="#B9B1D9" stroke-width="1.6" stroke-linecap="round"/><path d="M15.8 8.6l2.4-2.4" stroke="#D8B48A" stroke-width="1.8" stroke-linecap="round"/><path d="M19.5 2v3.2M17.9 3.6h3.2M18.4 2.5l2.2 2.2M20.6 2.5l-2.2 2.2" stroke="#FFB84D" stroke-width="1.4" stroke-linecap="round"/></svg>';
  $('#bombIcon').innerHTML = BOMB_SVG;
  $('#useBombIcon').innerHTML = BOMB_SVG;
  $('#useBombIcon').style.cssText = 'display:inline-block;width:22px;height:22px';

  // phase: 'play', 'stuck' (nothing fits: bomb or give up) or 'final' (gave up)
  const state = { board: new Uint8Array(64), pieces: [null, null, null], score: 0, best: 0, streak: 0, miss: 0, lines: 0, phase: 'play', kind: 0.9, sound: true, guided: false };
  const history = [];
  let busy = false, drag = null, geom = null, shown = 0, tween = 0, hintTimer = 0, sureTimer = 0, guideBomb = false;
  const cells = [];
  for (let i = 0; i < 64; i++) { const d = document.createElement('div'); d.className = 'cell'; boardEl.appendChild(d); cells.push(d); }
  const colorOf = k => getComputedStyle(app).getPropertyValue('--b' + k).trim() || '#999';

  /* ---------- sound & feel ---------- */
  let ac = null;
  function ensureAudio() {
    if (!state.sound) return;
    try {
      if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
      if (ac && ac.state === 'suspended') ac.resume();
    } catch (e) { /* audio is optional */ }
  }
  function tone(f, d, type, v, delay, f2) {
    if (!ac || !state.sound) return;
    try {
      const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + d + 0.03);
    } catch (e) { /* ignore */ }
  }
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  const sfx = {
    pick() { tone(520, 0.06, 'sine', 0.045); },
    place() { tone(210, 0.13, 'triangle', 0.17, 0, 110); tone(430, 0.05, 'sine', 0.035); },
    nope() { tone(180, 0.1, 'sine', 0.05, 0, 140); },
    undo() { tone(460, 0.09, 'sine', 0.06, 0, 340); tone(340, 0.12, 'sine', 0.05, 0.07, 250); },
    stuck() { tone(330, 0.25, 'sine', 0.06); tone(247, 0.4, 'sine', 0.06, 0.18); },
    clear(lines, streak) {
      const start = Math.min(Math.max(streak - 1, 0), 3), n = Math.min(lines + 2, 6);
      for (let k = 0; k < n; k++) tone(PENTA[Math.min(start + k, 7)], 0.28, 'sine', 0.085, 0.05 + k * 0.06);
    },
    combo(tier) {
      const n = 4 + tier;
      for (let k = 0; k < n; k++) tone(PENTA[Math.min(k, 7)], 0.3, 'triangle', 0.09, 0.04 + k * 0.055);
      tone(PENTA[7] * 1.5, 0.6, 'sine', 0.06, 0.05 + n * 0.055);
      if (tier >= 3) tone(130, 0.4, 'sine', 0.18, 0, 60);
    },
    perfect() { [0, 2, 3, 5, 7].forEach((s, k) => tone(PENTA[s], 0.5, 'triangle', 0.09, k * 0.09)); },
    boom() {
      if (!ac || !state.sound) return;
      try {
        const t = ac.currentTime, len = Math.floor(ac.sampleRate * 0.5), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s.buffer = buf; f.type = 'lowpass';
        f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.45);
        g.gain.value = 0.35;
        s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t);
      } catch (e) { /* ignore */ }
      tone(120, 0.35, 'sine', 0.25, 0, 40);
    },
    over() { [659.25, 587.33, 523.25, 392].forEach((f, k) => tone(f, 0.45, 'sine', 0.07, k * 0.16)); },
  };
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  /* ---------- drawing ---------- */
  function renderBoard(b) {
    for (let i = 0; i < 64; i++) {
      const d = cells[i], v = b[i];
      d.className = v ? 'cell f' : 'cell';
      d.style.removeProperty('--d');
      if (v) d.style.setProperty('--c', 'var(--b' + (v - 1) + ')'); else d.style.removeProperty('--c');
    }
  }
  function buildPiece(p) {
    const el = document.createElement('div');
    el.className = 'piece';
    el.style.gridTemplateColumns = 'repeat(' + p.w + ', var(--s))';
    const set = new Set(p.cells.map(c => c[0] * p.w + c[1]));
    for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
      const d = document.createElement('i');
      if (set.has(r * p.w + c)) { d.className = 'pc'; d.style.setProperty('--c', 'var(--b' + p.color + ')'); }
      el.appendChild(d);
    }
    return el;
  }
  function buildBomb() {
    const el = document.createElement('div');
    el.className = 'piece';
    el.style.gridTemplateColumns = 'var(--s)';
    const i = document.createElement('i');
    i.innerHTML = BOMB_SVG;
    el.appendChild(i);
    return el;
  }
  function renderTray(animate) {
    trayEl.innerHTML = '';
    state.pieces.forEach((p, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (p ? ' has' : '') + (p && animate ? ' deal' : '');
      slot.dataset.i = i;
      if (p) slot.appendChild(buildPiece(p));
      trayEl.appendChild(slot);
    });
  }
  const fmt = n => n.toLocaleString('en-US');
  function setScore(v, instant) {
    cancelAnimationFrame(tween);
    const from = shown, t0 = performance.now(), dur = (instant || reduce) ? 0 : 450;
    const step = now => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      shown = Math.round(from + (v - from) * (1 - Math.pow(1 - k, 3)));
      scoreEl.textContent = fmt(shown);
      if (k < 1) tween = requestAnimationFrame(step);
    };
    step(t0);
    if (!instant) { scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump'); }
  }
  function updateUndo() { undoBtn.disabled = !(history.length && !busy && !drag && state.phase !== 'final'); }
  function setBusy(v) { busy = v; updateUndo(); }
  function renderMeta() {
    bestEl.textContent = fmt(state.best);
    if (state.streak >= 2) { comboEl.textContent = 'Combo ×' + state.streak; comboEl.classList.add('on'); } else comboEl.classList.remove('on');
    document.querySelectorAll('#kind button').forEach(b => b.setAttribute('aria-checked', String(parseFloat(b.dataset.k) === state.kind)));
    $('#guided').setAttribute('aria-checked', String(state.guided));
    $('#sound').setAttribute('aria-pressed', String(state.sound));
    $('#sound').setAttribute('aria-label', state.sound ? 'Sound on' : 'Sound off');
    $('#waves').style.display = state.sound ? '' : 'none';
    $('#mute').toggleAttribute('hidden', state.sound);
    updateUndo();
  }
  function say(text) { toastEl.textContent = text; toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show'); }
  function cellCenter(i) {
    const a = bw.getBoundingClientRect(), b = cells[i].getBoundingClientRect();
    return [b.left - a.left + b.width / 2, b.top - a.top + b.height / 2];
  }
  function cellCenterV(i) {
    const b = cells[i].getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  }

  /* ---------- particles (full screen) ---------- */
  let parts = [], raf = 0, fw = 0, fh = 0;
  function sizeFx() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    fw = window.innerWidth; fh = window.innerHeight;
    fx.width = Math.round(fw * d); fx.height = Math.round(fh * d);
    if (fctx) fctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function addPart(o) {
    if (!fctx) return;
    parts.push(Object.assign({ life: 1, decay: 0.024, g: 0.2, drag: 0.985, rot: 0, vr: 0, round: false }, o));
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function burst(x, y, color, n) {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4.2;
      addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.6, size: 3 + Math.random() * 5, color });
    }
  }
  function embers(x, y) {
    if (reduce) return;
    const cols = ['#FFB84D', '#FF7A3C', '#FF4D4D', '#FFF1B8'];
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 8;
      addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, size: 3 + Math.random() * 6, color: cols[i % 4], round: true, decay: 0.03, g: 0.12 });
    }
  }
  function confetti(tier) {
    if (reduce) return;
    const n = [30, 55, 85, 115, 150][tier - 1] || 40, x = fw / 2, y = fh * 0.4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9;
      addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, size: 5 + Math.random() * 6, color: colorOf(i % 6), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, g: 0.24, decay: 0.011, drag: 0.98 });
    }
    if (tier >= 3) for (let i = 0; i < 30 + tier * 8; i++) {
      const left = i % 2 === 0;
      addPart({ x: left ? 0 : fw, y: fh * 0.75, vx: (left ? 1 : -1) * (6 + Math.random() * 7), vy: -(8 + Math.random() * 9), size: 5 + Math.random() * 6, color: colorOf(i % 6), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, g: 0.3, decay: 0.009, drag: 0.985 });
    }
  }
  function tick() {
    fctx.clearRect(0, 0, fw, fh);
    parts = parts.filter(p => p.life > 0 && p.y < fh + 40);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= p.drag; p.life -= p.decay; p.rot += p.vr;
      fctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
      fctx.fillStyle = p.color;
      if (p.round) { fctx.beginPath(); fctx.arc(p.x, p.y, p.size / 2, 0, 6.2832); fctx.fill(); }
      else if (p.vr) { fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); fctx.restore(); }
      else fctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    fctx.globalAlpha = 1;
    if (parts.length) raf = requestAnimationFrame(tick); else { raf = 0; fctx.clearRect(0, 0, fw, fh); }
  }

  /* ---------- screen effects ---------- */
  function shake(level) {
    if (reduce) return;
    bw.classList.remove('shake1', 'shake2'); void bw.offsetWidth;
    bw.classList.add(level > 1 ? 'shake2' : 'shake1');
    setTimeout(() => bw.classList.remove('shake1', 'shake2'), 600);
  }
  function shock(x, y, color) {
    if (reduce) return;
    const el = document.createElement('div');
    el.className = 'ring'; el.style.left = x + 'px'; el.style.top = y + 'px'; if (color) el.style.setProperty('--rc', color);
    layer.appendChild(el); setTimeout(() => el.remove(), 800);
  }
  function flash(x, y) {
    if (reduce) return;
    const el = document.createElement('div');
    el.className = 'flash'; el.style.setProperty('--fx', x + 'px'); el.style.setProperty('--fy', y + 'px');
    layer.appendChild(el); setTimeout(() => el.remove(), 520);
  }
  function comboTier(streak, lines, perfect) {
    if (perfect) return { tier: 5, word: 'Board cleared', mult: null };
    if (streak >= 5) return { tier: 4, word: 'Unreal', mult: streak };
    if (streak === 4) return { tier: 3, word: 'Amazing', mult: 4 };
    if (streak === 3) return { tier: 2, word: 'Great', mult: 3 };
    if (streak === 2) return { tier: 1, word: 'Combo', mult: 2 };
    if (lines >= 4) return { tier: 2, word: 'Huge', mult: null };
    if (lines === 3) return { tier: 1, word: 'Triple', mult: null };
    return null;
  }
  function bigPop(c) {
    layer.querySelectorAll('.pop').forEach(n => n.remove());
    const el = document.createElement('div');
    el.className = 'pop t' + c.tier;
    const rays = document.createElement('div'); rays.className = 'rays'; el.appendChild(rays);
    const word = document.createElement('div'); word.className = 'word'; word.textContent = c.word; el.appendChild(word);
    if (c.mult) { const m = document.createElement('div'); m.className = 'mult'; m.textContent = '×' + c.mult; el.appendChild(m); }
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1700);
    confetti(c.tier);
    shock(fw / 2, fh * 0.4, colorOf([3, 1, 0, 5, 1][c.tier - 1]));
    if (c.tier >= 2) shake(c.tier >= 3 ? 2 : 1);
    if (c.tier >= 3) flash(fw / 2, fh * 0.4);
    sfx.combo(c.tier);
    buzz(c.tier >= 3 ? [20, 40, 30, 40, 50] : [20, 40, 30]);
  }

  /* ---------- saving: game and settings are separate; the best score lives in highscore.js ---------- */
  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function serialize() {
    return { board: Array.from(state.board), pieces: state.pieces.map(p => p ? p.id : null), score: state.score, streak: state.streak, miss: state.miss, lines: state.lines, phase: state.phase };
  }
  function save() { try { localStorage.setItem(GAME_KEY, JSON.stringify(serialize())); } catch (e) { /* storage is optional */ } }
  function restore(d) {
    if (!d || !Array.isArray(d.board) || d.board.length !== 64 || !Array.isArray(d.pieces) || d.pieces.length !== 3) return false;
    if (d.pieces.some(id => id !== null && !SHAPE_BY_ID[id])) return false;
    state.board = Uint8Array.from(d.board);
    state.pieces = d.pieces.map(id => id ? SHAPE_BY_ID[id] : null);
    state.score = d.score | 0; state.streak = d.streak | 0; state.miss = d.miss | 0; state.lines = d.lines | 0;
    state.phase = ['play', 'stuck', 'final'].includes(d.phase) ? d.phase : (d.over ? 'stuck' : 'play');
    return true;
  }
  function loadSettings() {
    const s = readJSON(SETTINGS_KEY) || {};
    if ([0.9, 0.6, 0.3].includes(s.kind)) state.kind = s.kind;
    if (typeof s.sound === 'boolean') state.sound = s.sound;
    if (typeof s.guided === 'boolean') state.guided = s.guided;
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ kind: state.kind, sound: state.sound, guided: state.guided })); } catch (e) { /* ignore */ } }
  function recordBest() { HighScore.submit(state.score); state.best = HighScore.get(); }

  /* ---------- undo ---------- */
  function pushHistory() {
    history.push({ board: state.board.slice(), pieces: state.pieces.map(p => p ? p.id : null), score: state.score, streak: state.streak, miss: state.miss, lines: state.lines });
    if (history.length > 40) history.shift();
    updateUndo();
  }
  function undo() {
    if (busy || drag || !history.length || state.phase === 'final') return;
    const s = history.pop();
    state.board = s.board; state.pieces = s.pieces.map(id => id ? SHAPE_BY_ID[id] : null);
    state.score = s.score; state.streak = s.streak; state.miss = s.miss; state.lines = s.lines; state.phase = 'play';
    overEl.hidden = true; bombBtn.classList.remove('needs');
    clearHint();
    renderBoard(state.board); renderTray(false); renderMeta(); setScore(state.score);
    sfx.undo(); say('Undone'); save(); applyGuide();
  }

  /* ---------- guidance: shows which piece goes where ---------- */
  function clearHint() {
    clearTimeout(hintTimer);
    document.querySelectorAll('.slot.hint, .slot.guide').forEach(s => s.classList.remove('hint', 'guide'));
    if (guideBomb) { bombBtn.classList.remove('needs'); guideBomb = false; }
    if (!drag) clearPreview();
  }
  function bestMove() {
    const idxs = state.pieces.map((p, i) => p ? i : -1).filter(i => i >= 0);
    if (!idxs.length) return null;
    const r = search(state.board, idxs.map(i => state.pieces[i]), 6);
    if (!r.first) return null;
    const [pi, rr, cc] = r.first;
    return { slot: idxs[pi], piece: state.pieces[idxs[pi]], r: rr, c: cc };
  }
  function applyGuide() {
    clearHint();
    if (!state.guided || busy || drag || state.phase !== 'play') return;
    const m = bestMove();
    if (!m) { guideBomb = true; bombBtn.classList.add('needs'); return; }
    trayEl.children[m.slot].classList.add('guide');
    showPreview(m.piece, [m.r, m.c], 'hintcell');
  }

  /* ---------- game flow ---------- */
  function deal() { state.pieces = generateSet(state.board, state.kind).pieces; }
  function newGame() {
    state.board = new Uint8Array(64);
    state.score = 0; state.streak = 0; state.miss = 0; state.lines = 0; state.phase = 'play';
    history.length = 0;
    deal();
    overEl.hidden = true;
    clearHint(); bombBtn.classList.remove('needs');
    renderBoard(state.board); renderTray(true); renderMeta(); setScore(0, true);
    save(); applyGuide();
  }
  function showOver(mode) {
    state.phase = mode;
    const final = mode === 'final', isBest = final && state.score > 0 && state.score >= state.best;
    $('#overTitle').textContent = final ? (isBest ? 'New best score' : 'Game over') : 'No room left';
    $('#overScore').textContent = fmt(state.score);
    $('#overNote').textContent = final
      ? state.lines + (state.lines === 1 ? ' line' : ' lines') + ' cleared. Best is ' + fmt(state.best) + '.'
      : 'Drop a bomb to clear space and keep playing.';
    $('#useBomb').hidden = final; $('#giveUp').hidden = final; $('#again').hidden = !final;
    overEl.hidden = false;
    clearHint(); updateUndo();
  }
  function stuck() { showOver('stuck'); sfx.stuck(); save(); }
  function continueWithBomb() {
    state.phase = 'play'; overEl.hidden = true;
    bombBtn.classList.add('needs');
    say('Drag the bomb onto the board');
    save(); updateUndo();
  }
  function giveUp() { showOver('final'); sfx.over(); save(); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LINE_WORDS = [null, ['Nice', 'Clean line', 'Smooth'], ['Double']];

  async function commit(idx, r, c) {
    setBusy(true);
    pushHistory();
    const p = state.pieces[idx];
    state.pieces[idx] = null;
    const res = place(state.board, p, r, c);
    const vis = state.board.slice();
    for (const o of p.offs) vis[r * N + c + o] = p.color + 1;
    renderBoard(vis);
    p.offs.forEach(o => cells[r * N + c + o].classList.add('landed'));
    sfx.place(); buzz(8);

    let gain = p.n;
    if (res.lines) {
      state.streak += 1; state.miss = 0; state.lines += res.lines;
      const base = res.lines * (res.lines + 1) / 2 * 10;
      gain += Math.round(base * (1 + 0.5 * (state.streak - 1)));
    } else {
      state.miss += 1;
      if (state.miss >= 3) state.streak = 0;
    }
    state.board = res.board;
    const perfect = res.lines > 0 && state.board.every(v => !v);
    if (perfect) gain += 150;
    state.score += gain;
    recordBest();
    setScore(state.score);
    renderMeta();

    if (res.lines) {
      const ar = r + (p.h - 1) / 2, ac2 = c + (p.w - 1) / 2;
      let maxD = 0, sx = 0, sy = 0;
      res.cleared.forEach(i => {
        const d = Math.round(Math.abs((i >> 3) - ar) + Math.abs((i & 7) - ac2));
        maxD = Math.max(maxD, d);
        cells[i].style.setProperty('--d', d);
        cells[i].classList.remove('landed');
        cells[i].classList.add('clearing');
        const [x, y] = cellCenter(i); sx += x; sy += y;
        const [vx, vy] = cellCenterV(i);
        burst(vx, vy, colorOf((vis[i] || 1) - 1), res.cleared.length > 24 ? 2 : 4);
      });
      const combo = comboTier(state.streak, res.lines, perfect);
      if (combo) bigPop(combo);
      else {
        const words = LINE_WORDS[Math.min(res.lines, 2)];
        say(words[Math.floor(Math.random() * words.length)]);
        sfx.clear(res.lines, state.streak);
      }
      if (perfect) sfx.perfect();
      const g = document.createElement('div');
      g.className = 'gain'; g.textContent = '+' + gain;
      g.style.left = (sx / res.cleared.length) + 'px'; g.style.top = (sy / res.cleared.length - 30) + 'px';
      bw.appendChild(g); setTimeout(() => g.remove(), 950);
      buzz(res.lines > 1 ? [14, 30, 20] : 16);
      await wait(reduce ? 200 : 400 + maxD * 30 + 40);
    } else {
      await wait(120);
    }

    renderBoard(state.board);
    const dealt = state.pieces.every(x => !x);
    if (dealt) deal();
    renderTray(dealt);
    if (!anyFits(state.board, state.pieces)) stuck();
    save();
    setBusy(false);
    applyGuide();
  }

  async function explode(r, c) {
    setBusy(true); clearHint();
    pushHistory();
    bombBtn.classList.remove('needs');
    const res = applyBomb(state.board, r, c), core = r * N + c;
    const [cx, cy] = cellCenterV(core);
    shock(cx, cy, '#FFB84D'); flash(cx, cy); embers(cx, cy);
    shake(2); sfx.boom(); buzz([30, 40, 60]);
    let maxD = 0;
    res.cleared.forEach(i => {
      const d = Math.round(Math.hypot((i >> 3) - r, (i & 7) - c));
      maxD = Math.max(maxD, d);
      cells[i].style.setProperty('--d', d);
      cells[i].classList.add('clearing');
      const [vx, vy] = cellCenterV(i);
      burst(vx, vy, colorOf((state.board[i] || 1) - 1), 3);
    });
    state.board = res.board;
    say(res.cleared.length ? 'Boom' : 'Nothing to break');
    await wait(reduce ? 200 : 380 + maxD * 30 + 40);
    renderBoard(state.board);
    if (!anyFits(state.board, state.pieces)) stuck();
    save();
    setBusy(false);
    applyGuide();
  }

  /* ---------- dragging ---------- */
  function measure() {
    const a = cells[0].getBoundingClientRect(), b = cells[1].getBoundingClientRect();
    geom = { x0: a.left, y0: a.top, stride: b.left - a.left, size: a.width };
  }
  function snap(p, fr, fc) {
    let best = null, bd = 1e9;
    const r0 = Math.floor(fr), c0 = Math.floor(fc);
    for (let r = r0; r <= r0 + 1; r++) for (let c = c0; c <= c0 + 1; c++) {
      if (!fitsAt(state.board, p, r, c)) continue;
      const d = (fr - r) * (fr - r) + (fc - c) * (fc - c);
      if (d < bd) { bd = d; best = [r, c]; }
    }
    return bd <= 1.25 ? best : null;
  }
  function snapBomb(fr, fc) {
    const r = Math.round(fr), c = Math.round(fc);
    return (r >= 0 && r < N && c >= 0 && c < N) ? [r, c] : null;
  }
  let prevMarks = [];
  function clearPreview() {
    prevMarks.forEach(i => {
      const d = cells[i];
      d.classList.remove('ghostcell', 'hintcell', 'blast', 'blast-core');
      if (!d.classList.contains('f')) d.style.removeProperty('--c');
    });
    prevMarks = [];
  }
  // Preview only the dragged piece's own cells, so the effect fits the block and never
  // spills onto the neighbouring blocks in the rows / columns it would clear.
  function showPreview(p, t, cls) {
    clearPreview();
    if (!t) return;
    const [r, c] = t;
    p.offs.forEach(o => { const d = cells[r * N + c + o]; d.style.setProperty('--c', 'var(--b' + p.color + ')'); d.classList.add(cls || 'ghostcell'); prevMarks.push(r * N + c + o); });
  }
  function showBlast(t) {
    clearPreview();
    if (!t) return;
    const [r, c] = t;
    bombZone(r, c).forEach(i => { cells[i].classList.add('blast'); prevMarks.push(i); });
    cells[r * N + c].classList.add('blast-core');
  }
  function moveDrag(e) {
    if (!drag) return;
    const cs = geom.stride, pw = drag.p.w * cs - (cs - geom.size), ph = drag.p.h * cs - (cs - geom.size);
    const lift = drag.touch ? ph / 2 + cs * 1.3 : ph / 2 + cs * 0.45;
    const left = e.clientX - pw / 2, top = e.clientY - ph / 2 - lift;
    drag.el.style.translate = left + 'px ' + top + 'px';
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 8) drag.moved = true;
    const fr = (top - geom.y0) / cs, fc = (left - geom.x0) / cs;
    const t = drag.bomb ? snapBomb(fr, fc) : snap(drag.p, fr, fc);
    const same = (t && drag.target && t[0] === drag.target[0] && t[1] === drag.target[1]) || (!t && !drag.target);
    if (!same) { drag.target = t; drag.bomb ? showBlast(t) : showPreview(drag.p, t); }
  }
  function endDrag(commitIt) {
    if (!drag) return;
    const d = drag; drag = null;
    clearPreview();
    d.el.remove();
    d.slot.classList.remove('lifted');
    updateUndo();
    if (commitIt && d.target) { d.bomb ? explode(d.target[0], d.target[1]) : commit(d.i, d.target[0], d.target[1]); return; }
    if (commitIt) { sfx.nope(); if (d.bomb && !d.moved) say('Drag the bomb onto the board'); }
    applyGuide();
  }
  function startDrag(e, slot, p, i, bomb) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    ensureAudio(); clearHint();
    const el = bomb ? buildBomb() : buildPiece(p);
    el.classList.add('float');
    app.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    slot.classList.add('lifted');
    drag = { i, p, el, slot, bomb, target: null, moved: false, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', pid: e.pointerId };
    try { slot.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    updateUndo(); measure(); moveDrag(e); sfx.pick();
  }
  trayEl.addEventListener('pointerdown', e => {
    const slot = e.target.closest('.slot.has');
    if (!slot || busy || drag || state.phase !== 'play') return;
    startDrag(e, slot, state.pieces[+slot.dataset.i], +slot.dataset.i, false);
  });
  bombBtn.addEventListener('pointerdown', e => {
    if (busy || drag || state.phase === 'final') return;
    if (state.phase === 'stuck') { e.preventDefault(); continueWithBomb(); return; }
    startDrag(e, bombBtn, BOMB, -1, true);
  });
  [trayEl, bombBtn].forEach(t => {
    t.addEventListener('pointermove', e => { if (drag && e.pointerId === drag.pid) moveDrag(e); });
    t.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pid) endDrag(true); });
    t.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pid) endDrag(false); });
  });
  window.addEventListener('blur', () => endDrag(false));

  /* ---------- controls ---------- */
  $('#hint').addEventListener('click', () => {
    if (busy || state.phase !== 'play' || drag) return;
    ensureAudio(); clearHint();
    const m = bestMove();
    if (!m) {
      guideBomb = true; bombBtn.classList.add('needs'); say('Nothing fits. Try the bomb');
      hintTimer = setTimeout(() => { clearHint(); applyGuide(); }, 2800);
      return;
    }
    trayEl.children[m.slot].classList.add('hint');
    showPreview(m.piece, [m.r, m.c], 'hintcell');
    hintTimer = setTimeout(() => { clearHint(); applyGuide(); }, 2600);
  });
  undoBtn.addEventListener('click', () => { ensureAudio(); undo(); });
  $('#restart').addEventListener('click', () => {
    const b = $('#restart');
    if (state.phase === 'final' || state.score === 0) { newGame(); return; }
    if (b.classList.contains('sure')) { clearTimeout(sureTimer); b.classList.remove('sure'); $('#restartT').textContent = 'New game'; b.setAttribute('aria-label', 'Start a new game'); newGame(); return; }
    b.classList.add('sure'); $('#restartT').textContent = 'Tap again';
    b.setAttribute('aria-label', 'Tap again to confirm a new game');
    sureTimer = setTimeout(() => { b.classList.remove('sure'); $('#restartT').textContent = 'New game'; b.setAttribute('aria-label', 'Start a new game'); }, 2600);
  });
  $('#again').addEventListener('click', () => { ensureAudio(); newGame(); });
  $('#useBomb').addEventListener('click', () => { ensureAudio(); continueWithBomb(); });
  $('#giveUp').addEventListener('click', () => { ensureAudio(); giveUp(); });
  $('#sound').addEventListener('click', () => { state.sound = !state.sound; if (state.sound) { ensureAudio(); sfx.pick(); } renderMeta(); saveSettings(); });
  $('#kind').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.kind = parseFloat(b.dataset.k); renderMeta(); saveSettings();
  });
  $('#guided').addEventListener('click', () => {
    state.guided = !state.guided; renderMeta(); saveSettings();
    state.guided ? applyGuide() : clearHint();
  });
  function setMenu(open) { menu.hidden = !open; gear.setAttribute('aria-expanded', String(open)); }
  gear.addEventListener('click', () => setMenu(menu.hidden));
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !gear.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); gear.focus(); } });
  window.addEventListener('resize', sizeFx);

  /* ---------- start ---------- */
  function start() {
    loadSettings();
    state.best = HighScore.get();
    const ok = restore(readJSON(GAME_KEY));
    sizeFx();
    if (!ok) { newGame(); return; }
    if (state.pieces.every(x => !x) && state.phase === 'play') deal();
    renderBoard(state.board); renderTray(true); renderMeta(); setScore(state.score, true);
    if (state.phase === 'final' || state.phase === 'stuck') showOver(state.phase);
    else if (!anyFits(state.board, state.pieces)) stuck();
    else applyGuide();
  }
  if (window.__SATISFY_TEST__) window.__SATISFY_TEST__.api = { state, history, renderBoard, renderTray, cells };
  start();
})();
