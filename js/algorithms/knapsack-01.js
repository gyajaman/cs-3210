export const id = 'knapsack-01';
export const title = '0/1 Knapsack';
export const categories = ['dynamic-programming'];
export const badge = 'Dynamic Programming';

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

    dp: [],
    decisions: new Map(),

    trace: [],
    currentStep: -1,

    currentItem: -1,
    currentCap: -1,
    bagItems: new Set(),
    selectedItems: new Set(),

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
  renderDPTable();
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
      <input type="text" id="ks-items" value="" placeholder="1:1, 3:4, 4:5, 5:7" style="width:200px">
    </div>
    <div class="input-group">
      <label>Cap</label>
      <input type="text" id="ks-capacity" value="" placeholder="7" style="width:45px">
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
    <div class="ds-section ks-section-table">
      <div class="ds-header">
        <span>DP Table</span>
        <span class="ds-count" id="ks-table-count"></span>
      </div>
      <div id="ks-table-container" class="ot-scroll">
        <div class="ev-empty">Enter items and capacity, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section ks-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="ks-step-count"></span>
      </div>
      <div id="ks-inspector" class="mp-inspector">
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
      <div class="info-metric"><span class="label">Row</span><span class="value" id="m-row">–</span></div>
      <div class="info-metric"><span class="label">Best</span><span class="value" id="m-best">–</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">0/1 Knapsack</div>
    <div class="es-sub">Enter items as weight:value pairs and a capacity, or click Example</div>
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
  on(document.getElementById('ks-items'), 'input', onInputChange);
  on(document.getElementById('ks-capacity'), 'input', onInputChange);
}

function handleResize() {
  setupCanvas();
  render();
}

function onInputChange() { updateControls(); }

function parseInput() {
  const itemsStr = document.getElementById('ks-items').value.trim();
  const capStr = document.getElementById('ks-capacity').value.trim();

  const items = itemsStr.split(/[,;]\s*|\s+/).map(s => {
    const parts = s.split(':');
    if (parts.length !== 2) return null;
    const w = parseInt(parts[0], 10);
    const v = parseInt(parts[1], 10);
    if (isNaN(w) || isNaN(v) || w <= 0 || v <= 0) return null;
    return { weight: w, value: v };
  }).filter(Boolean);

  const capacity = parseInt(capStr, 10);
  return { items, capacity };
}

function inputValid() {
  const { items, capacity } = parseInput();
  return items.length >= 2 && items.length <= 8 &&
         !isNaN(capacity) && capacity >= 1 && capacity <= 20;
}

// ── Examples ──

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('ks-items').value = '1:1, 3:4, 4:5, 5:7';
  document.getElementById('ks-capacity').value = '7';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 3 + Math.floor(Math.random() * 4);
  const items = [];
  for (let i = 0; i < n; i++) {
    const w = 1 + Math.floor(Math.random() * 8);
    const v = 1 + Math.floor(Math.random() * 15);
    items.push(`${w}:${v}`);
  }
  const maxW = Math.max(...items.map(s => parseInt(s)));
  const cap = maxW + 1 + Math.floor(Math.random() * 8);
  document.getElementById('ks-items').value = items.join(', ');
  document.getElementById('ks-capacity').value = String(Math.min(cap, 20));
  updateControls();
}

// ── Backtrack from any cell ──

function backtrackCell(row, cap) {
  const result = new Set();
  let remW = cap;
  for (let i = row; i >= 1; i--) {
    if (state.dp[i][remW] !== state.dp[i - 1][remW]) {
      result.add(i - 1);
      remW -= state.items[i - 1].weight;
    }
  }
  return result;
}

// ── Trace building ──

function buildTrace(items, capacity) {
  const n = items.length;
  const W = capacity;
  const dp = Array.from({ length: n + 1 }, () => Array(W + 1).fill(0));
  const trace = [];

  trace.push({ type: 'init', n, capacity: W, items: items.map(it => ({ ...it })) });

  for (let i = 1; i <= n; i++) {
    const it = items[i - 1];
    trace.push({ type: 'start-row', item: i, weight: it.weight, value: it.value });

    for (let w = 1; w <= W; w++) {
      const skipVal = dp[i - 1][w];

      if (it.weight > w) {
        dp[i][w] = skipVal;
        trace.push({
          type: 'fill-cell', i, w,
          value: dp[i][w], decision: 'too-heavy',
          skipVal, takeVal: null,
          itemWeight: it.weight, itemValue: it.value,
        });
      } else {
        const takeVal = dp[i - 1][w - it.weight] + it.value;
        if (takeVal > skipVal) {
          dp[i][w] = takeVal;
          trace.push({
            type: 'fill-cell', i, w,
            value: dp[i][w], decision: 'take',
            skipVal, takeVal,
            itemWeight: it.weight, itemValue: it.value,
          });
        } else {
          dp[i][w] = skipVal;
          trace.push({
            type: 'fill-cell', i, w,
            value: dp[i][w], decision: 'skip',
            skipVal, takeVal,
            itemWeight: it.weight, itemValue: it.value,
          });
        }
      }
    }
  }

  const selected = [];
  let remW = W;
  for (let i = n; i >= 1; i--) {
    if (dp[i][remW] !== dp[i - 1][remW]) {
      selected.push(i - 1);
      remW -= items[i - 1].weight;
    }
  }

  const totalWeight = selected.reduce((s, idx) => s + items[idx].weight, 0);
  const totalValue = selected.reduce((s, idx) => s + items[idx].value, 0);
  trace.push({ type: 'complete', selectedItems: selected, totalWeight, totalValue });

  return { trace, dp };
}

// ── Visualization lifecycle ──

function startVisualization() {
  if (!inputValid()) return;
  const { items, capacity } = parseInput();

  state.items = items;
  state.capacity = capacity;
  state.n = items.length;
  state.phase = 'running';

  const { trace, dp } = buildTrace(items, capacity);
  state.trace = trace;
  state.dp = dp;
  state.decisions = new Map();
  state.currentStep = -1;

  state.currentItem = -1;
  state.currentCap = -1;
  state.bagItems = new Set();
  state.selectedItems = new Set();

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('ks-items').disabled = true;
  document.getElementById('ks-capacity').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through the DP or press Play.');
  updateMetrics();
  renderDPTable();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.bagItems = new Set();
      updateStatus(`Initialized: ${ev.n} items, capacity ${ev.capacity}. Base row all zeros.`);
      break;

    case 'start-row':
      state.currentItem = ev.item;
      state.currentCap = -1;
      state.bagItems = new Set();
      updateStatus(`Row ${ev.item}: considering item ${ev.item - 1} (w=${ev.weight}, v=${ev.value})`);
      break;

    case 'fill-cell':
      state.currentItem = ev.i;
      state.currentCap = ev.w;
      state.decisions.set(`${ev.i},${ev.w}`, ev.decision);
      state.bagItems = backtrackCell(ev.i, ev.w);
      if (ev.decision === 'too-heavy') {
        updateStatus(`dp[${ev.i}][${ev.w}] = ${ev.value} — item too heavy (w=${ev.itemWeight} > ${ev.w})`);
      } else if (ev.decision === 'take') {
        updateStatus(`dp[${ev.i}][${ev.w}] = ${ev.value} — take item (${ev.takeVal} > ${ev.skipVal})`);
      } else {
        updateStatus(`dp[${ev.i}][${ev.w}] = ${ev.value} — skip item (${ev.skipVal} ≥ ${ev.takeVal})`);
      }
      break;

    case 'complete':
      state.selectedItems = new Set(ev.selectedItems);
      state.bagItems = new Set(ev.selectedItems);
      state.currentItem = -1;
      state.currentCap = -1;
      updateStatus(`Done! Value = ${ev.totalValue}, Weight = ${ev.totalWeight}/${state.capacity}`);
      break;
  }

  renderDPTable();
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
    applyEvent(state.trace[state.currentStep]);
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
    applyEvent(state.trace[state.currentStep]);
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
  renderDPTable();
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
  state.dp = [];
  state.decisions = new Map();
  state.currentItem = -1;
  state.currentCap = -1;
  state.bagItems = new Set();
  state.selectedItems = new Set();
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('ks-items').disabled = false;
  document.getElementById('ks-capacity').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter items (weight:value) and capacity, then click Visualize.');
  updateMetrics();
  renderDPTable();
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

function cancelAnim() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

// ── Which items to show in the bag ──

function visibleBag() {
  if (state.phase === 'complete') return state.selectedItems;
  return state.bagItems;
}

function bagCapacity() {
  if (state.phase === 'complete') return state.capacity;
  return state.currentCap > 0 ? state.currentCap : state.capacity;
}

// ── Rendering ──

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  drawItems();
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

function drawItems() {
  const n = state.n;
  const cardH = 44;
  const gap = 8;
  const dividerH = 22;
  const bag = visibleBag();
  const isFinal = state.phase === 'complete';
  const cardW = Math.min(cw * 0.38, 280);
  const startX = 40;

  const availCount = state.currentItem >= 1 ? state.currentItem : 0;
  const showDivider = !isFinal && availCount > 0 && availCount < n;

  const totalH = n * cardH + (n - 1) * gap + (showDivider ? dividerH : 0);
  const startY = (ch - totalH) / 2;

  for (let i = 0; i < n; i++) {
    const item = state.items[i];
    const x = startX;
    const divOffset = (showDivider && i >= availCount) ? dividerH : 0;
    const y = startY + i * (cardH + gap) + divOffset;

    // Draw divider line between available and locked items
    if (showDivider && i === availCount) {
      const divY = startY + i * (cardH + gap) + dividerH / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(200,200,208,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, divY);
      ctx.lineTo(x + cardW, divY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = C.textMuted;
      ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('not yet available', x + cardW, divY - 4);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    let cState = 'default';
    if (bag.has(i)) {
      cState = isFinal ? 'selected' : 'in-bag';
    } else if (state.currentItem === i + 1) {
      cState = 'active';
    } else if (isFinal) {
      cState = 'dimmed';
    } else if (state.currentItem >= 1 && i >= state.currentItem) {
      cState = 'unavailable';
    }

    const ic = ITEM_COLORS[i % ITEM_COLORS.length];

    ctx.save();
    if (cState === 'selected' || cState === 'in-bag') {
      ctx.shadowColor = cState === 'selected' ? C.lineV : ic.border;
      ctx.shadowBlur = 10;
    } else if (cState === 'active') {
      ctx.shadowColor = C.intersection;
      ctx.shadowBlur = 8;
    }

    roundedRect(x, y, cardW, cardH, 6);

    if (cState === 'selected') {
      ctx.fillStyle = 'rgba(102,187,106,0.12)';
      ctx.fill();
      ctx.strokeStyle = C.lineV;
      ctx.lineWidth = 2;
    } else if (cState === 'in-bag') {
      ctx.fillStyle = ic.fill;
      ctx.fill();
      ctx.strokeStyle = ic.border;
      ctx.lineWidth = 2;
    } else if (cState === 'active') {
      ctx.fillStyle = 'rgba(255,202,40,0.10)';
      ctx.fill();
      ctx.strokeStyle = C.intersection;
      ctx.lineWidth = 2;
    } else if (cState === 'unavailable') {
      ctx.fillStyle = 'rgba(255,255,255,0.015)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,208,0.08)';
      ctx.lineWidth = 1;
    } else if (cState === 'dimmed') {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,208,0.12)';
      ctx.lineWidth = 1;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,208,0.2)';
      ctx.lineWidth = 1.2;
    }
    ctx.stroke();
    ctx.restore();

    // Weight bar inside card
    const maxW = Math.max(...state.items.map(it => it.weight));
    const barMaxW = cardW - 110;
    const barW = Math.max(8, (item.weight / maxW) * barMaxW);
    const barX = x + cardW - barW - 10;
    const barY = y + 10;
    const barH = cardH - 20;

    ctx.fillStyle = cState === 'selected' ? 'rgba(102,187,106,0.15)' :
                    cState === 'in-bag' ? ic.fill :
                    cState === 'active' ? 'rgba(255,202,40,0.10)' :
                    'rgba(124,77,255,0.06)';
    roundedRect(barX, barY, barW, barH, 3);
    ctx.fill();

    // Labels
    const textCol = cState === 'selected' ? C.lineV :
                    cState === 'in-bag' ? ic.label :
                    cState === 'active' ? C.intersection :
                    (cState === 'dimmed' || cState === 'unavailable') ? C.textMuted : C.text;
    ctx.fillStyle = textCol;
    ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Item ${i}`, x + 12, y + cardH / 2 - 8);

    ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillStyle = (cState === 'dimmed' || cState === 'unavailable') ? C.textMuted : C.textDim;
    ctx.fillText(`w=${item.weight}  v=${item.value}`, x + 12, y + cardH / 2 + 10);

    // "IN BAG" badge
    if (cState === 'in-bag' || cState === 'selected') {
      const badgeText = 'IN';
      const bw = 26;
      const bh = 16;
      const bx = x + cardW - bw - 8;
      const by = y + (cardH - bh) / 2;
      const bc = cState === 'selected' ? C.lineV : ic.border;
      roundedRect(bx, by, bw, bh, 8);
      ctx.fillStyle = cState === 'selected' ? 'rgba(102,187,106,0.25)' : ic.fill;
      ctx.fill();
      ctx.fillStyle = bc;
      ctx.font = 'bold 9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, bx + bw / 2, by + bh / 2);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawKnapsack() {
  const kx = cw * 0.58;
  const kw = Math.min(cw * 0.28, 200);
  const kh = ch * 0.65;
  const ky = (ch - kh) / 2;
  const cap = bagCapacity();
  const unitH = kh / state.capacity;
  const bag = visibleBag();
  const isFinal = state.phase === 'complete';

  // Container outline
  ctx.save();
  roundedRect(kx, ky, kw, kh, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,200,208,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Shade area above subproblem capacity as unavailable
  if (!isFinal && cap > 0 && cap < state.capacity) {
    const capY = ky + kh - cap * unitH;
    ctx.save();
    roundedRect(kx + 1, ky + 1, kw - 2, capY - ky, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    ctx.restore();

    // Capacity boundary line
    ctx.strokeStyle = C.intersection;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(kx, capY);
    ctx.lineTo(kx + kw, capY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = C.intersection;
    ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`cap=${cap}`, kx + kw + 8, capY + 4);
  }

  // Capacity label above container
  ctx.fillStyle = C.textDim;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`KNAPSACK  (W=${state.capacity})`, kx + kw / 2, ky - 12);

  // Capacity tick marks
  for (let w = 0; w <= state.capacity; w++) {
    const my = ky + kh - w * unitH;
    ctx.strokeStyle = 'rgba(200,200,208,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(kx, my);
    ctx.lineTo(kx + kw, my);
    ctx.stroke();

    if (w > 0 && (state.capacity <= 10 || w % 2 === 0)) {
      ctx.fillStyle = C.textMuted;
      ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(w), kx - 6, my + 3);
    }
  }

  // Stack items in the bag from the bottom
  const sorted = [...bag].sort((a, b) => a - b);
  let fillY = ky + kh;

  for (const idx of sorted) {
    const item = state.items[idx];
    const blockH = item.weight * unitH;
    fillY -= blockH;

    const ic = ITEM_COLORS[idx % ITEM_COLORS.length];
    const useGreen = isFinal;

    ctx.save();
    ctx.shadowColor = useGreen ? C.lineV : ic.border;
    ctx.shadowBlur = 6;
    roundedRect(kx + 4, fillY + 1, kw - 8, blockH - 2, 4);
    ctx.fillStyle = useGreen ? 'rgba(102,187,106,0.18)' : ic.fill;
    ctx.fill();
    ctx.strokeStyle = useGreen ? C.lineV : ic.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Label inside block
    const labelColor = useGreen ? C.lineV : ic.label;
    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (blockH > 20) {
      ctx.font = 'bold 11px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillText(`Item ${idx}`, kx + kw / 2, fillY + blockH / 2 - (blockH > 34 ? 7 : 0));
      if (blockH > 34) {
        ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
        ctx.fillStyle = C.textDim;
        ctx.fillText(`w=${item.weight} v=${item.value}`, kx + kw / 2, fillY + blockH / 2 + 9);
      }
    } else if (blockH > 12) {
      ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillText(`i${idx}`, kx + kw / 2, fillY + blockH / 2);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Summary below knapsack
  if (sorted.length > 0) {
    const totalW = sorted.reduce((s, i) => s + state.items[i].weight, 0);
    const totalV = sorted.reduce((s, i) => s + state.items[i].value, 0);
    const summaryColor = isFinal ? C.lineV : C.text;
    ctx.fillStyle = summaryColor;
    ctx.font = 'bold 11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`wt ${totalW}/${cap}   val ${totalV}`, kx + kw / 2, ky + kh + 22);
    ctx.textAlign = 'left';
  } else if (state.currentCap > 0) {
    ctx.fillStyle = C.textMuted;
    ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('empty', kx + kw / 2, ky + kh / 2);
    ctx.textAlign = 'left';
  }
}

function drawTitle() {
  let label, color;
  if (state.phase === 'complete') {
    const totalV = [...state.selectedItems].reduce((s, i) => s + state.items[i].value, 0);
    label = `Optimal Value: ${totalV}`;
    color = C.lineV;
  } else if (state.currentCap > 0) {
    const bag = state.bagItems;
    const bagW = [...bag].reduce((s, i) => s + state.items[i].weight, 0);
    const bagV = [...bag].reduce((s, i) => s + state.items[i].value, 0);
    label = `dp[${state.currentItem}][${state.currentCap}] = ${state.dp[state.currentItem][state.currentCap]}`;
    if (bag.size > 0) label += `   bag: {${[...bag].sort((a,b)=>a-b).map(i=>`i${i}`).join(',')}}  wt=${bagW}  val=${bagV}`;
    color = C.accent;
  } else if (state.currentItem >= 1) {
    label = `Considering Item ${state.currentItem - 1} (w=${state.items[state.currentItem - 1].weight}, v=${state.items[state.currentItem - 1].value})`;
    color = C.accent;
  } else {
    return;
  }
  ctx.fillStyle = color;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cw / 2, 20);
  ctx.textAlign = 'left';
}

// ── DS Panel: DP Table ──

function renderDPTable() {
  const container = document.getElementById('ks-table-container');
  const countEl = document.getElementById('ks-table-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.n === 0) {
    container.innerHTML = '<div class="ev-empty">Enter items and capacity, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  const n = state.n;
  const W = state.capacity;
  countEl.textContent = `${state.decisions.size} / ${n * W}`;

  let html = '<table class="ot-dp-table"><thead><tr><th></th>';
  for (let w = 0; w <= W; w++) html += `<th>${w}</th>`;
  html += '</tr></thead><tbody>';

  html += '<tr><th>∅</th>';
  for (let w = 0; w <= W; w++) html += '<td class="ot-cell ot-cell-base">0</td>';
  html += '</tr>';

  for (let i = 1; i <= n; i++) {
    html += `<tr><th>i${i - 1}</th>`;
    for (let w = 0; w <= W; w++) {
      if (w === 0) {
        html += '<td class="ot-cell ot-cell-base">0</td>';
        continue;
      }

      const key = `${i},${w}`;
      const dec = state.decisions.get(key);
      const val = dec !== undefined ? state.dp[i][w] : null;

      let cls = 'ot-cell';
      if (state.currentItem === i && state.currentCap === w && state.phase === 'running') {
        cls += ' ot-cell-current';
      } else if (dec === 'take') {
        cls += ' ks-cell-take';
      } else if (dec !== undefined) {
        cls += ' ot-cell-filled';
      } else {
        cls += ' ot-cell-empty';
      }

      if (state.phase === 'complete' && i === n && w === W) cls += ' ot-cell-answer';

      html += `<td class="${cls}">${val !== null ? val : ''}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── DS Panel: Step Inspector ──

function renderStepInspector() {
  const inspEl = document.getElementById('ks-inspector');
  const stepEl = document.getElementById('ks-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Current Row</span><strong>${state.currentItem >= 1 ? `Item ${state.currentItem - 1}` : '–'}</strong></div>`;
  h += `<div class="mp-kv"><span>Capacity</span><strong>${state.currentCap >= 0 ? state.currentCap : '–'}</strong></div>`;

  if (ev && ev.type === 'fill-cell') {
    const it = state.items[ev.i - 1];
    h += `<div class="mp-block"><div class="mp-label">Decision</div>`;
    h += `<div class="mp-kv"><span>Item Weight</span><strong>${it.weight}</strong></div>`;
    h += `<div class="mp-kv"><span>Item Value</span><strong>${it.value}</strong></div>`;

    if (ev.decision === 'too-heavy') {
      h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.sweep}">Too heavy (${it.weight} > ${ev.w})</strong></div>`;
      h += `<div class="mp-kv"><span>dp[${ev.i}][${ev.w}]</span><strong>= dp[${ev.i - 1}][${ev.w}] = ${ev.skipVal}</strong></div>`;
    } else {
      h += `<div class="mp-kv"><span>Skip</span><strong>dp[${ev.i - 1}][${ev.w}] = ${ev.skipVal}</strong></div>`;
      h += `<div class="mp-kv"><span>Take</span><strong>dp[${ev.i - 1}][${ev.w - it.weight}] + ${it.value} = ${ev.takeVal}</strong></div>`;
      const decLabel = ev.decision === 'take'
        ? `<strong style="color:${C.lineV}">Take (${ev.takeVal} > ${ev.skipVal})</strong>`
        : `<strong style="color:${C.textDim}">Skip (${ev.skipVal} ≥ ${ev.takeVal})</strong>`;
      h += `<div class="mp-kv"><span>Result</span>${decLabel}</div>`;
    }
    h += '</div>';
  }

  // Bag contents
  const bag = visibleBag();
  if (bag.size > 0) {
    const totalW = [...bag].reduce((s, i) => s + state.items[i].weight, 0);
    const totalV = [...bag].reduce((s, i) => s + state.items[i].value, 0);
    h += `<div class="mp-block"><div class="mp-label">In Bag</div>`;
    h += `<div class="mp-chip-row">`;
    for (const idx of [...bag].sort((a, b) => a - b)) {
      const it = state.items[idx];
      const ic = ITEM_COLORS[idx % ITEM_COLORS.length];
      const chipStyle = state.phase === 'complete'
        ? `color:#a5d6a7;background:rgba(102,187,106,0.12);border-color:rgba(102,187,106,0.25)`
        : `color:${ic.label};background:${ic.fill};border-color:${ic.border}`;
      h += `<span class="mp-chip" style="${chipStyle}">i${idx} (${it.weight}:${it.value})</span>`;
    }
    h += `</div>`;
    h += `<div class="mp-kv" style="margin-top:6px"><span>Total</span><strong>wt=${totalW}  val=${totalV}</strong></div>`;
    h += '</div>';
  }

  if (state.phase === 'complete') {
    const totalV = [...state.selectedItems].reduce((s, i) => s + state.items[i].value, 0);
    h += `<div class="mp-kv"><span>Optimal Value</span><strong class="qs-answer-value">${totalV}</strong></div>`;
  }

  inspEl.innerHTML = h;
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
  document.getElementById('m-row').textContent = state.currentItem >= 1 ? `${state.currentItem}/${state.n}` : '–';
  const best = state.n > 0 && state.dp.length > 0 && state.currentItem >= 1
    ? state.dp[state.currentItem][state.capacity]
    : null;
  document.getElementById('m-best').textContent = best !== null ? best :
    (state.phase === 'complete' ? state.dp[state.n][state.capacity] : '–');
}
