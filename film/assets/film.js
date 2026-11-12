/* Sealed Market launch film: one paused GSAP timeline, 70 s at 30 fps.
   Everything is a pure function of timeline time (no clocks, no Math.random),
   so any frame can be seeked and rendered on its own.

   World coordinates: origin at the centre of the frame. The vault lives at (0, 60).
   All figures on screen come from one real run of the app on the bike-rentals sample:
   quality 96%, fair price $3.76 – $4.50, $4.13 per answer, 3 answers = $12.39,
   fee $0.62, $11.77 to maya / kofi / amina as $5.99 / $3.59 / $2.19, answer 261.17. */

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });
  const DUR = 70;

  /* Deterministic pseudo-random numbers. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── Build repeated DOM ─────────────────────────────────────────── */
  const COLS = ['trip_batch_id', 'date', 'city', 'is_weekend', 'temp_c'];
  function paperHTML(rows, seed) {
    const r = rng(seed);
    let h = '<div class="ph">' + COLS.map((c) => '<span>' + c + '</span>').join('') + '</div>';
    for (let i = 0; i < rows; i++) {
      h += '<div class="pr">';
      [112, 44, 36, 86, 52].forEach((w) => {
        h += '<span style="width:' + Math.round(w * (0.72 + r() * 0.34)) + 'px"></span>';
      });
      h += '</div>';
    }
    return h;
  }
  $('#sheet').innerHTML = paperHTML(14, 7);
  $('#inSheet').innerHTML = paperHTML(13, 7);
  gsap.set('#inSheet .pr span', { scaleX: 1.3, transformOrigin: '0 50%' });

  const copiesBox = $('#copies');
  const COPIES = 10;
  for (let i = 0; i < COPIES; i++) {
    const d = document.createElement('div');
    d.className = 'paper copy';
    d.innerHTML = paperHTML(14, 7);
    copiesBox.appendChild(d);
  }
  const copies = $$('.copy');

  const SELL_ROWS = [
    ['BK-1001', '2026-10-01', 'Lagos', '0', '28.4'],
    ['BK-1002', '2026-10-01', 'Nairobi', '0', '21.2'],
    ['BK-1003', '2026-10-02', 'Accra', '0', '29.1'],
    ['BK-1004', '2026-10-02', 'Lagos', '0', '24.0'],
    ['BK-1005', '2026-10-03', 'Lagos', '1', '30.2'],
  ];
  const grid = $('#sellGrid');
  grid.innerHTML =
    COLS.map((c) => '<span class="h">' + c + '</span>').join('') +
    SELL_ROWS.map((row, ri) => row.map((c) => '<span class="c" data-r="' + ri + '" data-v="' + c + '">' + c + '</span>').join('')).join('');
  const cells = $$('#sellGrid .c');

  const BOT = [
    ['Create a spending key with a hard limit', 'Created a spending key'],
    ['Check the vault is genuine', 'Vault verified'],
    ['Run the free quality check', 'Quality 96%, $4.13 per answer'],
    ['Pay into escrow if your rules pass', 'Paid $4.13 into escrow'],
    ['Ask one question', 'Answer received'],
    ['Settle the order', 'Settled: contributors paid'],
  ];
  $('#botRows').innerHTML = BOT.map(
    (b, i) => '<div class="bot-row"><i>' + (i + 1) + '<b></b></i><span class="bot-plan">' + b[0] + '</span><span class="bot-done">' + b[1] + '</span></div>'
  ).join('');
  const botRows = $$('.bot-row');

  const streakBox = $('#streaks');
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    d.className = 'streak';
    streakBox.appendChild(d);
  }
  const streaks = $$('.streak');

  const miniBox = $('#minis');
  const MINI_TARGET = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2]; // 7 : 4 : 3, close to 51 : 31 : 19
  MINI_TARGET.forEach(() => {
    const d = document.createElement('div');
    d.className = 'mini';
    miniBox.appendChild(d);
  });
  const minis = $$('.mini');

  const fg = $('#fg');
  const dustR = rng(42);
  const dust = [];
  for (let i = 0; i < 46; i++) {
    const d = document.createElement('div');
    d.className = 'dust';
    const size = 2 + dustR() * 5;
    d.style.width = d.style.height = size + 'px';
    d.style.filter = 'blur(' + (size > 4.5 ? 2.2 : 0.6) + 'px)';
    fg.appendChild(d);
    dust.push({ el: d, x: dustR() * 2400 - 240, y: dustR() * 1080, a: 0.1 + dustR() * 0.34, p: dustR() * 6.28, s: 0.25 + dustR() * 0.6, depth: 0.5 + dustR() * 1.3 });
  }

  /* Split headline type into masked words. */
  $$('.t').forEach((el) => {
    el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => '<span class="w"><span>' + w + '</span></span>').join(' ');
    gsap.set(el.querySelectorAll('.w > span'), { yPercent: 118, rotation: 5 });
  });

  /* Horizontal and vertical motion-blur filters, driven from the camera's speed. */
  const svgNS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(svgNS, 'svg');
  defs.setAttribute('width', '0');
  defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML =
    '<filter id="mbCam" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur id="mbCamG" stdDeviation="0 0"/></filter>' +
    '<filter id="mbCoin" x="-100%" y="-300%" width="300%" height="700%"><feGaussianBlur id="mbCoinG" stdDeviation="0 0"/></filter>';
  $('#stage').appendChild(defs);
  const mbCamG = $('#mbCamG');
  const mbCoinG = $('#mbCoinG');

  /* Tilted objects (paper on the table, UI slabs) get a wrapper that carries position, scale
     and opacity, while the element itself carries only its tilt. Otherwise the element's own
     perspective would also skew its translation, and anything far from the centre distorts. */
  const tiltWrap = new Map();
  ['#sheet', '#folder', '#slabSell', '#slabQC', '#slabPay', '#slabBot'].map($).concat(copies).forEach((el) => {
    const w = document.createElement('div');
    w.className = 'obj';
    if (el.id) w.id = el.id + 'W';
    el.parentNode.insertBefore(w, el);
    w.appendChild(el);
    el.classList.remove('obj');
    el.style.position = 'relative';
    el.style.left = '0';
    el.style.top = '0';
    tiltWrap.set(el, w);
  });
  $('#sheetW').style.zIndex = 5;
  const POS_PROPS = { x: 1, y: 1, scale: 1, opacity: 1, xPercent: 1, yPercent: 1 };
  const META_PROPS = { duration: 1, ease: 1, stagger: 1, overwrite: 1, immediateRender: 1, yoyo: 1, repeat: 1 };
  function wrapperOf(target) {
    const el = typeof target === 'string' ? (/^#[\w-]+$/.test(target) ? $(target) : null) : target;
    return el && tiltWrap.get(el) ? { el: el, w: tiltWrap.get(el) } : null;
  }
  function splitVars(vars) {
    const pos = {}, rot = {};
    let hasPos = false, hasRot = false;
    Object.keys(vars).forEach((k) => {
      if (META_PROPS[k]) { pos[k] = vars[k]; rot[k] = vars[k]; }
      else if (POS_PROPS[k]) { pos[k] = vars[k]; hasPos = true; }
      else { rot[k] = vars[k]; hasRot = true; }
    });
    return { pos: hasPos ? pos : null, rot: hasRot ? rot : null };
  }
  ['to', 'set'].forEach((m) => {
    const orig = tl[m].bind(tl);
    tl[m] = function (target, vars, at) {
      const t = wrapperOf(target);
      if (!t) return orig(target, vars, at);
      const v = splitVars(vars);
      if (v.pos) orig(t.w, v.pos, at);
      if (v.rot) orig(t.el, v.rot, at);
      return tl;
    };
  });
  const origFromTo = tl.fromTo.bind(tl);
  tl.fromTo = function (target, from, to, at) {
    const t = wrapperOf(target);
    if (!t) return origFromTo(target, from, to, at);
    const a = splitVars(from), b = splitVars(to);
    if (a.pos && b.pos) origFromTo(t.w, a.pos, b.pos, at);
    if (a.rot && b.rot) origFromTo(t.el, a.rot, b.rot, at);
    return tl;
  };
  function setObj(target, vars) {
    const t = wrapperOf(target);
    if (!t) return gsap.set(target, vars);
    const v = splitVars(vars);
    if (v.pos) gsap.set(t.w, v.pos);
    if (v.rot) gsap.set(t.el, v.rot);
  }

  /* ── Initial state ──────────────────────────────────────────────── */
  const place = (sel, x, y, extra) => setObj(sel, Object.assign({ xPercent: -50, yPercent: -50, x: x, y: y }, extra || {}));
  const TABLE = { transformPerspective: 1500, rotationX: 50 };
  const VAULT = { x: 0, y: 60 };
  const SLIT = { x: 0, y: VAULT.y - 230 + 200 }; // world position of the slit's centre
  const DISH = { x: 0, y: 372 };

  place('#sheet', -150, 130, Object.assign({ rotation: -10 }, TABLE));
  copies.forEach((c) => setObj(c, Object.assign({ xPercent: -50, yPercent: -50, x: 350, y: 96, rotation: -4, opacity: 0 }, TABLE)));

  place('#folder', 3060, 70, Object.assign({ rotation: 5 }, TABLE));
  place('#tag', 2745, -70, { xPercent: -6, rotation: 24 });
  place('#coinA', 1900, 470, { scaleY: 0.62 });

  place('#vaultShadow', VAULT.x + 150, VAULT.y + 250, { opacity: 0 });
  place('#vaultHalo', VAULT.x + 20, VAULT.y - 40, { opacity: 0 });
  place('#vault', VAULT.x, VAULT.y + 60, { opacity: 0, scale: 0.94 });
  gsap.set(['#vmRing', '#vmArcs'], { strokeDasharray: '1.06 1.06', strokeDashoffset: 1.06 });
  gsap.set('#vmDot', { scale: 0, transformOrigin: '50% 50%' });

  place('#dish', DISH.x, DISH.y, { opacity: 0, scale: 0.8 });
  place('#ripple', DISH.x, DISH.y, { opacity: 0 });
  place('#escrowLabel', DISH.x, DISH.y + 96, { opacity: 0 });
  place('#coin', 0, 0, { opacity: 0 });
  place('#coin2', 0, -700, { opacity: 0 });
  minis.forEach((m) => gsap.set(m, { xPercent: -50, yPercent: -50, x: DISH.x, y: DISH.y }));
  streaks.forEach((s) => gsap.set(s, { xPercent: -50, yPercent: -50 }));

  place('#slip1', -1100, SLIT.y, { opacity: 0 });
  place('#slip2', -1100, SLIT.y, { opacity: 0 });
  place('#answer', -420, -70, { opacity: 0 });
  place('#ring', SLIT.x, SLIT.y, { opacity: 0 });
  place('#ring38', SLIT.x, SLIT.y, { opacity: 0 });
  place('#pill38', -420, 80, { opacity: 0 });
  gsap.set(['#ringArc', '#ring38Arc'], { strokeDasharray: '0 1' });

  const SELL = { x: -930, y: 40 };
  place('#slabSell', SELL.x - 700, SELL.y, { opacity: 0, transformPerspective: 2200, rotationY: 44 });
  const QC = { x: -1820, y: 40 };
  place('#slabQC', QC.x, QC.y, { opacity: 0, scale: 0.96, transformPerspective: 2400 });
  gsap.set(['#qcPill', '#qcK', '#qcPrice', '#qcC1', '#qcC2'], { opacity: 0, y: 14 });
  gsap.set('#qcMeasure', { opacity: 0, y: 40 });
  const PAY = { x: 1010, y: 20 };
  place('#slabPay', PAY.x + 500, PAY.y, { opacity: 0, transformPerspective: 2400, rotationY: -34 });
  const BOTP = { x: -430, y: -1500 };
  place('#slabBot', BOTP.x, BOTP.y, { opacity: 0, transformPerspective: 2400, rotationY: 20 });
  const END = { z: 0.34, markY: -530 };
  place('#endMark', 0, END.markY, { scale: 3.1 });
  gsap.set(['#emRing', '#emArc1', '#emArc2'], { strokeDasharray: '1.06 1.06', strokeDashoffset: 1.06 });
  gsap.set('#emDot', { scale: 0, transformOrigin: '50% 50%' });

  gsap.set('#inSheet', { top: 372, height: 600 });
  gsap.set('#fade', { opacity: 1 });

  /* Where the quality ring sits on the QC slab, for the match cut. */
  const qcSlab = $('#slabQC');
  const QC_RING = { x: QC.x - 450 + 34 + 1.5 + 34 + 125, y: QC.y - qcSlab.offsetHeight / 2 + 34 + 1.5 + 34 + 125, s: 250 / 300 };

  /* ── Camera ─────────────────────────────────────────────────────── */
  const cam = { x: 60, y: 0, z: 1.1, kx: 0, ky: 0 };
  const state = { scramble: 0, ringV: 0, inAcc: 43, qcAcc: 43, answer: 0, pay: 0, pay0: 0, pay1: 0, pay2: 0, ring38: 0, coinBlur: 0, light: 1 };
  const bg = $('#bg');
  const mid = $('#mid');
  const grain = $('#grain');
  const pool = $('#pool');
  let camPath = null;
  const hex = '0123456789abcdef';
  const sellBtnT = $('#sellBtnT');
  const sellCaption = $('#sellCaption');
  const cellSeed = cells.map((c, i) => ({ th: rng(900 + i)() * 0.75, len: c.dataset.v.length }));

  function money(v) { return '$' + v.toFixed(2); }

  function render() {
    const t = tl.time();
    const dx = 7 * Math.sin(t * 0.47) + 4 * Math.sin(t * 0.21 + 1.3);
    const dy = 5 * Math.sin(t * 0.36 + 0.7) + 2 * Math.sin(t * 0.83);
    const z = cam.z * (1 + 0.006 * Math.sin(t * 0.29 + 2));
    const cx = cam.x + dx / z + cam.kx;
    const cy = cam.y + dy / z + cam.ky;
    mid.style.transform = 'translate(' + -cx * z + 'px,' + -cy * z + 'px) scale(' + z + ')';
    const zb = 1 + (z - 1) * 0.35;
    bg.style.transform = 'translate(' + -cx * 0.22 + 'px,' + -cy * 0.22 + 'px) scale(' + zb + ')';
    pool.style.opacity = state.light * (0.93 + 0.07 * Math.sin(t * 1.1));

    // Camera motion blur from the distance moved over one frame, read from the precomputed path
    // so a frame looks the same whichever order frames are rendered in.
    let bx = 0, by = 0;
    const fi = Math.round(t * 30);
    if (camPath && fi > 0 && fi < camPath.length) {
      const a = camPath[fi - 1], b = camPath[fi];
      bx = Math.min(46, Math.abs(b[0] - a[0]) * 0.34);
      by = Math.min(46, Math.abs(b[1] - a[1]) * 0.34);
    }
    if (bx < 1.2) bx = 0;
    if (by < 1.2) by = 0;
    mbCamG.setAttribute('stdDeviation', bx.toFixed(1) + ' ' + by.toFixed(1));
    mid.style.filter = bx || by ? 'url(#mbCam)' : 'none';
    mbCoinG.setAttribute('stdDeviation', '0 ' + state.coinBlur.toFixed(1));

    // Dust floating through the key light.
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      let x = d.x + Math.sin(t * 0.21 * d.s + d.p) * 40 + t * 6 * d.s - cx * 0.16 * d.depth;
      x = ((x % 2400) + 2400) % 2400 - 240;
      const y = d.y + Math.cos(t * 0.17 * d.s + d.p * 1.7) * 30 - t * 3.2 * d.s - cy * 0.16 * d.depth;
      const yy = ((y % 1180) + 1180) % 1180 - 50;
      d.el.style.transform = 'translate(' + x + 'px,' + yy + 'px)';
      d.el.style.opacity = d.a * (0.55 + 0.45 * Math.sin(t * 0.9 * d.s + d.p * 3)) * state.light;
    }

    // Film grain: a new offset every frame.
    const f = Math.round(t * 30);
    grain.style.transform = 'translate(' + ((f * 73) % 190) + 'px,' + ((f * 131) % 190) + 'px)';

    // Seller table: plain text turns to ciphertext, cell by cell.
    const p = state.scramble;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const s = cellSeed[i];
      let out = c.dataset.v;
      if (p > s.th) {
        const k = Math.min(1, (p - s.th) / 0.25);
        const n = Math.round(s.len * k);
        let enc = '';
        const r = rng(i * 131 + Math.floor(p * 14) * 7 + 3);
        for (let j = 0; j < s.len; j++) enc += j < n ? hex[Math.floor(r() * 16)] : out[j];
        out = enc;
      }
      if (c.textContent !== out) c.textContent = out;
    }

    // Seller button and caption follow the encryption.
    const btn = t < 17.8 ? 'Encrypt file in browser' : t < 19.05 ? 'Encrypting…' : 'Encrypted';
    if (sellBtnT.textContent !== btn) sellBtnT.textContent = btn;
    const cap = t < 19.05 ? 'Preview on your device only. Nothing is uploaded yet' : 'Encrypted. Only the vault can read these rows now';
    if (sellCaption.textContent !== cap) sellCaption.textContent = cap;

    // Counters.
    $('#ringNum').textContent = Math.round(state.ringV) + '%';
    $('#inAcc').textContent = Math.round(state.inAcc) + '%';
    $('#qcAcc').textContent = Math.round(state.qcAcc) + '%';
    $('#answerV').textContent = state.answer.toFixed(2);
    $('#payV').textContent = money(state.pay);
    $('#payA0').textContent = '+' + money(state.pay0);
    $('#payA1').textContent = '+' + money(state.pay1);
    $('#payA2').textContent = '+' + money(state.pay2);
  }
  tl.eventCallback('onUpdate', render);

  /* ── Helpers ────────────────────────────────────────────────────── */
  function say(id, at, out, opts) {
    const o = opts || {};
    const words = $$(id + ' .w > span');
    tl.to(words, { yPercent: 0, rotation: 0, duration: 0.8, ease: 'back.out(1.35)', stagger: o.stagger || 0.085 }, at);
    tl.fromTo(id, { x: 0 }, { x: o.drift == null ? -16 : o.drift, duration: (out == null ? DUR - 0.5 : out) - at + 0.5, ease: 'none' }, at);
    if (out != null) tl.to(words, { yPercent: -122, rotation: -3, duration: 0.42, ease: 'power3.in', stagger: 0.035 }, out);
  }
  function shake(at, amp) {
    tl.to(cam, { kx: amp, ky: -amp * 0.6, duration: 0.04, ease: 'none' }, at)
      .to(cam, { kx: -amp * 0.7, ky: amp * 0.5, duration: 0.05, ease: 'none' }, at + 0.04)
      .to(cam, { kx: amp * 0.35, ky: -amp * 0.2, duration: 0.06, ease: 'none' }, at + 0.09)
      .to(cam, { kx: 0, ky: 0, duration: 0.14, ease: 'power2.out' }, at + 0.15);
  }
  function slitPulse(at, hold) {
    tl.to('#slit i', { opacity: 1, duration: 0.08, ease: 'power2.out' }, at).to('#slit i', { opacity: 0.25, duration: hold || 0.5, ease: 'power2.inOut' }, at + 0.08);
  }
  function camTo(vars, at, dur, ease) {
    tl.to(cam, Object.assign({ duration: dur, ease: ease || 'power3.inOut' }, vars), at);
  }

  /* ════════ SHOT 1 · 0.0 – 3.0 · Show it. Lose it. ════════ */
  tl.to('#fade', { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0);
  camTo({ z: 1, x: 40 }, 0, 2.7, 'power2.out');
  say('#t1a', 0.25, 2.5);
  // Anticipation, slide, overshoot, settle.
  tl.to('#sheet', { x: -190, rotation: -12, duration: 0.2, ease: 'power2.out' }, 0.25)
    .to('#sheet', { x: 372, rotation: -1.5, duration: 0.62, ease: 'power4.out' }, 0.45)
    .to('#sheet', { x: 350, rotation: -4, duration: 0.5, ease: 'back.out(2.4)' }, 1.07);
  // The copies fan out from under it and keep spreading.
  const fan = [[-330, -150, -22], [-170, 200, 14], [60, -210, -9], [250, 190, 19], [430, -130, -15], [520, 110, 9], [-460, 60, 27], [690, -40, -24], [120, 300, -6], [760, 210, 16]];
  copies.forEach((c, i) => {
    const f = fan[i];
    const at = 1.2 + i * 0.055;
    tl.set(c, { opacity: 1 }, at)
      .to(c, { x: 350 + f[0] * 0.86, y: 96 + f[1] * 0.86, rotation: f[2] * 0.9, duration: 0.6, ease: 'back.out(1.5)' }, at)
      .to(c, { x: 350 + f[0] * 1.12, y: 96 + f[1] * 1.12, rotation: f[2] * 1.15, duration: 9.5 - at, ease: 'none' }, at + 0.6);
  });
  say('#t1b', 1.5, 2.55);

  /* ── Transition 1 · whip pan ── */
  camTo({ x: 2600 }, 2.7, 0.65, 'power3.inOut');

  /* ════════ SHOT 2 · 3.3 – 9.0 · Or buy it blind. ════════ */
  tl.to('#tag', { rotation: -9, duration: 0.3, ease: 'power2.out' }, 3.1).to('#tag', { rotation: 5, duration: 2.4, ease: 'elastic.out(1.5, 0.2)' }, 3.4);
  tl.fromTo('#folder', { rotation: 9 }, { rotation: 5, duration: 1.2, ease: 'elastic.out(1, 0.4)' }, 3.2);
  camTo({ x: 2660, z: 1.05 }, 3.35, 5.3, 'none');
  say('#t2a', 3.6, 6.0);
  // The coin comes in, wants to pay, and cannot commit.
  tl.to('#coinA', { x: 2580, y: 400, duration: 0.9, ease: 'power3.out' }, 3.7)
    .to('#coinA', { x: 2700, y: 330, duration: 0.5, ease: 'power2.inOut' }, 4.7)
    .to('#coinA', { x: 2610, y: 392, duration: 0.42, ease: 'back.out(2)' }, 5.2)
    .to('#coinA', { x: 2730, y: 318, duration: 0.5, ease: 'power2.inOut' }, 5.75)
    .to('#coinA', { x: 2640, y: 384, duration: 0.5, ease: 'back.out(2)' }, 6.25);
  // The folder opens a crack: nothing readable. Then it snaps shut.
  tl.to('#folder', { rotationX: 43, y: 56, duration: 0.7, ease: 'power2.inOut' }, 6.3)
    .to('.folder-peek', { opacity: 0.85, duration: 0.5 }, 6.4)
    .to('.folder-peek', { opacity: 0, duration: 0.12, ease: 'power2.in' }, 7.38)
    .to('#folder', { rotationX: 50, y: 70, duration: 0.14, ease: 'power4.in' }, 7.36);
  shake(7.5, 9);
  tl.to('#tag', { rotation: 16, duration: 0.12, ease: 'power2.out' }, 7.5).to('#tag', { rotation: 5, duration: 1.8, ease: 'elastic.out(1.4, 0.22)' }, 7.62);
  tl.to('#coinA', { x: 2480, y: 440, rotation: -40, duration: 0.5, ease: 'power3.out' }, 7.5);
  say('#t2b', 6.35, 8.5);

  /* ── Transition 2 · pan back while every copy collapses into one sheet ── */
  camTo({ x: 0, z: 1 }, 8.7, 0.9, 'power3.inOut');
  copies.forEach((c, i) => {
    tl.to(c, { x: 0, y: 124, rotation: 0, duration: 0.5, ease: 'power3.in', overwrite: 'auto' }, 9.1 + i * 0.03).set(c, { opacity: 0 }, 9.62 + i * 0.03);
  });
  tl.to('#sheet', { x: 0, y: 124, rotation: 0, duration: 0.7, ease: 'power3.inOut' }, 8.95);
  tl.to('#sheet', { scale: 1.07, duration: 0.1, ease: 'power2.out' }, 9.82).to('#sheet', { scale: 1, duration: 0.6, ease: 'elastic.out(1.2, 0.35)' }, 9.92);
  shake(9.84, 5);
  tl.set(['#folder', '#tag', '#coinA'], { opacity: 0 }, 9.7);

  /* ════════ SHOT 3 · 9.6 – 16.2 · What if nobody had to look? · the product ════════ */
  say('#t3a', 9.75, 11.75, { stagger: 0.07 });
  camTo({ z: 1.06 }, 9.9, 2.2, 'none');
  tl.to(state, { light: 0.72, duration: 2, ease: 'power2.inOut' }, 10);
  // The sheet stands up and lifts; the vault rises underneath it.
  tl.to('#sheet', { rotationX: 0, y: -440, scale: 0.56, duration: 0.9, ease: 'power3.inOut' }, 11.95);
  tl.to('#vault', { opacity: 1, y: VAULT.y, scale: 1, duration: 0.85, ease: 'power3.out' }, 12.05).to(['#vaultShadow', '#vaultHalo'], { opacity: 1, duration: 0.8 }, 12.1);
  camTo({ z: 1, y: -40 }, 11.9, 1.0, 'power2.inOut');
  tl.to('#vLid', { y: -34, duration: 0.3, ease: 'back.out(2.2)' }, 12.6);
  // Drop into the slot: the paper slides down behind the lid line.
  const drop = { p: 0 };
  tl.to('#sheet', { y: -366, duration: 0.3, ease: 'power2.in' }, 12.82);
  tl.to(drop, {
    p: 1, duration: 0.6, ease: 'power2.in',
    onUpdate: function () {
      gsap.set('#sheetW', { y: -366 + drop.p * 280 });
      gsap.set('#sheet', { clipPath: 'inset(0% 0% ' + (drop.p * 100).toFixed(2) + '% 0%)' });
    },
  }, 13.12);
  tl.set('#sheet', { opacity: 0 }, 13.74);
  tl.to('#vLid', { y: 0, duration: 0.13, ease: 'power4.in' }, 13.72);
  tl.to('#vault', { scaleY: 0.975, transformOrigin: '50% 100%', duration: 0.07, ease: 'power2.out' }, 13.85).to('#vault', { scaleY: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }, 13.92);
  shake(13.85, 11);
  // The seal: ring, arcs, dot. Music lifts on the dot.
  tl.to('#vmRing', { strokeDashoffset: 0, duration: 0.42, ease: 'power2.inOut' }, 13.98).to('#vmArcs', { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' }, 14.16);
  tl.to('#vmDot', { scale: 1, duration: 0.5, ease: 'back.out(4)' }, 14.4);
  slitPulse(14.4, 1.4);
  tl.to(state, { light: 1.05, duration: 0.25, ease: 'power2.out' }, 14.4).to(state, { light: 1, duration: 1.2 }, 14.65);
  tl.to(cam, { z: 1.045, duration: 0.12, ease: 'power2.out' }, 14.4).to(cam, { z: 1, duration: 0.9, ease: 'power2.out' }, 14.52);
  camTo({ x: 330, y: -10 }, 14.35, 0.9, 'power3.inOut');
  tl.fromTo('#t3b', { opacity: 1, x: 40, clipPath: 'inset(0% 100% 0% 0%)' }, { x: 0, clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: 'power3.out' }, 14.5);
  tl.to('#t3b', { x: -12, duration: 1.2, ease: 'none' }, 15.2);
  say('#t3c', 15.0, 16.35, { stagger: 0.06 });
  tl.to('#t3b', { opacity: 0, x: -50, duration: 0.35, ease: 'power3.in' }, 16.4);

  /* ── Transition 3 · the camera swings left as the seller's screen arrives ── */
  camTo({ x: -470, y: -200, z: 0.92 }, 16.2, 1.0, 'power3.inOut');
  tl.to('#slabSell', { opacity: 1, duration: 0.3 }, 16.35);
  tl.to('#slabSell', { x: SELL.x, rotationY: 13, duration: 0.95, ease: 'power3.out' }, 16.35).to('#slabSell', { rotationY: 17, rotationX: 2, duration: 4.2, ease: 'sine.inOut' }, 17.3);

  /* ════════ SHOT 4 · 16.2 – 21.6 · Locked before it leaves. ════════ */
  say('#t4a', 17.4, 20.6);
  tl.to('#sellBtn', { scale: 0.93, duration: 0.1, ease: 'power2.in', transformOrigin: '0 50%' }, 17.7).to('#sellBtn', { scale: 1, duration: 0.45, ease: 'back.out(3)' }, 17.8);
  tl.to(state, { scramble: 1, duration: 1.15, ease: 'power1.inOut' }, 17.9);
  // Each encrypted row leaves the page as a line of light and enters the vault.
  streaks.forEach((s, i) => {
    const at = 19.1 + i * 0.26;
    const y0 = SELL.y - 40 + i * 50;
    tl.set(s, { x: -640, y: y0, opacity: 1, scaleX: 1, rotation: 0 }, at)
      .to(s, { x: SLIT.x - 150, y: SLIT.y, scaleX: 0.35, rotation: -2, duration: 0.5, ease: 'power3.in' }, at)
      .set(s, { opacity: 0 }, at + 0.5);
    tl.to('#sellGrid .c[data-r="' + i + '"]', { opacity: 0.16, duration: 0.25 }, at);
    slitPulse(at + 0.48, 0.2);
  });
  tl.to('#vault', { scale: 1.012, duration: 0.1 }, 20.63).to('#vault', { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.4)' }, 20.73);

  /* ── Transition 4 · push through the glass ── */
  camTo({ x: 0, y: SLIT.y, z: 9 }, 20.9, 0.7, 'power3.in');
  tl.to('#inside', { opacity: 1, duration: 0.26, ease: 'power1.in' }, 21.34);
  tl.fromTo('#inside', { scale: 1.34 }, { scale: 1, duration: 0.95, ease: 'power3.out' }, 21.34);
  tl.set('#slabSell', { opacity: 0 }, 21.6);

  /* ════════ SHOT 5 · 21.6 – 30.0 · Tested inside. Only the score leaves. ════════ */
  say('#t5a', 22.1, 25.3);
  tl.fromTo('#inSheet', { y: 60, rotation: -3 }, { y: 0, rotation: -1.5, duration: 1.1, ease: 'power3.out' }, 21.4).to('#inSheet', { y: -14, rotation: -0.6, duration: 3.6, ease: 'sine.inOut' }, 22.5);
  tl.set('#inScan', { opacity: 1 }, 22.2)
    .fromTo('#inScan', { y: 0 }, { y: 600, duration: 1.2, ease: 'power1.inOut' }, 22.2)
    .to('#inScan', { y: 0, duration: 1.2, ease: 'power1.inOut' }, 23.4)
    .to('#inScan', { opacity: 0, duration: 0.3 }, 24.6);
  $$('#inSheet .pr').forEach((row, i) => {
    tl.fromTo(row, { backgroundColor: 'rgba(17,17,17,0)' }, { backgroundColor: 'rgba(17,17,17,0.13)', duration: 0.08 }, 22.2 + 1.2 * ((i + 1.5) / 14.5))
      .to(row, { backgroundColor: 'rgba(17,17,17,0)', duration: 0.5 }, 22.3 + 1.2 * ((i + 1.5) / 14.5));
  });
  tl.from('#inBars > *', { opacity: 0, x: 50, duration: 0.6, stagger: 0.14 }, 22.5);
  $$('#inBars u i').forEach((b, i) => tl.to(b, { scaleX: Number(b.dataset.w), duration: 1.0, ease: 'power3.out' }, 23.0 + i * 0.3));
  tl.to(state, { inAcc: 100, duration: 1.5, ease: 'power2.out' }, 23.4);
  tl.to('#inBars', { x: -18, duration: 3.6, ease: 'none' }, 22.5);
  // Pull back out through the glass.
  tl.to('#inside', { scale: 1.3, opacity: 0, duration: 0.5, ease: 'power3.in' }, 25.75);
  tl.set(cam, { x: -200, y: 0, z: 4.2 }, 25.9);
  camTo({ x: -420, y: -60, z: 1 }, 25.95, 0.85, 'power3.out');
  // Only a ring of light comes out of the slit.
  slitPulse(26.4, 3);
  tl.set('#ring', { opacity: 1, scaleX: 0.7, scaleY: 0.02 }, 26.4)
    .to('#ring', { x: -330, y: 120, scaleX: 1, scaleY: 1, duration: 0.8, ease: 'back.out(1.5)' }, 26.4)
    .to('#ring', { y: 104, duration: 2.2, ease: 'sine.inOut' }, 27.2);
  tl.to('#ringArc', { strokeDasharray: '0.96 1', duration: 1.7, ease: 'power2.inOut' }, 26.75);
  tl.to(state, { ringV: 96, duration: 1.7, ease: 'power2.inOut' }, 26.75);
  tl.to('#ring', { scale: 1.07, duration: 0.1 }, 28.45).to('#ring', { scale: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }, 28.55);
  say('#t5b', 26.7, 29.25);

  /* ── Transition 5 · match cut: the ring becomes the ring on the product's quality report ── */
  camTo({ x: -1420, y: 40, z: 1.05 }, 29.4, 0.9, 'power3.inOut');
  tl.to('#ring', { x: QC_RING.x, y: QC_RING.y, scale: QC_RING.s, duration: 0.9, ease: 'power3.inOut' }, 29.4);
  tl.to('#slabQC', { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out' }, 29.95);
  tl.to('#ringArc', { stroke: '#111111', duration: 0.3 }, 30.0).to('#ringTrack', { stroke: 'rgba(17,17,17,0.1)', duration: 0.3 }, 30.0)
    .to('#ringNum', { color: '#111111', duration: 0.3 }, 30.0).to('#ringLbl', { color: '#707070', duration: 0.3 }, 30.0)
    .to('#ring svg', { filter: 'drop-shadow(0 0 0px rgba(255,255,255,0))', duration: 0.3 }, 30.0);
  tl.set('#ring', { opacity: 0 }, 30.42);

  /* ════════ SHOT 6 · 30.3 – 37.2 · Know before you pay. ════════ */
  tl.to(['#qcPill', '#qcK', '#qcPrice'], { opacity: 1, y: 0, duration: 0.55, stagger: 0.14, ease: 'back.out(1.6)' }, 30.5);
  tl.to(['#qcC1', '#qcC2'], { opacity: 1, y: 0, duration: 0.5, stagger: 0.3, ease: 'back.out(1.6)' }, 31.4);
  tl.to('#qcMeasure', { opacity: 1, y: 0, duration: 0.7, ease: 'back.out(1.3)' }, 32.4);
  $$('#qcMeasure u i').forEach((b, i) => tl.to(b, { scaleX: Number(b.dataset.w), duration: 0.9, ease: 'power3.out' }, 32.8 + i * 0.25));
  tl.to(state, { qcAcc: 100, duration: 1.2, ease: 'power2.out' }, 32.9);
  tl.to('#slabQC', { rotationY: -11, rotationX: 3, duration: 2.6, ease: 'sine.inOut' }, 30.5).to('#slabQC', { rotationY: 0, rotationX: 0, duration: 2.6, ease: 'sine.inOut' }, 33.55);
  camTo({ x: -1400, z: 1.08 }, 30.4, 5.6, 'none');
  say('#t6a', 30.9, 35.0);

  /* ── Transition 6 · the score becomes a coin, and the camera follows it into escrow ── */
  tl.set('#ring', { opacity: 1 }, 36.18);
  tl.to('#slabQC', { opacity: 0, scale: 0.97, duration: 0.4, ease: 'power2.in' }, 36.2);
  tl.to('#ringArc', { stroke: '#ffffff', strokeDasharray: '1 1', duration: 0.3 }, 36.2).to('#ringNum', { color: '#ffffff', opacity: 0, duration: 0.25 }, 36.2).to('#ringLbl', { opacity: 0, duration: 0.2 }, 36.2);
  tl.to('#ring', { scale: 0.3, duration: 0.5, ease: 'back.in(1.8)' }, 36.25);
  tl.set('#coin', { x: QC_RING.x, y: QC_RING.y, opacity: 1, scale: 0.9 }, 36.72).set('#ring', { opacity: 0 }, 36.75);
  tl.to('#coin', { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 36.72);
  camTo({ x: -420, y: 40, z: 1 }, 36.5, 1.0, 'power3.inOut');
  tl.to('#dish', { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.6)' }, 36.6);
  tl.to('#coin', { x: DISH.x, duration: 0.98, ease: 'power2.inOut' }, 36.82);
  tl.to('#coin', { y: -330, duration: 0.5, ease: 'power2.out' }, 36.82).to('#coin', { y: DISH.y - 12, duration: 0.48, ease: 'power2.in' }, 37.32);
  tl.to(state, { coinBlur: 14, duration: 0.3, ease: 'power2.in' }, 37.45).to(state, { coinBlur: 0, duration: 0.05 }, 37.8);
  tl.set('#coin', { filter: 'url(#mbCoin)' }, 37.3).set('#coin', { filter: 'none' }, 37.86);

  /* ════════ SHOT 7 · 37.2 – 45.6 · Pay per answer. Under 20 rows: blocked. ════════ */
  // Landing: squash flat into the dish, bounce, ripple, wobble.
  tl.to('#coin', { scaleY: 0.4, scaleX: 1.12, duration: 0.06, ease: 'power2.out' }, 37.8)
    .to('#coin', { y: DISH.y - 46, scaleY: 0.5, scaleX: 1, duration: 0.16, ease: 'power2.out' }, 37.86)
    .to('#coin', { y: DISH.y - 10, scaleY: 0.44, duration: 0.5, ease: 'bounce.out' }, 38.02);
  tl.fromTo('#ripple', { opacity: 0.9, scale: 0.4 }, { opacity: 0, scale: 1.7, duration: 0.9, ease: 'power2.out', immediateRender: false }, 37.8);
  tl.to('#dish', { rotation: 3.5, y: DISH.y + 8, duration: 0.07, ease: 'power2.out' }, 37.8).to('#dish', { rotation: 0, y: DISH.y, duration: 1.1, ease: 'elastic.out(1.4, 0.25)' }, 37.87);
  shake(37.8, 6);
  tl.fromTo('#escrowLabel', { opacity: 0, y: DISH.y + 116 }, { opacity: 1, y: DISH.y + 100, duration: 0.5 }, 38.15);
  say('#t7a', 38.1, 40.5);
  camTo({ z: 1.03 }, 38, 7, 'none');
  // A question goes in.
  const slipW = $('#slip1').offsetWidth;
  const slipIn = { p: 0 };
  tl.set('#slip1', { opacity: 1, x: -1150 }, 40.2).to('#slip1', { x: SLIT.x - 124 - slipW / 2, duration: 0.6, ease: 'power3.out' }, 40.2);
  tl.to(slipIn, {
    p: 1, duration: 0.42, ease: 'power2.in',
    onUpdate: function () {
      gsap.set('#slip1', { x: SLIT.x - 124 - slipW / 2 + slipIn.p * slipW, clipPath: 'inset(-40% ' + (slipIn.p * 100).toFixed(2) + '% -80% -10%)' });
    },
  }, 40.72);
  tl.set('#slip1', { opacity: 0 }, 41.14);
  slitPulse(41.1, 1.8);
  shake(41.12, 3);
  // One number comes out.
  tl.fromTo('#answer', { opacity: 0, x: -300, scaleX: 0.5, transformOrigin: '100% 50%', filter: 'blur(14px)' }, { opacity: 1, x: -780, scaleX: 1, filter: 'blur(0px)', duration: 0.65, ease: 'power3.out' }, 41.15);
  tl.to(state, { answer: 261.17, duration: 1.0, ease: 'power3.out' }, 41.2);
  tl.to('#answer', { x: -796, duration: 1.3, ease: 'none' }, 41.8);
  tl.to('#answer', { opacity: 0, x: -840, filter: 'blur(8px)', duration: 0.32, ease: 'power2.in' }, 43.1);
  // A question that is too narrow is refused: the slit shuts.
  const slip2W = $('#slip2').offsetWidth;
  tl.set('#slip2', { opacity: 1, x: -1150 }, 43.15).to('#slip2', { x: SLIT.x - 132 - slip2W / 2, duration: 0.62, ease: 'power3.in' }, 43.15);
  tl.to('#slit', { scaleX: 0.03, duration: 0.07, ease: 'power4.in' }, 43.7).to('#slit i', { opacity: 0, duration: 0.05 }, 43.7);
  shake(43.78, 12);
  tl.to('#vault', { x: 9, duration: 0.05 }, 43.78).to('#vault', { x: 0, duration: 0.5, ease: 'elastic.out(1.6, 0.25)' }, 43.83);
  tl.to('#slip2', { x: -520, rotation: -17, duration: 0.75, ease: 'power2.out' }, 43.78).to('#slip2', { y: 300, duration: 0.75, ease: 'bounce.out' }, 43.78)
    .to('#slip2', { opacity: 0, duration: 0.3 }, 45.2);
  say('#t7b', 43.85, 45.2);
  tl.to('#slit', { scaleX: 1, duration: 0.4, ease: 'back.out(2)' }, 44.9);

  /* ── Transition 7 · the slit's light opens into a white frame ── */
  tl.to('#slit i', { opacity: 1, scaleY: 30, duration: 0.3, ease: 'power3.in' }, 45.28);
  tl.to('#flash', { opacity: 1, duration: 0.24, ease: 'power2.in' }, 45.34).to('#flash', { opacity: 0, duration: 0.5, ease: 'power2.out' }, 45.62);
  tl.set('#slit i', { scaleY: 1, opacity: 0.25 }, 45.6).set('#escrowLabel', { opacity: 0 }, 45.6);
  tl.set(cam, { x: 430, y: 90, z: 0.85 }, 45.6);
  tl.set('#slabPay', { opacity: 1 }, 45.6).to('#slabPay', { x: PAY.x, rotationY: -15, duration: 0.9, ease: 'power3.out' }, 45.62);

  /* ════════ SHOT 8 · 45.9 – 53.4 · Everyone who contributed, paid. Or 100% back. ════════ */
  // The dish tips and the payment splits three ways, by share.
  tl.to('#dish', { rotation: 9, duration: 0.3, ease: 'back.in(2)' }, 46.1).to('#dish', { rotation: 0, duration: 1.6, ease: 'elastic.out(1, 0.3)' }, 47.7);
  tl.to('#coin', { scale: 0.2, opacity: 0, duration: 0.25, ease: 'power2.in' }, 46.3);
  const rowY = [PAY.y + 46, PAY.y + 97, PAY.y + 148];
  const counts = [0, 0, 0];
  const per = [5.99 / 7, 3.59 / 4, 2.19 / 3];
  const got = [0, 0, 0];
  minis.forEach((m, i) => {
    const r = MINI_TARGET[i];
    const k = counts[r]++;
    const at = 46.4 + i * 0.105;
    const tx = PAY.x - 250 + k * 12;
    tl.set(m, { opacity: 1, x: DISH.x, y: DISH.y - 10, scale: 1 }, at)
      .to(m, { x: tx, duration: 0.62, ease: 'power1.in' }, at)
      .to(m, { y: DISH.y - 330 - r * 26, duration: 0.3, ease: 'power2.out' }, at)
      .to(m, { y: rowY[r], duration: 0.32, ease: 'power2.in' }, at + 0.3)
      .to(m, { opacity: 0, scale: 0.2, duration: 0.08 }, at + 0.6);
    got[r] += per[r];
    const key = 'pay' + r;
    const v = {};
    v[key] = Number(got[r].toFixed(2));
    tl.to(state, Object.assign({ duration: 0.3, ease: 'power2.out' }, v), at + 0.6);
    tl.to('#payR' + r + ' u i', { scaleX: [0.51, 0.31, 0.19][r] * (counts[r] / [7, 4, 3][r]), duration: 0.3, ease: 'power2.out' }, at + 0.6);
    tl.fromTo('#payR' + r, { x: 0 }, { x: 7, duration: 0.06, yoyo: true, repeat: 1, ease: 'power1.out' }, at + 0.6);
  });
  tl.to(state, { pay: 11.77, duration: 1.7, ease: 'power1.inOut' }, 46.9);
  tl.to('#payV', { scale: 1.08, transformOrigin: '100% 50%', duration: 0.1 }, 48.62).to('#payV', { scale: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }, 48.72);
  // Move onto the receipt.
  camTo({ x: 1500, y: 20, z: 1 }, 47.75, 1.1, 'power3.inOut');
  tl.to('#slabPay', { rotationY: 11, rotationX: 2, duration: 1.1, ease: 'power3.inOut' }, 47.75).to('#slabPay', { rotationY: 15, duration: 1.4, ease: 'sine.inOut' }, 48.85);
  say('#t8a', 48.0, 50.05, { stagger: 0.075 });
  // The other outcome: quality falls short, and the money goes back whole.
  camTo({ x: -420, y: 40, z: 1 }, 50.15, 0.9, 'power3.inOut');
  tl.to('#slabPay', { opacity: 0, duration: 0.4 }, 50.3);
  tl.set('#coin2', { opacity: 1, x: DISH.x, y: -640, scaleY: 1 }, 50.55).to('#coin2', { y: DISH.y - 12, duration: 0.42, ease: 'power2.in' }, 50.58)
    .to('#coin2', { scaleY: 0.4, scaleX: 1.12, duration: 0.06 }, 51.0).to('#coin2', { y: DISH.y - 40, scaleY: 0.5, scaleX: 1, duration: 0.14, ease: 'power2.out' }, 51.06)
    .to('#coin2', { y: DISH.y - 10, scaleY: 0.44, duration: 0.42, ease: 'bounce.out' }, 51.2);
  tl.fromTo('#ripple', { opacity: 0.9, scale: 0.4 }, { opacity: 0, scale: 1.7, duration: 0.8, ease: 'power2.out', immediateRender: false }, 51.0);
  tl.to('#dish', { rotation: -3, duration: 0.07 }, 51.0).to('#dish', { rotation: 0, duration: 1, ease: 'elastic.out(1.4, 0.25)' }, 51.07);
  shake(51.0, 5);
  slitPulse(51.15, 1.2);
  tl.set('#ring38', { opacity: 1, scaleX: 0.7, scaleY: 0.02 }, 51.15).to('#ring38', { x: -420, y: -70, scaleX: 1, scaleY: 1, duration: 0.6, ease: 'back.out(1.6)' }, 51.15);
  tl.to('#ring38Arc', { strokeDasharray: '0.38 1', duration: 0.7, ease: 'power2.out' }, 51.3);
  tl.fromTo('#pill38', { opacity: 0, y: 96 }, { opacity: 1, y: 80, duration: 0.45, ease: 'back.out(1.8)' }, 51.55);
  // The coin leaves the dish and goes back the way it came.
  tl.to('#coin2', { x: DISH.x + 26, duration: 0.2, ease: 'power2.out' }, 52.0)
    .to('#coin2', { x: -1700, y: DISH.y + 150, rotation: -30, duration: 0.72, ease: 'power3.in' }, 52.2);
  tl.to('#dish', { rotation: -6, duration: 0.15 }, 52.2).to('#dish', { rotation: 0, duration: 1.2, ease: 'elastic.out(1.3, 0.25)' }, 52.35);
  say('#t8b', 51.0, 53.0);
  tl.to(['#ring38', '#pill38'], { opacity: 0, duration: 0.3 }, 53.0);
  tl.set('#coin2', { opacity: 0 }, 53.0);

  /* ── Transition 8 · tilt up, fast ── */
  camTo({ x: 0, y: -1500 }, 53.1, 0.65, 'power3.inOut');
  tl.to('#slabBot', { opacity: 1, duration: 0.2 }, 53.3);
  tl.fromTo('#slabBot', { rotationX: -14 }, { rotationX: 0, rotationY: 12, duration: 1.2, ease: 'elastic.out(1, 0.5)' }, 53.5);

  /* ════════ SHOT 9 · 53.7 – 60.6 · For people. And agents. ════════ */
  botRows.forEach((row, i) => {
    const at = 54.0 + i * 0.9;
    tl.to(row, { backgroundColor: '#ffffff', borderColor: 'rgba(17,17,17,0.15)', color: '#111111', duration: 0.25 }, at);
    tl.set(row.querySelector('.bot-plan'), { display: 'none' }, at).set(row.querySelector('.bot-done'), { display: 'inline' }, at);
    tl.fromTo(row.querySelector('i b'), { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(3)' }, at);
    tl.fromTo(row, { x: 0 }, { x: 12, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.out' }, at);
  });
  tl.to('#slabBot', { rotationY: 17, rotationX: 2, duration: 5.0, ease: 'sine.inOut' }, 54.7);
  camTo({ z: 1.04 }, 53.8, 5.8, 'none');
  say('#t9a', 54.3, 59.2);

  /* ── Transition 9 · dolly out to the vault, alone ── */
  camTo({ x: 0, y: 0, z: END.z }, 59.7, 1.1, 'power3.inOut');
  tl.to('#slabBot', { opacity: 0, duration: 0.45 }, 59.9);
  tl.to(['#dish', '#slip2'], { opacity: 0, duration: 0.3 }, 59.8);

  /* ════════ SHOT 10 · 60.6 – 70 · The vault becomes the mark. ════════ */
  tl.to(state, { light: 0.8, duration: 1.5 }, 60.6);
  tl.to('#vault', { y: END.markY + 110, duration: 1.0, ease: 'power3.inOut' }, 61.0).to(['#vaultShadow', '#vaultHalo'], { opacity: 0, duration: 0.6, ease: 'power2.in' }, 61.0);
  slitPulse(61.9, 0.6);
  tl.to('#vault', { scale: 0.1, y: END.markY, duration: 0.55, ease: 'back.in(1.5)' }, 62.0);
  tl.to('#vault', { opacity: 0, duration: 0.14 }, 62.42);
  tl.set('#endMark', { opacity: 1 }, 62.4);
  tl.to('#emDot', { scale: 1, duration: 0.5, ease: 'back.out(3.5)' }, 62.44);
  tl.to('#emArc1', { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' }, 62.6).to('#emArc2', { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' }, 62.66);
  tl.to('#emRing', { strokeDashoffset: 0, duration: 0.55, ease: 'power2.inOut' }, 62.5);
  tl.fromTo('#endMark', { rotation: -30 }, { rotation: 0, duration: 1.3, ease: 'elastic.out(1, 0.5)' }, 62.5);
  shake(63.0, 14);
  tl.to(state, { light: 1.1, duration: 0.2 }, 63.0).to(state, { light: 0.9, duration: 2 }, 63.2);
  tl.fromTo('#t10a', { opacity: 0, y: 34, scale: 1.06 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }, 63.0);
  say('#t10b', 63.9, null, { stagger: 0.07, drift: 0 });
  tl.fromTo('#t10c', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7 }, 65.1);
  tl.fromTo('#t10d', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 65.7);
  // Nothing sits still: the mark breathes and the camera keeps easing in.
  tl.to('#endMark', { scale: 3.22, duration: 6.4, ease: 'sine.inOut' }, 63.3);
  camTo({ z: END.z * 1.035 }, 63.2, 6.6, 'none');
  tl.to('#type', { scale: 1.02, duration: 6.6, ease: 'none' }, 63.2);
  tl.to('#fade', { opacity: 1, duration: 0.8, ease: 'power2.in' }, 69.2);

  // Pad the timeline to exactly 70 s.
  tl.set({}, {}, DUR);

  // Record the camera's screen-space path once, frame by frame, for motion blur.
  (function () {
    const path = [];
    for (let f = 0; f <= DUR * 30; f++) {
      tl.seek(f / 30, true);
      path.push([-(cam.x + cam.kx) * cam.z, -(cam.y + cam.ky) * cam.z]);
    }
    camPath = path;
  })();

  window.__timelines = window.__timelines || {};
  window.__timelines['main'] = tl;
  tl.seek(0);
  render();
})();
