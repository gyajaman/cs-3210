export const id = 'quickselect';
export const title = 'QuickSelect (k-th Smallest)';
export const categories = ['divide-conquer'];
export const badge = 'Divide & Conquer';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let animFrameId;

// App color scheme (from CSS variables)
const C = {
  accent:       '#7c4dff',
  accentLight:  '#a48fff',
  accentDim:    'rgba(124,77,255,0.15)',
  lineH:        '#4fc3f7',   // cyan
  lineV:        '#66bb6a',   // green
  sweep:        '#ef5350',   // red
  intersection: '#ffca28',   // yellow
  activeLine:   '#ce93d8',   // magenta/purple
  text:         '#c8c8d0',
  textDim:      '#666680',
  textMuted:    '#44445a',
  bgCanvas:     '#0d1117',
};

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
    k: 0,
    phase: 'input',

    trace: [],
    currentStep: -1,

    // Each bar is an object { id, value, slot, color, alpha }
    // id is unique per bar and never changes
    // slot is the array index position the bar currently occupies
    bars: [],
    barById: new Map(),

    activeRange: null,
    pivotId: null,
    pivotValue: null,
    partitionResult: null,
    kIdx: null,
    decision: null,
    eliminatedIds: new Set(),
    foundId: null,
    foundValue: null,
    rejectCount: 0,

    // Animation: bar.id -> { x, y } current animated position
    animPositions: new Map(),

    isPlaying: false,
    isStepping: false,
    speed: 5,
    animDelay: 600,

    rounds: [],

    // Layout cache
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
  updateStatus('Enter an array and k value, or click Example to load a preset.');
  updateMetrics();
  renderRoundHistory();
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
      <input type="text" id="qs-array" value="" placeholder="e.g. 7,2,5,1,8,3" style="width:150px">
    </div>
    <div class="input-group">
      <label>k</label>
      <input type="text" id="qs-k" value="" placeholder="1" style="width:40px">
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
    <div class="ds-section qs-section-rounds">
      <div class="ds-header">
        <span>Round History</span>
        <span class="ds-count" id="qs-round-count"></span>
      </div>
      <div id="qs-round-list" class="qs-scroll">
        <div class="ev-empty">Enter an array and click Visualize</div>
      </div>
    </div>
    <div class="ds-section qs-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="qs-step-count"></span>
      </div>
      <div id="qs-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter an array and k value, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Size</span><span class="value" id="m-size">0</span></div>
      <div class="info-metric"><span class="label">k</span><span class="value" id="m-k">-</span></div>
      <div class="info-metric"><span class="label">Range</span><span class="value" id="m-range">-</span></div>
      <div class="info-metric"><span class="label">Steps</span><span class="value" id="m-steps">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">QuickSelect: Find the k-th Smallest</div>
    <div class="es-sub">Enter an array of numbers and a value for k, or click Example</div>
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
  on(document.getElementById('qs-array'), 'input', onInputChange);
  on(document.getElementById('qs-k'), 'input', onInputChange);
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
  const arrStr = document.getElementById('qs-array').value.trim();
  const kStr = document.getElementById('qs-k').value.trim();
  const arr = arrStr.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && isFinite(n));
  const k = parseInt(kStr, 10);
  return { arr, k };
}

function inputValid() {
  const { arr, k } = parseInput();
  return arr.length >= 2 && arr.length <= 20 && k >= 1 && k <= arr.length;
}

// ── Examples ──

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('qs-array').value = '7, 2, 5, 1, 8, 3, 6';
  document.getElementById('qs-k').value = '3';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 8 + Math.floor(Math.random() * 5);
  const used = new Set();
  const arr = [];
  while (arr.length < n) {
    const v = 1 + Math.floor(Math.random() * 50);
    if (!used.has(v)) { used.add(v); arr.push(v); }
  }
  const k = 1 + Math.floor(Math.random() * n);
  document.getElementById('qs-array').value = arr.join(', ');
  document.getElementById('qs-k').value = String(k);
  updateControls();
}

// ── Trace building ──
// The trace records the bar IDs that occupy each slot after each operation,
// so we can animate bars from old slots to new slots.

function buildTrace(arr, k) {
  const kIdx = k - 1;
  const trace = [];
  // work[slot] = { id, value } — id is the bar's permanent identity
  const work = arr.map((v, i) => ({ id: i, value: v }));

  function qs(lo, hi, targetK) {
    trace.push({ type: 'enter', lo, hi, targetK });

    if (lo === hi) {
      trace.push({ type: 'found', idx: lo, barId: work[lo].id, value: work[lo].value });
      return;
    }

    // Pick random pivot with good-splitter reselection
    // A "good splitter" lands in [n/4, 3n/4] of the active range
    const rangeSize = hi - lo + 1;
    let pivotPos, pivotId, pivotValue;
    while (true) {
      pivotPos = lo + Math.floor(Math.random() * rangeSize);
      pivotId = work[pivotPos].id;
      pivotValue = work[pivotPos].value;

      // Count how many in [lo..hi] are less than pivot
      let lessCount = 0;
      for (let i = lo; i <= hi; i++) {
        if (work[i].value < pivotValue) lessCount++;
      }
      // Pivot would land at position (lo + lessCount) after partition
      // Good splitter: at least n/4 on each side
      const pivotRank = lessCount; // rank within the subarray
      const lowerBound = Math.floor(rangeSize / 4);
      const upperBound = rangeSize - 1 - lowerBound;

      if (rangeSize <= 3 || (pivotRank >= lowerBound && pivotRank <= upperBound)) {
        // Good pivot (or range too small to be picky)
        trace.push({ type: 'pick-pivot', lo, hi, pivotPos, pivotId, pivotValue, good: true });
        break;
      } else {
        // Bad pivot — reject and retry
        trace.push({ type: 'reject-pivot', lo, hi, pivotPos, pivotId, pivotValue, lessCount, rangeSize });
      }
    }

    // Partition: Lomuto scheme
    swapWork(work, pivotPos, hi);
    let storeIdx = lo;
    for (let i = lo; i < hi; i++) {
      if (work[i].value < pivotValue) {
        if (i !== storeIdx) swapWork(work, i, storeIdx);
        storeIdx++;
      }
    }
    swapWork(work, storeIdx, hi);
    const p = storeIdx;

    // Snapshot: which bar id is in which slot now
    const slotMap = work.map(w => w.id);
    trace.push({
      type: 'partition-done',
      lo, hi, p, pivotId, pivotValue,
      slotMap,
    });

    trace.push({
      type: 'compare',
      lo, hi, p, targetK, pivotValue, pivotId,
      decision: targetK === p ? 'found' : (targetK < p ? 'left' : 'right'),
    });

    if (targetK === p) {
      trace.push({ type: 'found', idx: p, barId: pivotId, value: pivotValue });
    } else if (targetK < p) {
      trace.push({ type: 'eliminate', side: 'right', from: p + 1, to: hi, pivotSlot: p, keepLo: lo, keepHi: p - 1 });
      qs(lo, p - 1, targetK);
    } else {
      trace.push({ type: 'eliminate', side: 'left', from: lo, to: p - 1, pivotSlot: p, keepLo: p + 1, keepHi: hi });
      qs(p + 1, hi, targetK);
    }
  }

  qs(0, work.length - 1, kIdx);
  return trace;
}

function swapWork(arr, i, j) {
  const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
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
  const maxBarHeight = ch * 0.58;
  const barBottom = ch - 70;

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
    // Capture start positions
    const starts = new Map();
    for (const bar of state.bars) {
      const cur = state.animPositions.get(bar.id);
      starts.set(bar.id, cur ? cur.x : slotX(bar.slot));
    }
    // Targets
    const targets = new Map();
    for (const bar of state.bars) {
      targets.set(bar.id, slotX(bar.slot));
    }

    const dur = durationMs || Math.max(200, 600 / state.speed);
    const t0 = performance.now();

    function frame(now) {
      if (!state) { resolve(); return; }
      let t = Math.min((now - t0) / dur, 1);
      // Smooth ease-in-out: cubic bezier approximation
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

function cancelAnim() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

// ── Visualization lifecycle ──

function startVisualization() {
  if (!inputValid()) return;
  const { arr, k } = parseInput();

  state.array = arr;
  state.k = k;
  state.phase = 'running';
  state.trace = buildTrace(arr.slice(), k);
  state.currentStep = -1;
  state.activeRange = { lo: 0, hi: arr.length - 1 };
  state.pivotId = null;
  state.pivotValue = null;
  state.partitionResult = null;
  state.kIdx = k - 1;
  state.decision = null;
  state.eliminatedIds = new Set();
  state.foundId = null;
  state.foundValue = null;
  state.rounds = [];
  state.isPlaying = false;
  state.isStepping = false;

  // Create bar objects with identity
  state.bars = arr.map((v, i) => ({ id: i, value: v, slot: i, color: 'default', alpha: 1 }));
  state.barById = new Map(state.bars.map(b => [b.id, b]));

  document.getElementById('qs-array').disabled = true;
  document.getElementById('qs-k').disabled = true;

  computeLayout();
  snapBarsToSlots();

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through the QuickSelect algorithm or press Play.');
  updateMetrics();
  renderRoundHistory();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'enter':
      state.activeRange = { lo: ev.lo, hi: ev.hi };
      state.pivotId = null;
      state.pivotValue = null;
      state.partitionResult = null;
      state.decision = null;
      for (const bar of state.bars) {
        if (bar.slot >= ev.lo && bar.slot <= ev.hi && !state.eliminatedIds.has(bar.id)) {
          bar.color = 'active';
        }
      }
      updateStatus(`Entering subproblem [${ev.lo}..${ev.hi}], looking for the ${ordinal(state.k)} smallest`);
      break;

    case 'reject-pivot': {
      state.pivotId = ev.pivotId;
      state.pivotValue = ev.pivotValue;
      state.rejectCount++;
      for (const bar of state.bars) {
        if (bar.slot >= ev.lo && bar.slot <= ev.hi && !state.eliminatedIds.has(bar.id)) {
          bar.color = bar.id === ev.pivotId ? 'rejected' : 'active';
        }
      }
      const lowerBound = Math.floor(ev.rangeSize / 4);
      const upperBound = ev.rangeSize - 1 - lowerBound;
      state.rounds.push({
        lo: ev.lo, hi: ev.hi,
        pivot: ev.pivotValue, p: null, k: null,
        decision: 'rejected',
        lessCount: ev.lessCount,
        rangeSize: ev.rangeSize,
      });
      updateStatus(`Rejected pivot ${ev.pivotValue} — rank ${ev.lessCount} not in [${lowerBound}..${upperBound}]. Reselecting...`);
      break;
    }

    case 'pick-pivot':
      state.pivotId = ev.pivotId;
      state.pivotValue = ev.pivotValue;
      for (const bar of state.bars) {
        if (bar.slot >= ev.lo && bar.slot <= ev.hi && !state.eliminatedIds.has(bar.id)) {
          bar.color = bar.id === ev.pivotId ? 'pivot' : 'active';
        }
      }
      updateStatus(`Good pivot picked: ${ev.pivotValue}`);
      break;

    case 'partition-done': {
      state.partitionResult = ev.p;
      state.pivotId = ev.pivotId;
      state.pivotValue = ev.pivotValue;

      // Update bar slots from the slotMap (slotMap[slot] = barId)
      for (let slot = 0; slot < ev.slotMap.length; slot++) {
        const barId = ev.slotMap[slot];
        const bar = state.barById.get(barId);
        if (bar) bar.slot = slot;
      }

      // Color bars in the partition range
      for (const bar of state.bars) {
        if (state.eliminatedIds.has(bar.id)) continue;
        if (bar.slot >= ev.lo && bar.slot <= ev.hi) {
          if (bar.id === ev.pivotId) bar.color = 'pivot';
          else if (bar.slot < ev.p) bar.color = 'less';
          else bar.color = 'greater';
        }
      }
      updateStatus(`Partitioned: pivot ${ev.pivotValue} landed at index ${ev.p}`);
      break;
    }

    case 'compare':
      state.decision = ev.decision;
      state.rounds.push({
        lo: ev.lo, hi: ev.hi,
        pivot: ev.pivotValue, p: ev.p, k: ev.targetK,
        decision: ev.decision,
      });
      if (ev.decision === 'found') {
        updateStatus(`Pivot landed exactly at position ${ev.p}. That's our ${ordinal(state.k)} smallest!`);
      } else if (ev.decision === 'left') {
        updateStatus(`Target position < pivot position (p=${ev.p}). Answer is in the LEFT side [${ev.lo}..${ev.p - 1}]`);
      } else {
        updateStatus(`Target position > pivot position (p=${ev.p}). Answer is in the RIGHT side [${ev.p + 1}..${ev.hi}]`);
      }
      break;

    case 'eliminate': {
      // Dim eliminated bars on the discarded side
      for (const bar of state.bars) {
        if (bar.slot >= ev.from && bar.slot <= ev.to) {
          state.eliminatedIds.add(bar.id);
          bar.color = 'eliminated';
          bar.alpha = 0.4;
        }
      }
      // Settle the pivot — it's in its final position, also eliminated
      const pivotBar = state.barById.get(state.pivotId);
      if (pivotBar) {
        state.eliminatedIds.add(pivotBar.id);
        pivotBar.color = 'eliminated';
        pivotBar.alpha = 0.4;
      }
      state.activeRange = { lo: ev.keepLo, hi: ev.keepHi };
      const count = ev.to - ev.from + 1;
      updateStatus(`Eliminated ${count} element${count !== 1 ? 's' : ''} on the ${ev.side} + pivot. Range: [${ev.keepLo}..${ev.keepHi}]`);
      break;
    }

    case 'found': {
      state.foundId = ev.barId;
      state.foundValue = ev.value;
      const bar = state.barById.get(ev.barId);
      if (bar) { bar.color = 'found'; bar.alpha = 1; }
      updateStatus(`Found! The ${ordinal(state.k)} smallest element is ${ev.value}`);
      break;
    }
  }

  renderRoundHistory();
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

    if (ev.type === 'partition-done') {
      applyEvent(ev);
      await animateBars();
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

    if (ev.type === 'partition-done') {
      applyEvent(ev);
      await animateBars();
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
  state.decision = null;
  state.activeRange = null;

  updateStatus(`Complete! The ${ordinal(state.k)} smallest element is ${state.foundValue}`);
  updateControls();
  updateMetrics();
  renderRoundHistory();
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
  state.activeRange = null;
  state.pivotId = null;
  state.pivotValue = null;
  state.partitionResult = null;
  state.kIdx = null;
  state.decision = null;
  state.eliminatedIds = new Set();
  state.foundId = null;
  state.foundValue = null;
  state.rejectCount = 0;
  state.rounds = [];
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('qs-array').disabled = false;
  document.getElementById('qs-k').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter an array and k value, or click Example to load a preset.');
  updateMetrics();
  renderRoundHistory();
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
  drawRangeBracket();
  drawBars();
  drawPivotIndicator();
  drawFoundLabel();
  drawKMarker();
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

function drawRangeBracket() {
  if (!state.activeRange) return;
  const { lo, hi } = state.activeRange;
  const bw = state.barWidth;

  const x1 = slotX(lo) - 16;
  const x2 = slotX(hi) + bw + 16;
  const w = Math.max(0, x2 - x1);
  if (w <= 0) return;

  ctx.fillStyle = 'rgba(124,77,255,0.08)';
  ctx.fillRect(x1, 0, w, ch);
  ctx.strokeStyle = 'rgba(124,77,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x1 + 0.5, 0.5, Math.max(0, w - 1), ch - 1);
  ctx.fillStyle = '#a48fff';
  ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText(`[${lo}..${hi}]`, x1 + 6, 14);
}

function drawBars() {
  const bw = state.barWidth;
  const bottom = state.barBottom;

  // Sort by slot for proper z-order (eliminated in back, active in front)
  const sortedBars = state.bars.slice().sort((a, b) => {
    // Draw eliminated first (behind), then normal, then pivot/found on top
    const za = a.color === 'found' ? 3 : a.color === 'pivot' ? 2 : state.eliminatedIds.has(a.id) ? 0 : 1;
    const zb = b.color === 'found' ? 3 : b.color === 'pivot' ? 2 : state.eliminatedIds.has(b.id) ? 0 : 1;
    return za - zb || a.slot - b.slot;
  });

  for (const bar of sortedBars) {
    const pos = state.animPositions.get(bar.id);
    const x = pos ? pos.x : slotX(bar.slot);
    const h = barHeight(bar.value);
    const y = bottom - h;
    const colors = getBarColor(bar.color);

    ctx.save();
    ctx.globalAlpha = bar.alpha;

    // Glow
    if (colors.glow) {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 14;
    }

    // Muted fill
    ctx.fillStyle = colors.fill;
    ctx.fillRect(x, y, bw, h);

    // Bold border
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = bar.color === 'default' || bar.color === 'eliminated' ? 1.2 : 2;
    ctx.strokeRect(x, y, bw, h);

    ctx.restore();

    // Value label above bar
    ctx.save();
    ctx.globalAlpha = bar.alpha < 0.4 ? 0.25 : 1;
    ctx.fillStyle = colors.label || C.text;
    ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(bar.value), x + bw / 2, y - 8);

    // Index below bar
    ctx.fillStyle = bar.alpha < 0.4 ? 'rgba(100,100,128,0.25)' : C.textDim;
    ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(String(bar.slot), x + bw / 2, bottom + 15);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

function drawPivotIndicator() {
  if (state.pivotId === null || state.phase === 'complete') return;
  const bar = state.barById.get(state.pivotId);
  if (!bar || (bar.color !== 'pivot' && bar.color !== 'rejected')) return;

  const isRejected = bar.color === 'rejected';
  const color = isRejected ? C.sweep : C.intersection;

  const bw = state.barWidth;
  const pos = state.animPositions.get(bar.id);
  const x = (pos ? pos.x : slotX(bar.slot)) + bw / 2;
  const h = barHeight(bar.value);
  const y = state.barBottom - h - 36;

  // Down-pointing triangle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.closePath();
  ctx.fill();

  // Label
  ctx.fillStyle = color;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PIVOT', x, y - 4);
  ctx.textAlign = 'left';
}

function drawFoundLabel() {
  if (state.foundId === null) return;
  const bar = state.barById.get(state.foundId);
  if (!bar) return;

  const bw = state.barWidth;
  const pos = state.animPositions.get(bar.id);
  const x = pos ? pos.x : slotX(bar.slot);
  const h = barHeight(bar.value);
  const y = state.barBottom - h;
  const cx_ = x + bw / 2;

  // Outer glow ring
  ctx.save();
  ctx.strokeStyle = 'rgba(102,187,106,0.45)';
  ctx.lineWidth = 2;
  ctx.shadowColor = C.lineV;
  ctx.shadowBlur = 22;
  ctx.strokeRect(x - 5, y - 5, bw + 10, h + 10);
  ctx.restore();

  // Label above
  const labelY = y - 42;
  ctx.fillStyle = C.lineV;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`FOUND: ${state.foundValue}`, cx_, labelY);
  ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText(`${ordinal(state.k)} smallest`, cx_, labelY + 14);
  ctx.textAlign = 'left';
}

function drawKMarker() {
  if (state.kIdx === null || state.phase === 'complete') return;
  const y = state.barBottom + 48;
  ctx.fillStyle = C.intersection;
  ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`target: ${ordinal(state.k)} smallest (k=${state.k})`, cw / 2, y);
  ctx.textAlign = 'left';
}

function getBarColor(key) {
  const colors = {
    default: {
      fill: 'rgba(143,149,173,0.08)', border: '#2f344a', glow: null,
      label: C.text,
    },
    active: {
      fill: 'rgba(124,77,255,0.18)', border: '#7c4dff', glow: null,
      label: '#c6b6ff',
    },
    pivot: {
      fill: 'rgba(255,202,40,0.18)', border: '#ffca28', glow: C.intersection,
      label: '#fff176',
    },
    less: {
      fill: 'rgba(79,195,247,0.18)', border: '#4fc3f7', glow: null,
      label: '#81d4fa',
    },
    greater: {
      fill: 'rgba(206,147,216,0.18)', border: '#ce93d8', glow: null,
      label: '#e1bee7',
    },
    rejected: {
      fill: 'rgba(239,83,80,0.18)', border: '#ef5350', glow: '#ef5350',
      label: '#ef9a9a',
    },
    eliminated: {
      fill: 'rgba(143,149,173,0.05)', border: '#2a2a3e', glow: null,
      label: C.textDim,
    },
    found: {
      fill: 'rgba(102,187,106,0.18)', border: '#66bb6a', glow: C.lineV,
      label: '#a5d6a7',
    },
  };
  return colors[key] || colors.default;
}

// ── DS Panel ──

function renderRoundHistory() {
  const listEl = document.getElementById('qs-round-list');
  const countEl = document.getElementById('qs-round-count');
  if (!listEl || !countEl) return;

  if (state.rounds.length === 0) {
    listEl.innerHTML = '<div class="ev-empty">Enter an array and click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  const goodRounds = state.rounds.filter(r => r.decision !== 'rejected').length;
  const rejects = state.rounds.length - goodRounds;
  countEl.textContent = rejects > 0
    ? `${goodRounds} round${goodRounds !== 1 ? 's' : ''}, ${rejects} rejected`
    : `${goodRounds} round${goodRounds !== 1 ? 's' : ''}`;

  let html = '';
  let roundNum = 0;
  for (let i = 0; i < state.rounds.length; i++) {
    const r = state.rounds[i];
    const isLast = i === state.rounds.length - 1;

    if (r.decision === 'rejected') {
      const lb = Math.floor(r.rangeSize / 4);
      const ub = r.rangeSize - 1 - lb;
      html += `
        <div class="qs-round-item${isLast ? ' qs-round-active' : ''}">
          <div class="qs-round-header">
            <span class="qs-round-num" style="opacity:0.5">try</span>
            <span class="qs-round-range">[${r.lo}..${r.hi}]</span>
            <span class="qs-round-decision qs-rejected">REJECTED</span>
          </div>
          <div class="qs-round-detail">
            Pivot=${r.pivot}, rank=${r.lessCount} not in [${lb}..${ub}]
          </div>
        </div>
      `;
    } else {
      roundNum++;
      const decClass = r.decision === 'found' ? 'qs-found' : (r.decision === 'left' ? 'qs-left' : 'qs-right');
      const decLabel = r.decision === 'found' ? 'FOUND' : (r.decision === 'left' ? 'GO LEFT' : 'GO RIGHT');
      html += `
        <div class="qs-round-item${isLast ? ' qs-round-active' : ''}">
          <div class="qs-round-header">
            <span class="qs-round-num">R${roundNum}</span>
            <span class="qs-round-range">[${r.lo}..${r.hi}]</span>
            <span class="qs-round-decision ${decClass}">${decLabel}</span>
          </div>
          <div class="qs-round-detail">
            Pivot=${r.pivot} at p=${r.p}, k=${r.k}
          </div>
        </div>
      `;
    }
  }
  listEl.innerHTML = html;
  listEl.scrollTop = listEl.scrollHeight;
}

function renderStepInspector() {
  const inspEl = document.getElementById('qs-inspector');
  const stepEl = document.getElementById('qs-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;

  const range = state.activeRange;
  const eliminated = state.eliminatedIds.size;
  const remaining = state.bars.length - eliminated;

  inspEl.innerHTML = `
    <div class="mp-kv"><span>Current Range</span><strong>${range ? `[${range.lo}..${range.hi}]` : '-'}</strong></div>
    <div class="mp-kv"><span>Target (k)</span><strong>${state.k ? `${ordinal(state.k)} smallest` : '-'}</strong></div>
    <div class="mp-kv"><span>Pivot Value</span><strong>${state.pivotValue !== null ? state.pivotValue : '-'}</strong></div>
    <div class="mp-kv"><span>Pivot Position (p)</span><strong>${state.partitionResult !== null ? state.partitionResult : '-'}</strong></div>
    <div class="mp-kv"><span>Decision</span><strong>${decisionBadge(state.decision)}</strong></div>
    <div class="mp-kv"><span>Eliminated</span><strong>${eliminated} / ${state.bars.length}</strong></div>
    <div class="mp-kv"><span>Remaining</span><strong>${remaining}</strong></div>
    <div class="mp-kv"><span>Pivots Rejected</span><strong>${state.rejectCount}</strong></div>
    ${state.foundValue !== null ? `<div class="mp-kv"><span>Answer</span><strong class="qs-answer-value">${state.foundValue}</strong></div>` : ''}
    <div class="mp-block">
      <div class="mp-label">Current Array</div>
      <div class="mp-chip-row">${arrayChips()}</div>
    </div>
  `;
}

function arrayChips() {
  if (!state.bars || state.bars.length === 0) {
    return '<span class="mp-chip mp-chip-empty">-</span>';
  }
  // Build array ordered by slot
  const bySlot = state.bars.slice().sort((a, b) => a.slot - b.slot);
  return bySlot.map(bar => {
    const elim = state.eliminatedIds.has(bar.id);
    let cls = 'mp-chip';
    if (bar.color === 'found') cls += ' qs-chip-found';
    else if (bar.color === 'pivot') cls += ' qs-chip-pivot';
    else if (elim) cls += ' qs-chip-elim';
    return `<span class="${cls}">${bar.value}</span>`;
  }).join('');
}

function decisionBadge(decision) {
  if (decision === 'found') return '<span class="mp-decision keep">FOUND</span>';
  if (decision === 'left') return '<span class="qs-decision-left">GO LEFT</span>';
  if (decision === 'right') return '<span class="qs-decision-right">GO RIGHT</span>';
  if (decision === 'rejected') return '<span class="qs-round-decision qs-rejected">REJECTED</span>';
  return '<span class="mp-decision idle">-</span>';
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
  const kEl = document.getElementById('m-k');
  const rangeEl = document.getElementById('m-range');
  const stepsEl = document.getElementById('m-steps');

  sizeEl.textContent = state.bars.length || '0';
  kEl.textContent = state.k ? `${state.k}` : '-';

  if (state.activeRange) {
    rangeEl.textContent = `[${state.activeRange.lo}..${state.activeRange.hi}]`;
  } else if (state.phase === 'complete') {
    rangeEl.textContent = 'Done';
  } else {
    rangeEl.textContent = '-';
  }

  stepsEl.textContent = state.currentStep >= 0 ? `${state.currentStep + 1}/${state.trace.length}` : '-';
}

// ── Helpers ──

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
