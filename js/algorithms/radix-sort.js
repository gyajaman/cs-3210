export const id = 'radix-sort';
export const title = 'Radix Sort (LSD)';
export const categories = ['sorting'];
export const badge = 'Sorting';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let animFrameId;

const C = {
  accent:       '#7c4dff',
  accentLight:  '#a48fff',
  accentDim:    'rgba(124,77,255,0.15)',
  lineH:        '#4fc3f7',
  lineV:        '#66bb6a',
  sweep:        '#ef5350',
  intersection: '#ffca28',
  activeLine:   '#ce93d8',
  text:         '#c8c8d0',
  textDim:      '#666680',
  textMuted:    '#44445a',
  bgCanvas:     '#0d1117',
};

// 10 distinct bucket colors for digits 0-9
const BUCKET_COLORS = [
  { fill: 'rgba(239,83,80,0.18)',   border: '#ef5350',  label: '#ef9a9a',  glow: null },  // 0 red
  { fill: 'rgba(255,138,101,0.18)', border: '#ff8a65',  label: '#ffab91',  glow: null },  // 1 orange
  { fill: 'rgba(255,202,40,0.18)',  border: '#ffca28',  label: '#fff176',  glow: null },  // 2 yellow
  { fill: 'rgba(102,187,106,0.18)', border: '#66bb6a',  label: '#a5d6a7',  glow: null },  // 3 green
  { fill: 'rgba(38,166,154,0.18)',  border: '#26a69a',  label: '#80cbc4',  glow: null },  // 4 teal
  { fill: 'rgba(79,195,247,0.18)',  border: '#4fc3f7',  label: '#81d4fa',  glow: null },  // 5 cyan
  { fill: 'rgba(124,77,255,0.18)',  border: '#7c4dff',  label: '#b39ddb',  glow: null },  // 6 purple
  { fill: 'rgba(206,147,216,0.18)', border: '#ce93d8',  label: '#e1bee7',  glow: null },  // 7 pink
  { fill: 'rgba(141,110,99,0.18)',  border: '#8d6e63',  label: '#bcaaa4',  glow: null },  // 8 brown
  { fill: 'rgba(144,164,174,0.18)', border: '#90a4ae',  label: '#b0bec5',  glow: null },  // 9 blue-grey
];

const DEFAULT_BAR = { fill: 'rgba(143,149,173,0.08)', border: '#2f344a', label: C.text, glow: null };
const SORTED_BAR  = { fill: 'rgba(102,187,106,0.18)', border: '#66bb6a', label: '#a5d6a7', glow: '#66bb6a' };

function on(el, event, handler) {
  el.addEventListener(event, handler);
  listeners.push({ el, event, handler });
}

export function init(elements) {
  els = elements;
  listeners = [];
  delayTimer = null;
  delayResolve = null;
  animFrameId = null;

  state = {
    array: [],
    phase: 'input',

    trace: [],
    currentStep: -1,

    bars: [],
    barById: new Map(),

    // Current visualization state
    currentPass: -1,
    totalPasses: 0,
    currentDigitPos: -1,
    activeBarId: null,
    buckets: Array.from({ length: 10 }, () => []),
    barDigitColor: new Map(), // barId -> digit (for coloring)
    sorted: false,

    animPositions: new Map(),

    // Mote animation state
    mote: null, // { x, y, targetX, targetY, color, glowColor, alpha, trail: [] }

    isPlaying: false,
    isStepping: false,
    speed: 5,
    animDelay: 600,

    passes: [], // history for DS panel

    // Layout
    barWidth: 0,
    barBottom: 0,
    maxBarHeight: 0,
    maxVal: 1,
    startX: 0,
    gap: 6,
  };

  setupDOM();
  setupCanvas();
  bindEvents();
  updateControls();
  updateEmptyState();
  updateStatus('Enter an array of non-negative integers, or click Example to load a preset.');
  updateMetrics();
  renderPassHistory();
  renderStepInspector();
  render();
}

export function destroy() {
  cancelDelay();
  cancelAnim();
  for (const { el, event, handler } of listeners) {
    el.removeEventListener(event, handler);
  }
  listeners = [];
  if (canvas) {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
  }
  state = null;
  els = canvas = ctx = null;
}

function setupDOM() {
  els.toolbarControls.innerHTML = `
    <div class="input-group">
      <label>Array</label>
      <input type="text" id="rx-array" value="" placeholder="e.g. 170,45,75,90,802,24,2,66" style="width:220px">
    </div>
    <button id="btn-example">Example</button>
    <button id="btn-random">Random</button>
    <div class="separator"></div>
    <button id="btn-run" class="primary">Visualize</button>
    <button id="btn-step" disabled>Step</button>
    <button id="btn-play" disabled>Play</button>
    <button id="btn-reset" disabled>Reset</button>
    <div class="separator"></div>
    <div class="speed-control">
      <label>Speed</label>
      <input type="range" id="speed" min="1" max="10" value="5">
    </div>
  `;

  els.dsPanel.innerHTML = `
    <div class="ds-section rx-section-passes">
      <div class="ds-header">
        <span>Pass History</span>
        <span class="ds-count" id="rx-pass-count"></span>
      </div>
      <div id="rx-pass-list" class="rx-scroll">
        <div class="ev-empty">Enter an array and click Visualize</div>
      </div>
    </div>
    <div class="ds-section rx-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="rx-step-count"></span>
      </div>
      <div id="rx-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter an array of non-negative integers, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Size</span><span class="value" id="m-size">0</span></div>
      <div class="info-metric"><span class="label">Max</span><span class="value" id="m-max">-</span></div>
      <div class="info-metric"><span class="label">Passes</span><span class="value" id="m-passes">-</span></div>
      <div class="info-metric"><span class="label">Steps</span><span class="value" id="m-steps">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Radix Sort (LSD): Sort by Digit Position</div>
    <div class="es-sub">Enter an array of non-negative integers, or click Example</div>
  `;

  canvas = els.canvas;
  ctx = canvas.getContext('2d');
}

function setupCanvas() {
  dpr = window.devicePixelRatio || 1;
  const rect = els.canvasContainer.getBoundingClientRect();
  cw = rect.width;
  ch = rect.height;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function bindEvents() {
  on(window, 'resize', handleResize);
  on(document.getElementById('btn-example'), 'click', loadExample);
  on(document.getElementById('btn-random'), 'click', loadRandom);
  on(document.getElementById('btn-run'), 'click', startVisualization);
  on(document.getElementById('btn-step'), 'click', stepForward);
  on(document.getElementById('btn-play'), 'click', togglePlay);
  on(document.getElementById('btn-reset'), 'click', resetVisualization);
  on(document.getElementById('speed'), 'input', updateSpeed);
  on(document.getElementById('rx-array'), 'input', onInputChange);
}

function handleResize() {
  setupCanvas();
  if (state.phase !== 'input') {
    computeLayout();
    snapBarsToSlots();
  }
  render();
}

function onInputChange() { updateControls(); }

function parseInput() {
  const arrStr = document.getElementById('rx-array').value.trim();
  const arr = arrStr.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && isFinite(n) && n >= 0 && Number.isInteger(n));
  return arr;
}

function inputValid() {
  const arr = parseInput();
  return arr.length >= 2 && arr.length <= 20;
}

// ── Examples ──

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('rx-array').value = '170, 45, 75, 90, 802, 24, 2, 66';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 8 + Math.floor(Math.random() * 5);
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push(Math.floor(Math.random() * 999) + 1);
  }
  document.getElementById('rx-array').value = arr.join(', ');
  updateControls();
}

// ── Trace building ──

function getDigit(num, pos) {
  return Math.floor(num / Math.pow(10, pos)) % 10;
}

function numDigits(num) {
  if (num === 0) return 1;
  return Math.floor(Math.log10(num)) + 1;
}

function buildTrace(arr) {
  const trace = [];
  const maxVal = Math.max(...arr);
  const passes = numDigits(maxVal);
  // work[slot] = { id, value }
  const work = arr.map((v, i) => ({ id: i, value: v }));

  for (let d = 0; d < passes; d++) {
    trace.push({ type: 'start-pass', pass: d, digitPos: d, totalPasses: passes });

    // Distribute into buckets
    const buckets = Array.from({ length: 10 }, () => []);
    for (let i = 0; i < work.length; i++) {
      const digit = getDigit(work[i].value, d);
      trace.push({ type: 'examine', barId: work[i].id, value: work[i].value, digit, digitPos: d, index: i });
      buckets[digit].push(work[i]);
      // Snapshot bucket state
      const bucketSnapshot = buckets.map(b => b.map(item => ({ id: item.id, value: item.value })));
      trace.push({ type: 'distribute', barId: work[i].id, value: work[i].value, digit, digitPos: d, buckets: bucketSnapshot });
    }

    // Collect from buckets back into array
    let idx = 0;
    const newOrder = [];
    for (let b = 0; b < 10; b++) {
      for (const item of buckets[b]) {
        work[idx] = item;
        newOrder.push({ id: item.id, slot: idx });
        idx++;
      }
    }
    const slotMap = work.map(w => w.id);
    const bucketSnapshot = buckets.map(b => b.map(item => ({ id: item.id, value: item.value })));
    trace.push({ type: 'collect', pass: d, digitPos: d, slotMap, buckets: bucketSnapshot });
  }

  trace.push({ type: 'complete' });
  return trace;
}

// ── Layout ──

function computeLayout() {
  const n = state.bars.length;
  if (n === 0) return;
  const maxVal = Math.max(...state.bars.map(b => b.value));
  const padding = 50;
  const gap = 6;
  const totalWidth = cw - padding * 2;
  const barWidth = Math.min(56, Math.max(22, (totalWidth - gap * (n - 1)) / n));
  const totalBarsWidth = n * barWidth + (n - 1) * gap;
  const startX = (cw - totalBarsWidth) / 2;
  const maxBarHeight = ch * 0.50;
  const barBottom = ch - 90;

  state.barWidth = barWidth;
  state.barBottom = barBottom;
  state.maxBarHeight = maxBarHeight;
  state.maxVal = maxVal || 1;
  state.startX = startX;
  state.gap = gap;
}

function slotX(slot) {
  return state.startX + slot * (state.barWidth + state.gap);
}

function barHeight(value) {
  return Math.max(12, (value / state.maxVal) * state.maxBarHeight);
}

function snapBarsToSlots() {
  for (const bar of state.bars) {
    state.animPositions.set(bar.id, { x: slotX(bar.slot) });
  }
}

// ── Animation ──

function animateBars(durationMs) {
  return new Promise(resolve => {
    cancelAnim();
    const starts = new Map();
    for (const bar of state.bars) {
      const cur = state.animPositions.get(bar.id);
      starts.set(bar.id, cur ? cur.x : slotX(bar.slot));
    }
    const targets = new Map();
    for (const bar of state.bars) {
      targets.set(bar.id, slotX(bar.slot));
    }

    const dur = durationMs || Math.max(200, 600 / state.speed);
    const t0 = performance.now();

    function frame(now) {
      if (!state) { resolve(); return; }
      let t = Math.min((now - t0) / dur, 1);
      t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      for (const bar of state.bars) {
        const sx = starts.get(bar.id);
        const tx = targets.get(bar.id);
        state.animPositions.set(bar.id, { x: sx + (tx - sx) * t });
      }
      render();

      if (t < 1) {
        animFrameId = requestAnimationFrame(frame);
      } else {
        snapBarsToSlots();
        render();
        resolve();
      }
    }
    animFrameId = requestAnimationFrame(frame);
  });
}

function animateMote(barId, digit) {
  return new Promise(resolve => {
    cancelAnim();
    const bar = state.barById.get(barId);
    if (!bar) { resolve(); return; }

    const bc = BUCKET_COLORS[digit];
    const bw = state.barWidth;
    const pos = state.animPositions.get(bar.id);
    const h = barHeight(bar.value);

    // Start from the center of the value label above the bar
    // drawBars draws text at (x + bw/2, barBottom - h - 8) where that y is the baseline.
    // Visual center of 12px text is ~5px above baseline.
    const barX = (pos ? pos.x : slotX(bar.slot)) + bw / 2;
    const barY = state.barBottom - h - 8 - 5;

    const bucketWidth = cw / 10;
    const targetX = digit * bucketWidth + bucketWidth / 2;
    const targetY = state.barBottom + 30 + 20; // center of bucket region

    const trail = [];
    const maxTrailLen = 12;

    state.mote = {
      x: barX, y: barY,
      color: bc.border,
      glowColor: bc.border,
      alpha: 1,
      trail,
    };

    const dur = Math.max(150, 400 / state.speed);
    const t0 = performance.now();

    function frame(now) {
      if (!state) { resolve(); return; }
      let t = Math.min((now - t0) / dur, 1);
      // Smooth ease-in-out
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // Simple path: x lerps from bar to bucket, y drops down smoothly
      const mx = barX + (targetX - barX) * ease;
      const my = barY + (targetY - barY) * ease;

      // Add to trail
      trail.push({ x: mx, y: my, alpha: 1 });
      if (trail.length > maxTrailLen) trail.shift();
      // Fade trail
      for (let i = 0; i < trail.length; i++) {
        trail[i].alpha = (i + 1) / trail.length;
      }

      state.mote.x = mx;
      state.mote.y = my;
      state.mote.alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2; // fade out at end
      render();

      if (t < 1) {
        animFrameId = requestAnimationFrame(frame);
      } else {
        state.mote = null;
        render();
        resolve();
      }
    }
    animFrameId = requestAnimationFrame(frame);
  });
}


function cancelAnim() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

// ── Visualization lifecycle ──

function startVisualization() {
  if (!inputValid()) return;
  const arr = parseInput();

  state.array = arr;
  state.phase = 'running';
  state.trace = buildTrace(arr.slice());
  state.currentStep = -1;
  state.currentPass = -1;
  state.totalPasses = numDigits(Math.max(...arr));
  state.currentDigitPos = -1;
  state.activeBarId = null;
  state.buckets = Array.from({ length: 10 }, () => []);
  state.barDigitColor = new Map();
  state.sorted = false;
  state.passes = [];
  state.isPlaying = false;
  state.isStepping = false;

  state.bars = arr.map((v, i) => ({ id: i, value: v, slot: i }));
  state.barById = new Map(state.bars.map(b => [b.id, b]));

  document.getElementById('rx-array').disabled = true;

  computeLayout();
  snapBarsToSlots();

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through the Radix Sort algorithm or press Play.');
  updateMetrics();
  renderPassHistory();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'start-pass':
      state.currentPass = ev.pass;
      state.currentDigitPos = ev.digitPos;
      state.totalPasses = ev.totalPasses;
      state.activeBarId = null;
      state.buckets = Array.from({ length: 10 }, () => []);
      state.barDigitColor = new Map();
      // Color bars by their digit for this pass
      for (const bar of state.bars) {
        const digit = getDigit(bar.value, ev.digitPos);
        state.barDigitColor.set(bar.id, digit);
      }
      state.passes.push({
        digitPos: ev.digitPos,
        label: digitPosLabel(ev.digitPos),
        bucketCounts: null,
        status: 'distributing',
      });
      updateStatus(`Pass ${ev.pass + 1}/${ev.totalPasses}: Sorting by ${digitPosLabel(ev.digitPos)} digit`);
      break;

    case 'examine':
      state.activeBarId = ev.barId;
      state.barDigitColor.set(ev.barId, ev.digit);
      updateStatus(`Examining ${ev.value}: ${digitPosLabel(ev.digitPos)} digit is ${ev.digit}`);
      break;

    case 'distribute':
      state.activeBarId = ev.barId;
      state.buckets = ev.buckets;
      // Update pass with bucket counts
      if (state.passes.length > 0) {
        const pass = state.passes[state.passes.length - 1];
        pass.bucketCounts = ev.buckets.map(b => b.length);
      }
      updateStatus(`Placed ${ev.value} into bucket ${ev.digit}`);
      break;

    case 'collect': {
      state.activeBarId = null;
      // Update bar slots from slotMap
      for (let slot = 0; slot < ev.slotMap.length; slot++) {
        const barId = ev.slotMap[slot];
        const bar = state.barById.get(barId);
        if (bar) bar.slot = slot;
      }
      state.buckets = ev.buckets;
      if (state.passes.length > 0) {
        state.passes[state.passes.length - 1].status = 'collected';
      }
      updateStatus(`Pass ${ev.pass + 1}: Collected all buckets back into array`);
      break;
    }

    case 'complete':
      state.sorted = true;
      state.activeBarId = null;
      updateStatus('Radix Sort complete! Array is now sorted.');
      break;
  }

  renderPassHistory();
  renderStepInspector();
  updateMetrics();
  render();
}

async function stepForward() {
  if (state.phase !== 'running' || state.isPlaying || state.isStepping) return;
  if (state.currentStep >= state.trace.length - 1) { finishVisualization(); return; }

  state.isStepping = true;
  updateControls();
  try {
    state.currentStep += 1;
    const ev = state.trace[state.currentStep];

    if (ev.type === 'collect') {
      applyEvent(ev);
      await animateBars();
    } else if (ev.type === 'distribute') {
      applyEvent(ev);
      await animateMote(ev.barId, ev.digit);
    } else {
      applyEvent(ev);
    }

    if (state.currentStep >= state.trace.length - 1) finishVisualization();
  } finally {
    state.isStepping = false;
    updateControls();
  }
}

async function togglePlay() {
  if (state.phase !== 'running') return;
  if (state.isPlaying) {
    state.isPlaying = false;
    cancelDelay();
    updateControls();
    return;
  }

  state.isPlaying = true;
  updateControls();

  while (state.isPlaying && state.currentStep < state.trace.length - 1) {
    state.currentStep += 1;
    const ev = state.trace[state.currentStep];

    if (ev.type === 'collect') {
      applyEvent(ev);
      await animateBars();
    } else if (ev.type === 'distribute') {
      applyEvent(ev);
      await animateMote(ev.barId, ev.digit);
    } else {
      applyEvent(ev);
    }

    if (state.currentStep >= state.trace.length - 1) { finishVisualization(); return; }
    await delay(state.animDelay);
  }

  state.isPlaying = false;
  updateControls();
}

function finishVisualization() {
  cancelDelay();
  cancelAnim();
  state.phase = 'complete';
  state.isPlaying = false;
  state.isStepping = false;
  state.activeBarId = null;
  state.mote = null;

  updateStatus('Radix Sort complete! Array is now sorted.');
  updateControls();
  updateMetrics();
  renderPassHistory();
  renderStepInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  cancelAnim();
  state.phase = 'input';
  state.trace = [];
  state.currentStep = -1;
  state.bars = [];
  state.barById = new Map();
  state.animPositions = new Map();
  state.currentPass = -1;
  state.totalPasses = 0;
  state.currentDigitPos = -1;
  state.activeBarId = null;
  state.buckets = Array.from({ length: 10 }, () => []);
  state.barDigitColor = new Map();
  state.sorted = false;
  state.mote = null;
  state.passes = [];
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('rx-array').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter an array of non-negative integers, or click Example to load a preset.');
  updateMetrics();
  renderPassHistory();
  renderStepInspector();
  render();
}

// ── Delay / speed ──

function delay(ms) {
  return new Promise(resolve => {
    delayResolve = resolve;
    delayTimer = setTimeout(() => { delayResolve = null; resolve(); }, ms);
  });
}

function cancelDelay() {
  if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
  if (delayResolve) { delayResolve(); delayResolve = null; }
}

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

// ── Rendering ──

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  drawBucketRegions();
  drawBars();
  drawMote();
  drawDigitPassLabel();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const spacing = 50;
  for (let x = spacing; x < cw; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
  }
  for (let y = spacing; y < ch; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
  }
}

function drawBucketRegions() {
  if (state.currentDigitPos < 0 || state.sorted) return;

  const y = state.barBottom + 30;
  const bucketWidth = cw / 10;

  for (let b = 0; b < 10; b++) {
    const x = b * bucketWidth;
    const bc = BUCKET_COLORS[b];

    // Background tint
    ctx.fillStyle = bc.fill;
    ctx.fillRect(x, y, bucketWidth, 40);
    ctx.save();
    ctx.strokeStyle = bc.border;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, bucketWidth - 1, 39);
    ctx.restore();

    // Bucket label
    ctx.fillStyle = bc.label;
    ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(b), x + bucketWidth / 2, y + 16);

    // Count
    const count = state.buckets[b] ? state.buckets[b].length : 0;
    if (count > 0) {
      ctx.fillStyle = bc.label;
      ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillText(`${count} item${count !== 1 ? 's' : ''}`, x + bucketWidth / 2, y + 32);
    }
  }
  ctx.textAlign = 'left';
}

function drawBars() {
  const bw = state.barWidth;
  const bottom = state.barBottom;

  for (const bar of state.bars) {
    const pos = state.animPositions.get(bar.id);
    const x = pos ? pos.x : slotX(bar.slot);
    const h = barHeight(bar.value);
    const y = bottom - h;
    const colors = getBarColors(bar);

    ctx.save();

    // Glow
    if (colors.glow) {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 14;
    }

    ctx.fillStyle = colors.fill;
    ctx.fillRect(x, y, bw, h);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = bar.id === state.activeBarId ? 2.5 : 1.2;
    ctx.strokeRect(x, y, bw, h);

    ctx.restore();

    // Value label above bar
    ctx.fillStyle = colors.label;
    ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';

    // Highlight the current digit in the value label
    if (state.currentDigitPos >= 0 && !state.sorted) {
      drawValueWithDigitHighlight(bar.value, state.currentDigitPos, x + bw / 2, y - 8);
    } else {
      ctx.fillText(String(bar.value), x + bw / 2, y - 8);
    }

    // Index below bar
    ctx.fillStyle = C.textDim;
    ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(String(bar.slot), x + bw / 2, bottom + 15);
    ctx.textAlign = 'left';
  }
}

function drawMote() {
  if (!state.mote) return;
  const m = state.mote;

  // Draw trail
  for (const pt of m.trail) {
    ctx.save();
    ctx.globalAlpha = pt.alpha * 0.4 * m.alpha;
    ctx.fillStyle = m.color;
    ctx.shadowColor = m.glowColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw main mote
  ctx.save();
  ctx.globalAlpha = m.alpha;
  ctx.fillStyle = m.color;
  ctx.shadowColor = m.glowColor;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
  ctx.fill();
  // Inner bright core
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = m.alpha * 0.8;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawValueWithDigitHighlight(value, digitPos, cx, cy) {
  const str = String(value);
  const digitIndex = str.length - 1 - digitPos; // index from left
  const charWidth = 7.5; // approximate monospace char width at 12px
  const totalWidth = str.length * charWidth;
  const startX = cx - totalWidth / 2;

  for (let i = 0; i < str.length; i++) {
    if (i === digitIndex) {
      // Highlight this digit
      const digit = parseInt(str[i], 10);
      const bc = BUCKET_COLORS[digit];
      ctx.fillStyle = bc.border;
      ctx.font = 'bold 13px JetBrains Mono, Fira Code, Consolas, monospace';
    } else {
      ctx.fillStyle = C.text;
      ctx.font = '12px JetBrains Mono, Fira Code, Consolas, monospace';
    }
    ctx.textAlign = 'center';
    ctx.fillText(str[i], startX + i * charWidth + charWidth / 2, cy);
  }
}

function drawDigitPassLabel() {
  if (state.currentDigitPos < 0) return;
  const label = state.sorted
    ? 'Sorted!'
    : `Pass ${state.currentPass + 1}/${state.totalPasses}: ${digitPosLabel(state.currentDigitPos)} digit`;

  ctx.fillStyle = state.sorted ? C.lineV : C.accent;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cw / 2, 20);
  ctx.textAlign = 'left';
}

function getBarColors(bar) {
  if (state.sorted) return SORTED_BAR;
  const digit = state.barDigitColor.get(bar.id);
  if (bar.id === state.activeBarId && digit !== undefined) {
    // Active bar: same bucket color but with glow to make it stand out
    const bc = BUCKET_COLORS[digit];
    return { fill: bc.fill, border: bc.border, label: bc.label, glow: bc.border };
  }
  if (digit !== undefined) return BUCKET_COLORS[digit];
  return DEFAULT_BAR;
}

// ── DS Panel ──

function renderPassHistory() {
  const listEl = document.getElementById('rx-pass-list');
  const countEl = document.getElementById('rx-pass-count');
  if (!listEl || !countEl) return;

  if (state.passes.length === 0) {
    listEl.innerHTML = '<div class="ev-empty">Enter an array and click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.passes.length} pass${state.passes.length !== 1 ? 'es' : ''}`;

  let html = '';
  for (let i = 0; i < state.passes.length; i++) {
    const p = state.passes[i];
    const isLast = i === state.passes.length - 1;
    const statusCls = p.status === 'collected' ? 'rx-pass-done' : 'rx-pass-active';
    const statusLabel = p.status === 'collected' ? 'DONE' : 'ACTIVE';

    html += `
      <div class="rx-pass-item${isLast ? ' rx-pass-current' : ''}">
        <div class="rx-pass-header">
          <span class="rx-pass-num">P${i + 1}</span>
          <span class="rx-pass-label">${p.label} digit</span>
          <span class="rx-pass-status ${statusCls}">${statusLabel}</span>
        </div>
        ${p.bucketCounts ? `<div class="rx-pass-detail">${bucketCountsDisplay(p.bucketCounts)}</div>` : ''}
      </div>
    `;
  }
  listEl.innerHTML = html;
  listEl.scrollTop = listEl.scrollHeight;
}

function bucketCountsDisplay(counts) {
  return counts.map((c, i) => c > 0 ? `<span class="rx-bucket-chip" style="color:${BUCKET_COLORS[i].border};background:${BUCKET_COLORS[i].fill}">${i}:${c}</span>` : '').filter(Boolean).join(' ');
}

function renderStepInspector() {
  const inspEl = document.getElementById('rx-inspector');
  const stepEl = document.getElementById('rx-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;

  const activeBar = state.activeBarId !== null ? state.barById.get(state.activeBarId) : null;
  const activeDigit = activeBar ? getDigit(activeBar.value, state.currentDigitPos) : null;

  inspEl.innerHTML = `
    <div class="mp-kv"><span>Current Pass</span><strong>${state.currentPass >= 0 ? `${state.currentPass + 1}/${state.totalPasses}` : '-'}</strong></div>
    <div class="mp-kv"><span>Digit Position</span><strong>${state.currentDigitPos >= 0 ? digitPosLabel(state.currentDigitPos) : '-'}</strong></div>
    <div class="mp-kv"><span>Active Element</span><strong>${activeBar ? activeBar.value : '-'}</strong></div>
    <div class="mp-kv"><span>Current Digit</span><strong>${activeDigit !== null ? activeDigit : '-'}</strong></div>
    <div class="mp-kv"><span>Sorted</span><strong>${state.sorted ? 'Yes' : 'No'}</strong></div>
    <div class="mp-block">
      <div class="mp-label">Current Array</div>
      <div class="mp-chip-row">${arrayChips()}</div>
    </div>
    <div class="mp-block">
      <div class="mp-label">Buckets</div>
      <div class="rx-buckets-grid">${bucketsGrid()}</div>
    </div>
  `;
}

function arrayChips() {
  if (!state.bars || state.bars.length === 0) {
    return '<span class="mp-chip mp-chip-empty">-</span>';
  }
  const bySlot = state.bars.slice().sort((a, b) => a.slot - b.slot);
  return bySlot.map(bar => {
    let cls = 'mp-chip';
    if (state.sorted) cls += ' rx-chip-sorted';
    else if (bar.id === state.activeBarId) cls += ' rx-chip-active';
    return `<span class="${cls}">${bar.value}</span>`;
  }).join('');
}

function bucketsGrid() {
  if (!state.buckets || state.currentDigitPos < 0) return '<span class="mp-chip mp-chip-empty">-</span>';
  let html = '';
  for (let b = 0; b < 10; b++) {
    const items = state.buckets[b] || [];
    if (items.length === 0) continue;
    const color = BUCKET_COLORS[b];
    html += `<div class="rx-bucket-row"><span class="rx-bucket-label" style="color:${color.border}">${b}:</span>`;
    html += items.map(item => `<span class="mp-chip" style="color:${color.label};background:${color.fill};border-color:${color.border}">${item.value}</span>`).join('');
    html += '</div>';
  }
  return html || '<span class="mp-chip mp-chip-empty">empty</span>';
}

// ── Controls ──

function updateControls() {
  const run = document.getElementById('btn-run');
  const step = document.getElementById('btn-step');
  const play = document.getElementById('btn-play');
  const reset = document.getElementById('btn-reset');
  const example = document.getElementById('btn-example');
  const random = document.getElementById('btn-random');

  const isInput = state.phase === 'input';
  const running = state.phase === 'running';

  run.disabled = !isInput || !inputValid();
  step.disabled = !running || state.isPlaying || state.isStepping || state.trace.length === 0;
  play.disabled = !running || state.isStepping || state.trace.length === 0;
  play.textContent = state.isPlaying ? 'Pause' : 'Play';
  reset.disabled = isInput;
  example.disabled = !isInput;
  random.disabled = !isInput;
}

function updateEmptyState() {
  els.emptyState.classList.toggle('hidden', state.phase !== 'input');
}

function updateStatus(msg) {
  const el = document.getElementById('info-status');
  let badgeCls = 'drawing';
  let label = 'Input';
  if (state.phase === 'running') { badgeCls = 'running'; label = 'Running'; }
  else if (state.phase === 'complete') { badgeCls = 'complete'; label = 'Done'; }
  el.innerHTML = `<span class="phase ${badgeCls}">${label}</span> ${msg}`;
}

function updateMetrics() {
  const sizeEl = document.getElementById('m-size');
  const maxEl = document.getElementById('m-max');
  const passesEl = document.getElementById('m-passes');
  const stepsEl = document.getElementById('m-steps');

  sizeEl.textContent = state.bars.length || '0';
  maxEl.textContent = state.bars.length > 0 ? Math.max(...state.bars.map(b => b.value)) : '-';
  passesEl.textContent = state.totalPasses > 0 ? `${Math.max(0, state.currentPass + 1)}/${state.totalPasses}` : '-';
  stepsEl.textContent = state.currentStep >= 0 ? `${state.currentStep + 1}/${state.trace.length}` : '-';
}

// ── Helpers ──

function digitPosLabel(pos) {
  const labels = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands'];
  return labels[pos] || `10^${pos}`;
}
