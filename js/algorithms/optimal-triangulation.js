import { C } from '../theme.js';

export const id = 'optimal-triangulation';
export const title = 'Optimal Polygon Triangulation';
export const categories = ['dynamic-programming'];
export const badge = 'Dynamic Programming';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let animFrameId;

const TRI_FILLS = [
  'rgba(124,77,255,0.10)',
  'rgba(79,195,247,0.10)',
  'rgba(102,187,106,0.10)',
  'rgba(255,202,40,0.10)',
  'rgba(239,83,80,0.10)',
  'rgba(206,147,216,0.10)',
  'rgba(255,138,101,0.10)',
  'rgba(38,166,154,0.10)',
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
    weights: [],
    vertices: [],
    n: 0,
    phase: 'input',

    dp: [],
    split: [],

    trace: [],
    currentStep: -1,

    currentI: -1,
    currentJ: -1,
    currentK: -1,
    currentChainLen: -1,
    currentBestK: -1,
    currentBestVal: Infinity,
    trialTriangle: null,
    filledCells: new Map(),
    optimalDiagonals: [],
    optimalTriangles: [],
    backtracking: false,

    isPlaying: false,
    isStepping: false,
    speed: 5,
    animDelay: 600,

    centerX: 0,
    centerY: 0,
    radius: 0,
  };

  setupDOM();
  setupCanvas();
  bindEvents();
  updateControls();
  updateEmptyState();
  updateStatus('Enter vertex weights and click Visualize, or load an Example.');
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
      <label>Weights</label>
      <input type="text" id="ot-weights" value="" placeholder="e.g. 2, 4, 1, 3, 5" style="width:200px">
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
    <div class="ds-section ot-section-table">
      <div class="ds-header">
        <span>DP Table</span>
        <span class="ds-count" id="ot-table-count"></span>
      </div>
      <div id="ot-table-container" class="ot-scroll">
        <div class="ev-empty">Enter weights and click Visualize</div>
      </div>
    </div>
    <div class="ds-section ot-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="ot-step-count"></span>
      </div>
      <div id="ot-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter vertex weights, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Vertices</span><span class="value" id="m-vertices">0</span></div>
      <div class="info-metric"><span class="label">Chain</span><span class="value" id="m-chain">-</span></div>
      <div class="info-metric"><span class="label">Cells</span><span class="value" id="m-cells">-</span></div>
      <div class="info-metric"><span class="label">Optimal</span><span class="value" id="m-optimal">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Optimal Polygon Triangulation</div>
    <div class="es-sub">Enter vertex weights as comma-separated integers, or click Example</div>
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
  on(document.getElementById('ot-weights'), 'input', onInputChange);
}

function handleResize() {
  setupCanvas();
  if (state.phase !== 'input') computeLayout();
  render();
}

function onInputChange() { updateControls(); }

function parseInput() {
  const str = document.getElementById('ot-weights').value.trim();
  return str.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && isFinite(n) && n > 0 && Number.isInteger(n));
}

function inputValid() {
  const w = parseInput();
  return w.length >= 4 && w.length <= 10;
}

// ── Examples ──

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('ot-weights').value = '2, 4, 1, 3, 5';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 4 + Math.floor(Math.random() * 4);
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(1 + Math.floor(Math.random() * 9));
  document.getElementById('ot-weights').value = arr.join(', ');
  updateControls();
}

// ── Layout ──

function computeLayout() {
  const padding = 80;
  const maxR = Math.min(cw, ch) / 2 - padding;
  state.radius = Math.max(60, maxR);
  state.centerX = cw / 2;
  state.centerY = ch / 2;

  const n = state.n;
  state.vertices = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    state.vertices.push({
      x: state.centerX + state.radius * Math.cos(angle),
      y: state.centerY + state.radius * Math.sin(angle),
    });
  }
}

// ── Trace building ──

function buildTrace(weights) {
  const n = weights.length;
  const dp = Array.from({ length: n }, () => Array(n).fill(0));
  const split = Array.from({ length: n }, () => Array(n).fill(-1));
  const trace = [];

  trace.push({ type: 'init', n, weights: weights.slice() });

  for (let len = 2; len < n; len++) {
    trace.push({ type: 'start-chain', chainLen: len });

    for (let i = 0; i + len < n; i++) {
      const j = i + len;
      trace.push({ type: 'start-cell', i, j, chainLen: len });

      let best = Infinity;
      let bestK = -1;

      for (let k = i + 1; k < j; k++) {
        const triCost = weights[i] * weights[k] * weights[j];
        const total = dp[i][k] + dp[k][j] + triCost;
        const isBest = total < best;

        trace.push({
          type: 'try-k', i, j, k,
          dpIK: dp[i][k], dpKJ: dp[k][j], triCost, total, isBest,
        });

        if (isBest) { best = total; bestK = k; }
      }

      dp[i][j] = best;
      split[i][j] = bestK;
      trace.push({ type: 'fill-cell', i, j, value: best, bestK });
    }
  }

  trace.push({ type: 'start-backtrack', optimalCost: dp[0][n - 1] });

  const triangles = [];
  function backtrack(i, j) {
    if (j - i < 2) return;
    const k = split[i][j];
    triangles.push({ i, k, j });
    backtrack(i, k);
    backtrack(k, j);
  }
  backtrack(0, n - 1);

  const isPolyEdge = (a, b) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return (hi - lo === 1) || (lo === 0 && hi === n - 1);
  };

  for (let t = 0; t < triangles.length; t++) {
    const tri = triangles[t];
    const diags = [];
    for (const [a, b] of [[tri.i, tri.k], [tri.k, tri.j], [tri.i, tri.j]]) {
      if (!isPolyEdge(a, b)) diags.push({ from: Math.min(a, b), to: Math.max(a, b) });
    }
    trace.push({ type: 'add-triangle', i: tri.i, k: tri.k, j: tri.j, diagonals: diags, triangleIndex: t });
  }

  const allDiags = [];
  const diagSet = new Set();
  for (const tri of triangles) {
    for (const [a, b] of [[tri.i, tri.k], [tri.k, tri.j], [tri.i, tri.j]]) {
      if (!isPolyEdge(a, b)) {
        const key = `${Math.min(a, b)},${Math.max(a, b)}`;
        if (!diagSet.has(key)) { diagSet.add(key); allDiags.push({ from: Math.min(a, b), to: Math.max(a, b) }); }
      }
    }
  }

  trace.push({ type: 'complete', optimalCost: dp[0][n - 1], triangles, diagonals: allDiags });
  return { trace, dp, split };
}

// ── Visualization lifecycle ──

function startVisualization() {
  if (!inputValid()) return;
  const weights = parseInput();

  state.weights = weights;
  state.n = weights.length;
  state.phase = 'running';

  const { trace, dp, split } = buildTrace(weights);
  state.trace = trace;
  state.dp = dp;
  state.split = split;
  state.currentStep = -1;

  state.currentI = -1;
  state.currentJ = -1;
  state.currentK = -1;
  state.currentChainLen = -1;
  state.currentBestK = -1;
  state.currentBestVal = Infinity;
  state.trialTriangle = null;
  state.filledCells = new Map();
  state.optimalDiagonals = [];
  state.optimalTriangles = [];
  state.backtracking = false;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('ot-weights').disabled = true;

  computeLayout();
  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through the DP algorithm or press Play.');
  updateMetrics();
  renderDPTable();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      updateStatus(`Initialized DP table for ${ev.n} vertices.`);
      break;

    case 'start-chain':
      state.currentChainLen = ev.chainLen;
      state.currentI = -1;
      state.currentJ = -1;
      state.currentK = -1;
      state.trialTriangle = null;
      updateStatus(`Filling chain length ${ev.chainLen}`);
      break;

    case 'start-cell':
      state.currentI = ev.i;
      state.currentJ = ev.j;
      state.currentK = -1;
      state.currentBestK = -1;
      state.currentBestVal = Infinity;
      state.trialTriangle = null;
      updateStatus(`Computing dp[${ev.i}][${ev.j}]: sub-polygon v${ev.i}…v${ev.j}`);
      break;

    case 'try-k':
      state.currentK = ev.k;
      state.trialTriangle = { i: ev.i, k: ev.k, j: ev.j };
      if (ev.isBest) {
        state.currentBestK = ev.k;
        state.currentBestVal = ev.total;
      }
      updateStatus(`k=${ev.k}: dp[${ev.i}][${ev.k}] + dp[${ev.k}][${ev.j}] + ${ev.triCost} = ${ev.total}${ev.isBest ? ' ★ new best' : ''}`);
      break;

    case 'fill-cell':
      state.filledCells.set(`${ev.i},${ev.j}`, ev.value);
      state.currentK = -1;
      state.trialTriangle = null;
      state.currentBestK = ev.bestK;
      state.currentBestVal = ev.value;
      updateStatus(`dp[${ev.i}][${ev.j}] = ${ev.value} (split at k=${ev.bestK})`);
      break;

    case 'start-backtrack':
      state.currentI = -1;
      state.currentJ = -1;
      state.currentK = -1;
      state.trialTriangle = null;
      state.backtracking = true;
      updateStatus(`DP complete. Optimal cost = ${ev.optimalCost}. Backtracking…`);
      break;

    case 'add-triangle':
      state.optimalTriangles.push({ i: ev.i, k: ev.k, j: ev.j, colorIndex: ev.triangleIndex });
      for (const d of ev.diagonals) {
        const key = `${d.from},${d.to}`;
        if (!state.optimalDiagonals.some(od => `${od.from},${od.to}` === key)) {
          state.optimalDiagonals.push(d);
        }
      }
      state.trialTriangle = { i: ev.i, k: ev.k, j: ev.j };
      updateStatus(`Optimal triangle: v${ev.i}–v${ev.k}–v${ev.j}`);
      break;

    case 'complete':
      state.trialTriangle = null;
      state.backtracking = false;
      updateStatus(`Triangulation complete! Optimal cost = ${ev.optimalCost}`);
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
  state.trialTriangle = null;
  state.backtracking = false;

  updateStatus(`Triangulation complete! Optimal cost = ${state.dp[0][state.n - 1]}`);
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
  state.weights = [];
  state.vertices = [];
  state.n = 0;
  state.dp = [];
  state.split = [];
  state.currentI = -1;
  state.currentJ = -1;
  state.currentK = -1;
  state.currentChainLen = -1;
  state.currentBestK = -1;
  state.currentBestVal = Infinity;
  state.trialTriangle = null;
  state.filledCells = new Map();
  state.optimalDiagonals = [];
  state.optimalTriangles = [];
  state.backtracking = false;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('ot-weights').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter vertex weights and click Visualize, or load an Example.');
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

// ── Rendering ──

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  drawOptimalTriangles();
  drawTrialTriangle();
  drawPolygon();
  drawSubproblemHighlight();
  drawOptimalDiagonals();
  drawVertices();
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

function drawPolygon() {
  const v = state.vertices;
  const n = state.n;
  if (n < 3) return;
  ctx.strokeStyle = 'rgba(200,200,208,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();
  ctx.stroke();
}

function drawVertices() {
  const v = state.vertices;
  const n = state.n;

  for (let i = 0; i < n; i++) {
    const vx = v[i].x, vy = v[i].y;

    let vState = 'default';
    if (state.currentK >= 0 && i === state.currentK) {
      vState = 'split';
    } else if (state.currentI >= 0 && state.currentJ >= 0 && i >= state.currentI && i <= state.currentJ) {
      vState = 'active';
    } else if (state.backtracking && state.trialTriangle &&
               (i === state.trialTriangle.i || i === state.trialTriangle.k || i === state.trialTriangle.j)) {
      vState = 'backtrack';
    }

    const r = vState === 'split' ? 18 : (vState !== 'default' ? 16 : 14);

    ctx.save();
    if (vState === 'split') {
      ctx.shadowColor = C.intersection;
      ctx.shadowBlur = 15;
      ctx.fillStyle = 'rgba(255,202,40,0.2)';
    } else if (vState === 'active') {
      ctx.shadowColor = C.accent;
      ctx.shadowBlur = 10;
      ctx.fillStyle = C.accentDim;
    } else if (vState === 'backtrack') {
      ctx.shadowColor = C.lineV;
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(102,187,106,0.15)';
    } else {
      ctx.fillStyle = 'rgba(200,200,208,0.08)';
    }

    ctx.beginPath();
    ctx.arc(vx, vy, r, 0, Math.PI * 2);
    ctx.fill();

    const border = vState === 'split' ? C.intersection
                 : vState === 'backtrack' ? C.lineV
                 : vState === 'active' ? C.accent
                 : 'rgba(200,200,208,0.4)';
    ctx.strokeStyle = border;
    ctx.lineWidth = vState !== 'default' ? 2 : 1.2;
    ctx.stroke();
    ctx.restore();

    const tc = vState === 'split' ? C.intersection
             : vState === 'backtrack' ? C.lineV
             : vState === 'active' ? C.accentLight
             : C.text;
    ctx.fillStyle = tc;
    ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`v${i}`, vx, vy);

    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    const ld = r + 16;
    const lx = vx + ld * Math.cos(angle);
    const ly = vy + ld * Math.sin(angle);
    ctx.fillStyle = C.textDim;
    ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(`w=${state.weights[i]}`, lx, ly);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawSubproblemHighlight() {
  if (state.currentI < 0 || state.currentJ < 0) return;
  const v = state.vertices;
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(v[state.currentI].x, v[state.currentI].y);
  ctx.lineTo(v[state.currentJ].x, v[state.currentJ].y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTrialTriangle() {
  if (!state.trialTriangle) return;
  const { i, k, j } = state.trialTriangle;
  const v = state.vertices;
  const isBT = state.backtracking;

  ctx.fillStyle = isBT ? 'rgba(102,187,106,0.12)' : 'rgba(255,202,40,0.08)';
  ctx.beginPath();
  ctx.moveTo(v[i].x, v[i].y);
  ctx.lineTo(v[k].x, v[k].y);
  ctx.lineTo(v[j].x, v[j].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = isBT ? C.lineV : C.intersection;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(v[i].x, v[i].y);
  ctx.lineTo(v[k].x, v[k].y);
  ctx.lineTo(v[j].x, v[j].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawOptimalTriangles() {
  const v = state.vertices;
  for (let t = 0; t < state.optimalTriangles.length; t++) {
    const tri = state.optimalTriangles[t];
    ctx.fillStyle = TRI_FILLS[t % TRI_FILLS.length];
    ctx.beginPath();
    ctx.moveTo(v[tri.i].x, v[tri.i].y);
    ctx.lineTo(v[tri.k].x, v[tri.k].y);
    ctx.lineTo(v[tri.j].x, v[tri.j].y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawOptimalDiagonals() {
  const v = state.vertices;
  for (const d of state.optimalDiagonals) {
    ctx.save();
    ctx.strokeStyle = C.lineV;
    ctx.lineWidth = 2;
    ctx.shadowColor = C.lineV;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(v[d.from].x, v[d.from].y);
    ctx.lineTo(v[d.to].x, v[d.to].y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawTitle() {
  let label;
  if (state.phase === 'complete') {
    label = `Optimal Cost: ${state.dp[0][state.n - 1]}`;
    ctx.fillStyle = C.lineV;
  } else if (state.backtracking) {
    label = 'Backtracking optimal triangulation…';
    ctx.fillStyle = C.lineV;
  } else if (state.currentChainLen >= 0) {
    label = `Chain length ${state.currentChainLen}`;
    ctx.fillStyle = C.accent;
  } else {
    return;
  }
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cw / 2, 20);
  ctx.textAlign = 'left';
}

// ── DS Panel: DP Table ──

function renderDPTable() {
  const container = document.getElementById('ot-table-container');
  const countEl = document.getElementById('ot-table-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.n === 0) {
    container.innerHTML = '<div class="ev-empty">Enter weights and click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  const n = state.n;
  countEl.textContent = `${state.filledCells.size} filled`;

  let html = '<table class="ot-dp-table"><thead><tr><th></th>';
  for (let j = 0; j < n; j++) html += `<th>v${j}</th>`;
  html += '</tr></thead><tbody>';

  for (let i = 0; i < n; i++) {
    html += `<tr><th>v${i}</th>`;
    for (let j = 0; j < n; j++) {
      if (j <= i) {
        html += '<td class="ot-cell ot-cell-na">–</td>';
      } else if (j - i === 1) {
        html += '<td class="ot-cell ot-cell-base">0</td>';
      } else {
        const key = `${i},${j}`;
        const val = state.filledCells.get(key);
        let cls = 'ot-cell';
        if (state.currentI === i && state.currentJ === j && state.phase === 'running' && !state.backtracking) {
          cls += ' ot-cell-current';
        } else if (val !== undefined) {
          cls += ' ot-cell-filled';
        } else {
          cls += ' ot-cell-empty';
        }
        if (state.phase === 'complete' && i === 0 && j === n - 1) cls += ' ot-cell-answer';
        html += `<td class="${cls}">${val !== undefined ? val : ''}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── DS Panel: Step Inspector ──

function renderStepInspector() {
  const inspEl = document.getElementById('ot-inspector');
  const stepEl = document.getElementById('ot-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;

  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Chain Length</span><strong>${state.currentChainLen >= 0 ? state.currentChainLen : '–'}</strong></div>`;
  h += `<div class="mp-kv"><span>Subproblem</span><strong>${state.currentI >= 0 ? `dp[${state.currentI}][${state.currentJ}]` : '–'}</strong></div>`;
  h += `<div class="mp-kv"><span>Split k</span><strong>${state.currentK >= 0 ? `v${state.currentK}` : '–'}</strong></div>`;

  if (ev && ev.type === 'try-k') {
    h += `<div class="mp-block"><div class="mp-label">Cost Computation</div>`;
    h += `<div class="mp-kv"><span>dp[${ev.i}][${ev.k}]</span><strong>${ev.dpIK}</strong></div>`;
    h += `<div class="mp-kv"><span>dp[${ev.k}][${ev.j}]</span><strong>${ev.dpKJ}</strong></div>`;
    h += `<div class="mp-kv"><span>w${ev.i}·w${ev.k}·w${ev.j}</span><strong>${state.weights[ev.i]}×${state.weights[ev.k]}×${state.weights[ev.j]} = ${ev.triCost}</strong></div>`;
    h += `<div class="mp-kv"><span>Total</span><strong>${ev.total}</strong></div>`;
    h += `<div class="mp-kv"><span>New Best?</span><strong>${ev.isBest ? 'Yes ★' : 'No'}</strong></div>`;
    h += `</div>`;
  }

  h += `<div class="mp-kv"><span>Current Best</span><strong>${state.currentBestVal < Infinity ? `${state.currentBestVal} (k=${state.currentBestK})` : '–'}</strong></div>`;

  if (state.phase === 'complete' || (ev && ev.type === 'complete')) {
    h += `<div class="mp-kv"><span>Optimal Cost</span><strong class="qs-answer-value">${state.dp[0][state.n - 1]}</strong></div>`;
    h += `<div class="mp-block"><div class="mp-label">Optimal Triangles</div>`;
    h += `<div class="mp-chip-row">`;
    for (const tri of state.optimalTriangles) h += `<span class="mp-chip">v${tri.i}–v${tri.k}–v${tri.j}</span>`;
    h += `</div></div>`;
  }

  if (state.backtracking && state.optimalTriangles.length > 0) {
    h += `<div class="mp-block"><div class="mp-label">Found Triangles</div>`;
    h += `<div class="mp-chip-row">`;
    for (const tri of state.optimalTriangles) h += `<span class="mp-chip" style="color:#a5d6a7;background:rgba(102,187,106,0.12);border-color:rgba(102,187,106,0.25)">v${tri.i}–v${tri.k}–v${tri.j}</span>`;
    h += `</div></div>`;
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
  document.getElementById('m-vertices').textContent = state.n || '0';
  document.getElementById('m-chain').textContent = state.currentChainLen >= 0 ? state.currentChainLen : '–';
  document.getElementById('m-cells').textContent = state.filledCells.size > 0 ? state.filledCells.size : '–';
  document.getElementById('m-optimal').textContent = (state.phase === 'complete' && state.n > 0) ? state.dp[0][state.n - 1] : '–';
}
