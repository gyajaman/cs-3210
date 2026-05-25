import { C } from '../theme.js';

export const id = 'knapsack-greedy';
export const title = 'Fractional Knapsack';
export const categories = ['greedy'];
export const badge = 'Greedy';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let animFrameId;

const ITEM_COLORS = [
  { fill: 'rgba(124,77,255,0.18)', border: '#7c4dff', label: '#b39ddb' },
  { fill: 'rgba(79,195,247,0.18)', border: '#4fc3f7', label: '#81d4fa' },
  { fill: 'rgba(102,187,106,0.18)', border: '#66bb6a', label: '#a5d6a7' },
  { fill: 'rgba(255,202,40,0.18)', border: '#ffca28', label: '#fff176' },
  { fill: 'rgba(239,83,80,0.18)', border: '#ef5350', label: '#ef9a9a' },
  { fill: 'rgba(206,147,216,0.18)', border: '#ce93d8', label: '#e1bee7' },
  { fill: 'rgba(255,138,101,0.18)', border: '#ff8a65', label: '#ffab91' },
  { fill: 'rgba(38,166,154,0.18)', border: '#26a69a', label: '#80cbc4' },
];

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
    items: [],
    capacity: 0,
    n: 0,
    phase: 'input',

    sortedItems: [],
    displayOrder: [],
    sorted: false,
    takenItems: [],
    currentIdx: -1,
    remainingCap: 0,
    totalValue: 0,

    animPositions: new Map(),

    trace: [],
    currentStep: -1,

    isPlaying: false,
    isStepping: false,
    speed: 5,
    animDelay: 600,
  };

  setupDOM();
  setupCanvas();
  bindEvents();
  updateControls();
  updateEmptyState();
  updateStatus('Enter items (weight:value) and capacity, then click Visualize.');
  updateMetrics();
  renderPanel();
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
      <label>Items (w:v)</label>
      <input type="text" id="gk-items" value="" placeholder="10:60, 20:100, 30:120" style="width:220px">
    </div>
    <div class="input-group">
      <label>Cap</label>
      <input type="text" id="gk-capacity" value="" placeholder="50" style="width:45px">
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
    <div class="ds-section gk-section-table">
      <div class="ds-header">
        <span>Items (sorted by v/w)</span>
        <span class="ds-count" id="gk-table-count"></span>
      </div>
      <div id="gk-table-container" class="ot-scroll">
        <div class="ev-empty">Enter items and capacity, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section gk-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="gk-step-count"></span>
      </div>
      <div id="gk-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter items and capacity, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Items</span><span class="value" id="m-items">0</span></div>
      <div class="info-metric"><span class="label">Capacity</span><span class="value" id="m-cap">–</span></div>
      <div class="info-metric"><span class="label">Remaining</span><span class="value" id="m-rem">–</span></div>
      <div class="info-metric"><span class="label">Value</span><span class="value" id="m-value">–</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Fractional Knapsack</div>
    <div class="es-sub">Greedy: sort by value/weight ratio, take as much as possible</div>
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
  on(document.getElementById('gk-items'), 'input', onInputChange);
  on(document.getElementById('gk-capacity'), 'input', onInputChange);
}

function handleResize() { setupCanvas(); render(); }
function onInputChange() { updateControls(); }

function parseInput() {
  const itemsStr = document.getElementById('gk-items').value.trim();
  const capStr = document.getElementById('gk-capacity').value.trim();

  const items = itemsStr.split(/[,;]\s*/).map((s, i) => {
    const parts = s.split(':');
    if (parts.length !== 2) return null;
    const w = parseFloat(parts[0]);
    const v = parseFloat(parts[1]);
    if (isNaN(w) || isNaN(v) || w <= 0 || v <= 0) return null;
    return { id: i, weight: w, value: v, ratio: v / w };
  }).filter(Boolean);

  const capacity = parseFloat(capStr);
  return { items, capacity };
}

function inputValid() {
  const { items, capacity } = parseInput();
  return items.length >= 2 && items.length <= 8 &&
         !isNaN(capacity) && capacity > 0;
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('gk-items').value = '10:60, 20:100, 30:120';
  document.getElementById('gk-capacity').value = '50';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 4 + Math.floor(Math.random() * 4);
  const items = [];
  for (let i = 0; i < n; i++) {
    const w = 5 + Math.floor(Math.random() * 30);
    const v = 10 + Math.floor(Math.random() * 100);
    items.push(`${w}:${v}`);
  }
  const maxW = Math.max(...items.map(s => parseInt(s)));
  const cap = maxW + 10 + Math.floor(Math.random() * 40);
  document.getElementById('gk-items').value = items.join(', ');
  document.getElementById('gk-capacity').value = String(cap);
  updateControls();
}

function buildTrace(items, capacity) {
  const sorted = items.map((it, i) => ({ ...it, origIdx: i }))
    .sort((a, b) => b.ratio - a.ratio);

  const trace = [];
  trace.push({ type: 'init', n: items.length, capacity, sorted: sorted.map(s => s.origIdx) });
  trace.push({ type: 'sort', sorted: sorted.map(s => ({ origIdx: s.origIdx, ratio: s.ratio, weight: s.weight, value: s.value })) });

  let remaining = capacity;
  const taken = [];

  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    if (remaining <= 0) {
      trace.push({
        type: 'consider',
        sortIdx: i,
        origIdx: it.origIdx,
        weight: it.weight,
        value: it.value,
        ratio: it.ratio,
        remaining,
        decision: 'skip-full',
        fraction: 0,
        taken: 0,
        gained: 0,
      });
      continue;
    }

    if (it.weight <= remaining) {
      taken.push({ origIdx: it.origIdx, fraction: 1, weightTaken: it.weight, valueGained: it.value });
      remaining -= it.weight;
      trace.push({
        type: 'consider',
        sortIdx: i,
        origIdx: it.origIdx,
        weight: it.weight,
        value: it.value,
        ratio: it.ratio,
        remaining: remaining + it.weight,
        decision: 'take-all',
        fraction: 1,
        taken: it.weight,
        gained: it.value,
        newRemaining: remaining,
      });
    } else {
      const frac = remaining / it.weight;
      const gained = frac * it.value;
      taken.push({ origIdx: it.origIdx, fraction: frac, weightTaken: remaining, valueGained: gained });
      trace.push({
        type: 'consider',
        sortIdx: i,
        origIdx: it.origIdx,
        weight: it.weight,
        value: it.value,
        ratio: it.ratio,
        remaining,
        decision: 'take-fraction',
        fraction: frac,
        taken: remaining,
        gained,
        newRemaining: 0,
      });
      remaining = 0;
    }
  }

  const totalValue = taken.reduce((s, t) => s + t.valueGained, 0);
  const totalWeight = taken.reduce((s, t) => s + t.weightTaken, 0);
  trace.push({ type: 'complete', taken, totalValue, totalWeight });

  return { trace, sorted };
}

function startVisualization() {
  if (!inputValid()) return;
  const { items, capacity } = parseInput();

  state.items = items;
  state.capacity = capacity;
  state.n = items.length;
  state.phase = 'running';

  const { trace, sorted } = buildTrace(items, capacity);
  state.trace = trace;
  state.sortedItems = sorted;
  state.displayOrder = items.map((it, i) => ({ ...it, origIdx: i }));
  state.sorted = false;
  state.animPositions = new Map();
  state.currentStep = -1;
  state.takenItems = [];
  state.currentIdx = -1;
  state.remainingCap = capacity;
  state.totalValue = 0;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('gk-items').disabled = true;
  document.getElementById('gk-capacity').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Items sorted by value/weight ratio. Step through greedy choices.');
  updateMetrics();
  renderPanel();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  let needsAnim = false;
  switch (ev.type) {
    case 'init':
      snapBarsToSlots();
      updateStatus(`${ev.n} items, capacity ${ev.capacity}. Sorting by v/w ratio…`);
      break;

    case 'sort':
      state.displayOrder = state.sortedItems;
      state.sorted = true;
      updateStatus(`Sorted by ratio (v/w): ${ev.sorted.map(s => `i${s.origIdx}(${s.ratio.toFixed(1)})`).join(' > ')}`);
      needsAnim = true;
      break;

    case 'consider':
      state.currentIdx = ev.sortIdx;
      if (ev.decision === 'take-all') {
        state.takenItems.push({ origIdx: ev.origIdx, fraction: 1, weightTaken: ev.taken, valueGained: ev.gained });
        state.remainingCap = ev.newRemaining;
        state.totalValue += ev.gained;
        updateStatus(`Take ALL of item ${ev.origIdx} (w=${ev.weight}). Remaining = ${fmtNum(ev.newRemaining)}`);
      } else if (ev.decision === 'take-fraction') {
        state.takenItems.push({ origIdx: ev.origIdx, fraction: ev.fraction, weightTaken: ev.taken, valueGained: ev.gained });
        state.remainingCap = 0;
        state.totalValue += ev.gained;
        updateStatus(`Take ${(ev.fraction * 100).toFixed(1)}% of item ${ev.origIdx} (${fmtNum(ev.taken)}/${ev.weight}). Knapsack full!`);
      } else {
        updateStatus(`Skip item ${ev.origIdx}: knapsack already full.`);
      }
      break;

    case 'complete':
      state.currentIdx = -1;
      updateStatus(`Done! Total value = ${fmtNum(ev.totalValue)}, weight = ${fmtNum(ev.totalWeight)}/${state.capacity}`);
      break;
  }

  renderPanel();
  renderStepInspector();
  updateMetrics();
  render();
  return needsAnim;
}

async function stepForward() {
  if (state.phase !== 'running' || state.isPlaying || state.isStepping) return;
  if (state.currentStep >= state.trace.length - 1) { finishVisualization(); return; }

  state.isStepping = true;
  updateControls();
  try {
    state.currentStep += 1;
    const needsAnim = applyEvent(state.trace[state.currentStep]);
    if (needsAnim) await animateBars();
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
    const needsAnim = applyEvent(state.trace[state.currentStep]);
    if (needsAnim) await animateBars();
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
  updateControls();
  updateMetrics();
  renderPanel();
  renderStepInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  cancelAnim();
  state.phase = 'input';
  state.trace = [];
  state.currentStep = -1;
  state.items = [];
  state.capacity = 0;
  state.n = 0;
  state.sortedItems = [];
  state.displayOrder = [];
  state.sorted = false;
  state.animPositions = new Map();
  state.takenItems = [];
  state.currentIdx = -1;
  state.remainingCap = 0;
  state.totalValue = 0;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('gk-items').disabled = false;
  document.getElementById('gk-capacity').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter items (weight:value) and capacity, then click Visualize.');
  updateMetrics();
  renderPanel();
  renderStepInspector();
  render();
}

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

function cancelAnim() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

function barLayout() {
  const n = state.displayOrder.length;
  const barH = Math.min(36, (ch - 80) / n - 8);
  const gap = 8;
  const totalH = n * barH + (n - 1) * gap;
  const startY = (ch - totalH) / 2;
  return { barH, gap, startY };
}

function slotY(slotIdx) {
  const { barH, gap, startY } = barLayout();
  return startY + slotIdx * (barH + gap);
}

function snapBarsToSlots() {
  for (let si = 0; si < state.displayOrder.length; si++) {
    const item = state.displayOrder[si];
    state.animPositions.set(item.origIdx, { y: slotY(si) });
  }
}

function animateBars(durationMs) {
  return new Promise(resolve => {
    cancelAnim();
    const starts = new Map();
    for (const [id, pos] of state.animPositions) {
      starts.set(id, pos.y);
    }
    const targets = new Map();
    for (let si = 0; si < state.displayOrder.length; si++) {
      const item = state.displayOrder[si];
      targets.set(item.origIdx, slotY(si));
    }

    const dur = durationMs || Math.max(300, 800 / state.speed);
    const t0 = performance.now();

    function frame(now) {
      if (!state) { resolve(); return; }
      let t = Math.min((now - t0) / dur, 1);
      t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      for (const [id, startY] of starts) {
        const targetY = targets.get(id);
        if (targetY !== undefined) {
          state.animPositions.set(id, { y: startY + (targetY - startY) * t });
        }
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

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  drawItemBars();
  drawKnapsack();
  drawTitle();
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

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawItemBars() {
  const n = state.displayOrder.length;
  if (n === 0) return;

  const barAreaX = 30;
  const barAreaW = cw * 0.42;
  const barH = Math.min(36, (ch - 80) / n - 8);
  const gap = 8;
  const totalH = n * barH + (n - 1) * gap;
  const startY = (ch - totalH) / 2;
  const isFinal = state.phase === 'complete';

  const maxWeight = Math.max(...state.items.map(it => it.weight));

  for (let si = 0; si < n; si++) {
    const item = state.displayOrder[si];
    const origIdx = item.origIdx;
    const ic = ITEM_COLORS[origIdx % ITEM_COLORS.length];
    const posData = state.animPositions.get(origIdx);
    const y = posData ? posData.y : startY + si * (barH + gap);

    const taken = state.takenItems.find(t => t.origIdx === origIdx);
    const isCurrent = si === state.currentIdx;
    const isSkipped = !taken && si < state.currentIdx;

    const fullBarW = (item.weight / maxWeight) * (barAreaW - 80);

    let fraction = 0;
    if (taken) fraction = taken.fraction;

    ctx.save();
    if (isCurrent) {
      ctx.shadowColor = C.intersection;
      ctx.shadowBlur = 10;
    } else if (taken) {
      ctx.shadowColor = isFinal ? C.lineV : ic.border;
      ctx.shadowBlur = 6;
    }

    roundedRect(barAreaX + 70, y, fullBarW, barH, 4);
    if (isSkipped) {
      ctx.fillStyle = 'rgba(255,255,255,0.015)';
    } else if (isCurrent && !taken) {
      ctx.fillStyle = 'rgba(255,202,40,0.06)';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
    }
    ctx.fill();
    ctx.strokeStyle = isSkipped ? 'rgba(200,200,208,0.06)' :
                      isCurrent ? C.intersection :
                      taken ? (isFinal ? C.lineV : ic.border) :
                      'rgba(200,200,208,0.12)';
    ctx.lineWidth = isCurrent || taken ? 1.5 : 1;
    ctx.stroke();

    if (fraction > 0) {
      const filledW = fullBarW * fraction;
      roundedRect(barAreaX + 70, y, filledW, barH, 4);
      ctx.fillStyle = isFinal ? 'rgba(102,187,106,0.2)' : ic.fill;
      ctx.fill();
      ctx.strokeStyle = isFinal ? C.lineV : ic.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (fraction < 1 && fraction > 0) {
        const lineX = barAreaX + 70 + filledW;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = C.intersection;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lineX, y - 2);
        ctx.lineTo(lineX, y + barH + 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();

    const labelColor = isSkipped ? C.textMuted :
                       isCurrent ? C.intersection :
                       taken ? (isFinal ? C.lineV : ic.label) : C.text;
    ctx.fillStyle = labelColor;
    ctx.font = 'bold 11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`i${origIdx}`, barAreaX + 58, y + barH / 2);

    ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillStyle = isSkipped ? C.textMuted : C.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(`r=${item.ratio.toFixed(1)}`, barAreaX + 70 + fullBarW + 8, y + barH / 2 - 6);
    ctx.fillText(`w=${item.weight}`, barAreaX + 70 + fullBarW + 8, y + barH / 2 + 7);

    if (taken && taken.fraction === 1) {
      const bx = barAreaX + 70 + fullBarW / 2;
      ctx.fillStyle = isFinal ? C.lineV : ic.label;
      ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FULL', bx, y + barH / 2);
    } else if (taken && taken.fraction < 1) {
      const bx = barAreaX + 70 + fullBarW * taken.fraction / 2;
      ctx.fillStyle = isFinal ? C.lineV : ic.label;
      ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${(taken.fraction * 100).toFixed(0)}%`, bx, y + barH / 2);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawKnapsack() {
  const kx = cw * 0.60;
  const kw = Math.min(cw * 0.26, 180);
  const kh = ch * 0.65;
  const ky = (ch - kh) / 2;
  const unitH = kh / state.capacity;
  const isFinal = state.phase === 'complete';

  ctx.save();
  roundedRect(kx, ky, kw, kh, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,200,208,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = C.textDim;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`KNAPSACK  (W=${state.capacity})`, kx + kw / 2, ky - 12);

  const tickInterval = state.capacity <= 20 ? 1 :
                       state.capacity <= 50 ? 5 :
                       state.capacity <= 100 ? 10 : 20;
  for (let w = 0; w <= state.capacity; w += tickInterval) {
    const my = ky + kh - w * unitH;
    ctx.strokeStyle = 'rgba(200,200,208,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(kx, my);
    ctx.lineTo(kx + kw, my);
    ctx.stroke();

    if (w > 0) {
      ctx.fillStyle = C.textMuted;
      ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(w), kx - 6, my + 3);
    }
  }

  if (state.remainingCap > 0 && state.remainingCap < state.capacity) {
    const usedWeight = state.capacity - state.remainingCap;
    const lineY = ky + kh - usedWeight * unitH;
    ctx.save();
    roundedRect(kx + 1, ky + 1, kw - 2, lineY - ky, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = C.intersection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(kx, lineY);
    ctx.lineTo(kx + kw, lineY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = C.intersection;
    ctx.font = 'bold 9px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`rem=${fmtNum(state.remainingCap)}`, kx + kw + 6, lineY + 4);
  }

  let fillY = ky + kh;
  for (const t of state.takenItems) {
    const origIdx = t.origIdx;
    const ic = ITEM_COLORS[origIdx % ITEM_COLORS.length];
    const blockH = t.weightTaken * unitH;
    fillY -= blockH;

    ctx.save();
    ctx.shadowColor = isFinal ? C.lineV : ic.border;
    ctx.shadowBlur = 5;
    roundedRect(kx + 4, fillY + 1, kw - 8, Math.max(blockH - 2, 2), 4);
    ctx.fillStyle = isFinal ? 'rgba(102,187,106,0.18)' : ic.fill;
    ctx.fill();
    ctx.strokeStyle = isFinal ? C.lineV : ic.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const labelColor = isFinal ? C.lineV : ic.label;
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (blockH > 18) {
      ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
      const fracStr = t.fraction < 1 ? ` (${(t.fraction * 100).toFixed(0)}%)` : '';
      ctx.fillText(`i${origIdx}${fracStr}`, kx + kw / 2, fillY + blockH / 2);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  if (state.takenItems.length > 0) {
    const totalW = state.takenItems.reduce((s, t) => s + t.weightTaken, 0);
    const totalV = state.takenItems.reduce((s, t) => s + t.valueGained, 0);
    const summaryColor = isFinal ? C.lineV : C.text;
    ctx.fillStyle = summaryColor;
    ctx.font = 'bold 11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`wt ${fmtNum(totalW)}/${state.capacity}   val ${fmtNum(totalV)}`, kx + kw / 2, ky + kh + 22);
    ctx.textAlign = 'left';
  }
}

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;

  let label, color;
  if (ev.type === 'complete') {
    label = `Optimal Value: ${fmtNum(ev.totalValue)}`;
    color = C.lineV;
  } else if (ev.type === 'sort') {
    label = 'Sorted items by value/weight ratio (greedy criterion)';
    color = C.accent;
  } else if (ev.type === 'consider') {
    if (ev.decision === 'take-all') {
      label = `Take all of item ${ev.origIdx} (w=${ev.weight}, v=${ev.value})`;
      color = C.lineV;
    } else if (ev.decision === 'take-fraction') {
      label = `Take ${(ev.fraction * 100).toFixed(1)}% of item ${ev.origIdx} (fills remaining ${fmtNum(ev.remaining)})`;
      color = C.intersection;
    } else {
      label = `Item ${ev.origIdx}: knapsack full, skip`;
      color = C.textDim;
    }
  } else if (ev.type === 'init') {
    label = `${ev.n} items, capacity ${ev.capacity}`;
    color = C.accent;
  } else {
    return;
  }

  ctx.fillStyle = color;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cw / 2, 18);
  ctx.textAlign = 'left';
}

function renderPanel() {
  const container = document.getElementById('gk-table-container');
  const countEl = document.getElementById('gk-table-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.n === 0) {
    container.innerHTML = '<div class="ev-empty">Enter items and capacity, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.takenItems.length}/${state.n}`;

  let html = '<table class="ot-dp-table"><thead><tr>';
  html += '<th>#</th><th>w</th><th>v</th><th>v/w</th><th>Taken</th>';
  html += '</tr></thead><tbody>';

  for (let si = 0; si < state.displayOrder.length; si++) {
    const item = state.displayOrder[si];
    const origIdx = item.origIdx;
    const taken = state.takenItems.find(t => t.origIdx === origIdx);
    const isCurrent = si === state.currentIdx;
    const isSkipped = !taken && si < state.currentIdx;

    let cls = '';
    if (isCurrent) cls = 'gk-row-current';
    else if (taken && taken.fraction === 1) cls = 'gk-row-taken';
    else if (taken) cls = 'gk-row-partial';
    else if (isSkipped) cls = '';

    const takenStr = taken
      ? (taken.fraction === 1 ? '100%' : `${(taken.fraction * 100).toFixed(1)}%`)
      : (isSkipped ? '–' : '');

    html += `<tr class="${cls}"><td>i${origIdx}</td><td>${item.weight}</td><td>${item.value}</td><td>${item.ratio.toFixed(2)}</td><td>${takenStr}</td></tr>`;
  }
  html += '</tbody></table>';

  container.innerHTML = html;
}

function renderStepInspector() {
  const inspEl = document.getElementById('gk-inspector');
  const stepEl = document.getElementById('gk-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Remaining Cap</span><strong>${fmtNum(state.remainingCap)}</strong></div>`;
  h += `<div class="mp-kv"><span>Total Value</span><strong>${fmtNum(state.totalValue)}</strong></div>`;

  if (ev && ev.type === 'consider') {
    h += `<div class="mp-block"><div class="mp-label">Greedy Choice</div>`;
    h += `<div class="mp-kv"><span>Item</span><strong>i${ev.origIdx} (w=${ev.weight}, v=${ev.value})</strong></div>`;
    h += `<div class="mp-kv"><span>Ratio v/w</span><strong>${ev.ratio.toFixed(2)}</strong></div>`;
    h += `<div class="mp-kv"><span>Remaining before</span><strong>${fmtNum(ev.remaining)}</strong></div>`;

    if (ev.decision === 'take-all') {
      h += `<div class="mp-kv"><span>Fits?</span><strong style="color:${C.lineV}">Yes (${ev.weight} ≤ ${fmtNum(ev.remaining)})</strong></div>`;
      h += `<div class="mp-kv"><span>Action</span><strong style="color:${C.lineV}">Take 100%</strong></div>`;
      h += `<div class="mp-kv"><span>Value gained</span><strong>+${fmtNum(ev.gained)}</strong></div>`;
      h += `<div class="mp-kv"><span>Remaining after</span><strong>${fmtNum(ev.newRemaining)}</strong></div>`;
    } else if (ev.decision === 'take-fraction') {
      h += `<div class="mp-kv"><span>Fits?</span><strong style="color:${C.intersection}">Partially (${ev.weight} > ${fmtNum(ev.remaining)})</strong></div>`;
      h += `<div class="mp-kv"><span>Fraction</span><strong style="color:${C.intersection}">${fmtNum(ev.remaining)}/${ev.weight} = ${(ev.fraction * 100).toFixed(1)}%</strong></div>`;
      h += `<div class="mp-kv"><span>Value gained</span><strong>+${fmtNum(ev.gained)}</strong></div>`;
      h += `<div class="mp-kv"><span>Remaining after</span><strong>0</strong></div>`;
    } else {
      h += `<div class="mp-kv"><span>Fits?</span><strong style="color:${C.sweep}">No (capacity = 0)</strong></div>`;
      h += `<div class="mp-kv"><span>Action</span><strong style="color:${C.textDim}">Skip</strong></div>`;
    }
    h += '</div>';
  }

  if (ev && ev.type === 'sort') {
    h += `<div class="mp-block"><div class="mp-label">Sort Order</div>`;
    for (let i = 0; i < ev.sorted.length; i++) {
      const s = ev.sorted[i];
      h += `<div class="mp-kv"><span>${i + 1}.</span><strong>i${s.origIdx}  v/w = ${s.ratio.toFixed(2)}</strong></div>`;
    }
    h += '</div>';
  }

  if (state.phase === 'complete') {
    h += `<div class="mp-block"><div class="mp-label">Solution</div>`;
    for (const t of state.takenItems) {
      const fracStr = t.fraction < 1 ? ` (${(t.fraction * 100).toFixed(1)}%)` : ' (100%)';
      h += `<div class="mp-kv"><span>i${t.origIdx}${fracStr}</span><strong>wt=${fmtNum(t.weightTaken)} val=${fmtNum(t.valueGained)}</strong></div>`;
    }
    const totalV = state.takenItems.reduce((s, t) => s + t.valueGained, 0);
    const totalW = state.takenItems.reduce((s, t) => s + t.weightTaken, 0);
    h += `<div class="mp-kv" style="margin-top:6px"><span>Total</span><strong class="qs-answer-value">wt=${fmtNum(totalW)} val=${fmtNum(totalV)}</strong></div>`;
    h += '</div>';
  }

  inspEl.innerHTML = h;
}

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
  step.disabled = !running || state.isPlaying || state.isStepping;
  play.disabled = !running || state.isStepping;
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
  let badgeCls = 'drawing', label = 'Input';
  if (state.phase === 'running') { badgeCls = 'running'; label = 'Running'; }
  else if (state.phase === 'complete') { badgeCls = 'complete'; label = 'Done'; }
  el.innerHTML = `<span class="phase ${badgeCls}">${label}</span> ${msg}`;
}

function updateMetrics() {
  document.getElementById('m-items').textContent = state.n || '0';
  document.getElementById('m-cap').textContent = state.capacity > 0 ? state.capacity : '–';
  document.getElementById('m-rem').textContent = state.remainingCap > 0 ? fmtNum(state.remainingCap) : (state.n > 0 ? '0' : '–');
  document.getElementById('m-value').textContent = state.totalValue > 0 ? fmtNum(state.totalValue) : '–';
}

function fmtNum(v) {
  if (v === undefined || v === null) return '–';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
