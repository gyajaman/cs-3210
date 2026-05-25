import { C } from '../theme.js';

export const id = 'dfs';
export const title = 'Depth-First Search';
export const categories = ['graph'];
export const badge = 'Graph';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;

const NODE_R = 22;

function on(el, event, handler) {
  el.addEventListener(event, handler);
  listeners.push({ el, event, handler });
}

export function init(elements) {
  els = elements;
  listeners = [];
  delayTimer = null;
  delayResolve = null;

  state = {
    edges: [],
    positions: [],
    source: 0,
    n: 0,
    phase: 'input',

    visited: new Set(),
    stack: [],
    treeEdges: new Set(),
    backEdges: new Set(),
    crossEdges: new Set(),
    discovery: [],
    finish: [],
    parent: [],
    timeCounter: 0,

    currentNode: -1,
    currentEdge: null,

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
  updateStatus('Enter edges and source, then click Visualize.');
  updateMetrics();
  renderPanel();
  renderStepInspector();
  render();
}

export function destroy() {
  cancelDelay();
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
      <label>Edges</label>
      <input type="text" id="dfs-edges" value="" placeholder="0-1, 0-2, 1-3, 2-3, 3-4" style="width:260px">
    </div>
    <div class="input-group">
      <label>Source</label>
      <input type="text" id="dfs-source" value="" placeholder="0" style="width:30px">
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
    <div class="ds-section dfs-section-table">
      <div class="ds-header">
        <span>Discovery / Finish Times</span>
        <span class="ds-count" id="dfs-table-count"></span>
      </div>
      <div id="dfs-table-container" class="ot-scroll">
        <div class="ev-empty">Enter edges and source, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section dfs-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="dfs-step-count"></span>
      </div>
      <div id="dfs-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter directed edges, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Nodes</span><span class="value" id="m-nodes">0</span></div>
      <div class="info-metric"><span class="label">Visited</span><span class="value" id="m-visited">–</span></div>
      <div class="info-metric"><span class="label">Stack</span><span class="value" id="m-stack">–</span></div>
      <div class="info-metric"><span class="label">Time</span><span class="value" id="m-time">–</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Depth-First Search</div>
    <div class="es-sub">Enter directed edges as from-to, or click Example</div>
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
  on(document.getElementById('dfs-edges'), 'input', onInputChange);
  on(document.getElementById('dfs-source'), 'input', onInputChange);
}

function handleResize() {
  setupCanvas();
  if (state.n > 0) state.positions = computePositions(state.n);
  render();
}

function onInputChange() { updateControls(); }

function parseInput() {
  const edgesStr = document.getElementById('dfs-edges').value.trim();
  const sourceStr = document.getElementById('dfs-source').value.trim();

  const edges = [];
  let maxNode = -1;

  for (const part of edgesStr.split(/[,;]\s*/)) {
    const m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) continue;
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    if (from === to) continue;
    edges.push({ from, to });
    maxNode = Math.max(maxNode, from, to);
  }

  const source = parseInt(sourceStr, 10);
  const n = maxNode + 1;
  return { edges, source, n };
}

function inputValid() {
  const { edges, source, n } = parseInput();
  return edges.length >= 1 && n >= 2 && n <= 12 &&
         !isNaN(source) && source >= 0 && source < n;
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('dfs-edges').value = '0-1, 0-2, 1-3, 2-3, 3-4, 4-2';
  document.getElementById('dfs-source').value = '0';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 5 + Math.floor(Math.random() * 4);
  const edgeSet = new Set();
  const edgeStrs = [];

  const added = [0];
  const remaining = Array.from({ length: n - 1 }, (_, i) => i + 1);
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  while (remaining.length > 0) {
    const from = added[Math.floor(Math.random() * added.length)];
    const to = remaining.pop();
    added.push(to);
    edgeStrs.push(`${from}-${to}`);
    edgeSet.add(`${from},${to}`);
  }

  const extra = Math.floor(n * 0.6);
  for (let k = 0; k < extra; k++) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    if (a === b || edgeSet.has(`${a},${b}`)) continue;
    edgeSet.add(`${a},${b}`);
    edgeStrs.push(`${a}-${b}`);
  }

  document.getElementById('dfs-edges').value = edgeStrs.join(', ');
  document.getElementById('dfs-source').value = '0';
  updateControls();
}

function computePositions(n) {
  const margin = 55;
  const topOffset = 30;
  const cx = cw / 2;
  const cy = topOffset + (ch - topOffset) / 2;
  const r = Math.min(cw / 2 - margin, (ch - topOffset) / 2 - margin);
  const positions = [];
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i / n);
    positions.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return positions;
}

function buildTrace(edges, source, n) {
  const adj = Array.from({ length: n }, () => []);
  for (const e of edges) adj[e.from].push(e.to);

  const trace = [];
  const visited = new Set();
  const finished = new Set();
  const discovery = Array(n).fill(-1);
  const finish = Array(n).fill(-1);
  const parent = Array(n).fill(-1);
  let time = 0;

  trace.push({ type: 'init', source, n });

  function dfs(u) {
    time++;
    discovery[u] = time;
    visited.add(u);
    trace.push({ type: 'discover', node: u, time, parent: parent[u] });

    for (const v of adj[u]) {
      if (!visited.has(v)) {
        parent[v] = u;
        trace.push({ type: 'explore-edge', from: u, to: v, classification: 'tree' });
        dfs(v);
        trace.push({ type: 'return', from: v, to: u });
      } else if (!finished.has(v)) {
        trace.push({ type: 'explore-edge', from: u, to: v, classification: 'back' });
      } else {
        const cls = discovery[u] < discovery[v] ? 'forward' : 'cross';
        trace.push({ type: 'explore-edge', from: u, to: v, classification: cls });
      }
    }

    time++;
    finish[u] = time;
    finished.add(u);
    trace.push({ type: 'finish', node: u, time });
  }

  dfs(source);

  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) {
      parent[i] = -1;
      dfs(i);
    }
  }

  trace.push({ type: 'complete' });
  return trace;
}

function startVisualization() {
  if (!inputValid()) return;
  const { edges, source, n } = parseInput();

  state.edges = edges;
  state.source = source;
  state.n = n;
  state.phase = 'running';
  state.positions = computePositions(n);

  state.trace = buildTrace(edges, source, n);
  state.currentStep = -1;

  state.visited = new Set();
  state.stack = [];
  state.treeEdges = new Set();
  state.backEdges = new Set();
  state.crossEdges = new Set();
  state.discovery = Array(n).fill(-1);
  state.finish = Array(n).fill(-1);
  state.parent = Array(n).fill(-1);
  state.timeCounter = 0;
  state.currentNode = -1;
  state.currentEdge = null;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('dfs-edges').disabled = true;
  document.getElementById('dfs-source').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through DFS or press Play.');
  updateMetrics();
  renderPanel();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.currentNode = -1;
      state.currentEdge = null;
      updateStatus(`DFS from source ${ev.source}. ${ev.n} nodes.`);
      break;

    case 'discover':
      state.visited.add(ev.node);
      state.stack.push(ev.node);
      state.currentNode = ev.node;
      state.currentEdge = null;
      state.timeCounter = ev.time;
      state.discovery[ev.node] = ev.time;
      state.parent[ev.node] = ev.parent;
      updateStatus(`Discover node ${ev.node} (d=${ev.time}). Push onto stack.`);
      break;

    case 'explore-edge':
      state.currentEdge = { from: ev.from, to: ev.to, classification: ev.classification };
      if (ev.classification === 'tree') {
        state.treeEdges.add(`${ev.from},${ev.to}`);
        updateStatus(`Tree edge ${ev.from}→${ev.to}: node ${ev.to} undiscovered, recurse.`);
      } else if (ev.classification === 'back') {
        state.backEdges.add(`${ev.from},${ev.to}`);
        updateStatus(`Back edge ${ev.from}→${ev.to}: node ${ev.to} still in stack (cycle!).`);
      } else if (ev.classification === 'forward') {
        state.crossEdges.add(`${ev.from},${ev.to}`);
        updateStatus(`Forward edge ${ev.from}→${ev.to}: node ${ev.to} is descendant.`);
      } else {
        state.crossEdges.add(`${ev.from},${ev.to}`);
        updateStatus(`Cross edge ${ev.from}→${ev.to}: node ${ev.to} in different subtree.`);
      }
      break;

    case 'return':
      state.currentNode = ev.to;
      state.currentEdge = null;
      updateStatus(`Return from ${ev.from} to ${ev.to}. Continue exploring ${ev.to}.`);
      break;

    case 'finish':
      state.stack = state.stack.filter(v => v !== ev.node);
      state.timeCounter = ev.time;
      state.finish[ev.node] = ev.time;
      state.currentNode = state.stack.length > 0 ? state.stack[state.stack.length - 1] : -1;
      state.currentEdge = null;
      updateStatus(`Finish node ${ev.node} (f=${ev.time}). Pop from stack.`);
      break;

    case 'complete':
      state.currentNode = -1;
      state.currentEdge = null;
      updateStatus('DFS complete! All nodes discovered and finished.');
      break;
  }

  renderPanel();
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
  state.phase = 'input';
  state.trace = [];
  state.currentStep = -1;
  state.edges = [];
  state.n = 0;
  state.positions = [];
  state.visited = new Set();
  state.stack = [];
  state.treeEdges = new Set();
  state.backEdges = new Set();
  state.crossEdges = new Set();
  state.discovery = [];
  state.finish = [];
  state.parent = [];
  state.timeCounter = 0;
  state.currentNode = -1;
  state.currentEdge = null;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('dfs-edges').disabled = false;
  document.getElementById('dfs-source').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter edges and source, then click Visualize.');
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

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  drawEdges();
  drawNodes();
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

function drawEdges() {
  for (const edge of state.edges) {
    const key = `${edge.from},${edge.to}`;
    const isCurrent = state.currentEdge && state.currentEdge.from === edge.from && state.currentEdge.to === edge.to;
    if (isCurrent) continue;

    if (state.treeEdges.has(key)) {
      drawDirectedEdge(edge, C.lineV, 2, true);
    } else if (state.backEdges.has(key)) {
      drawDirectedEdge(edge, '#ef5350', 1.5, true);
    } else if (state.crossEdges.has(key)) {
      drawDirectedEdge(edge, '#ce93d8', 1.5, false);
    } else {
      drawDirectedEdge(edge, 'rgba(200,200,208,0.18)', 1, false);
    }
  }

  if (state.currentEdge) {
    const edge = state.edges.find(e =>
      e.from === state.currentEdge.from && e.to === state.currentEdge.to);
    if (edge) {
      let color = C.intersection;
      if (state.currentEdge.classification === 'back') color = '#ef5350';
      else if (state.currentEdge.classification === 'forward' || state.currentEdge.classification === 'cross') color = '#ce93d8';
      drawDirectedEdge(edge, color, 2.5, true);
    }
  }
}

function drawDirectedEdge(edge, color, lineWidth, glow) {
  const p1 = state.positions[edge.from];
  const p2 = state.positions[edge.to];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const hasReverse = state.edges.some(e => e.from === edge.to && e.to === edge.from);
  const curveAmt = hasReverse ? 18 : 0;

  const mx = (p1.x + p2.x) / 2 + px * curveAmt;
  const my = (p1.y + p2.y) / 2 + py * curveAmt;

  const sdx = mx - p1.x, sdy = my - p1.y;
  const sLen = Math.sqrt(sdx * sdx + sdy * sdy);
  const sux = sdx / sLen, suy = sdy / sLen;
  const sx = p1.x + sux * NODE_R;
  const sy = p1.y + suy * NODE_R;

  const edx = p2.x - mx, edy = p2.y - my;
  const eLen = Math.sqrt(edx * edx + edy * edy);
  const eux = edx / eLen, euy = edy / eLen;
  const tipX = p2.x - eux * NODE_R;
  const tipY = p2.y - euy * NODE_R;

  ctx.save();
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8; }

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  if (curveAmt > 0) {
    ctx.quadraticCurveTo(mx, my, tipX, tipY);
  } else {
    ctx.lineTo(tipX, tipY);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  const arrowAngle = Math.atan2(euy, eux);
  const aLen = 10;
  const aHalf = Math.PI / 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - aLen * Math.cos(arrowAngle - aHalf), tipY - aLen * Math.sin(arrowAngle - aHalf));
  ctx.lineTo(tipX - aLen * Math.cos(arrowAngle + aHalf), tipY - aLen * Math.sin(arrowAngle + aHalf));
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  if (state.currentEdge && state.currentEdge.from === edge.from && state.currentEdge.to === edge.to) {
    const cls = state.currentEdge.classification;
    if (cls !== 'tree') {
      ctx.fillStyle = color;
      ctx.font = 'bold 9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(cls, mx, my - 10);
      ctx.textAlign = 'left';
    }
  }
}

function drawNodes() {
  const isFinal = state.phase === 'complete';

  for (let i = 0; i < state.n; i++) {
    const pos = state.positions[i];
    const isVisited = state.visited.has(i);
    const isFinished = state.finish[i] >= 0;
    const isCurrent = i === state.currentNode;
    const inStack = state.stack.includes(i);

    let fillColor, strokeColor, glowColor, textColor;

    if (isFinal && isFinished) {
      fillColor = 'rgba(102,187,106,0.15)';
      strokeColor = C.lineV;
      glowColor = C.lineV;
      textColor = C.lineV;
    } else if (isCurrent) {
      fillColor = 'rgba(255,202,40,0.15)';
      strokeColor = C.intersection;
      glowColor = C.intersection;
      textColor = C.intersection;
    } else if (inStack) {
      fillColor = 'rgba(124,77,255,0.12)';
      strokeColor = '#7c4dff';
      glowColor = '#7c4dff';
      textColor = '#b39ddb';
    } else if (isFinished) {
      fillColor = 'rgba(102,187,106,0.1)';
      strokeColor = C.lineV;
      glowColor = null;
      textColor = C.lineV;
    } else if (isVisited) {
      fillColor = 'rgba(124,77,255,0.08)';
      strokeColor = '#7c4dff';
      glowColor = null;
      textColor = '#b39ddb';
    } else {
      fillColor = 'rgba(143,149,173,0.06)';
      strokeColor = 'rgba(200,200,208,0.3)';
      glowColor = null;
      textColor = C.text;
    }

    ctx.save();
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 14;
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isCurrent ? 2.5 : 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = textColor;
    ctx.font = 'bold 13px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i), pos.x, pos.y);

    if (state.discovery[i] >= 0) {
      const dStr = String(state.discovery[i]);
      const fStr = state.finish[i] >= 0 ? String(state.finish[i]) : '?';
      ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillStyle = C.textDim;
      ctx.fillText(`${dStr}/${fStr}`, pos.x, pos.y + NODE_R + 14);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;

  let label, color;
  if (ev.type === 'complete') {
    label = 'DFS Complete';
    color = C.lineV;
  } else if (ev.type === 'discover') {
    label = `Discover node ${ev.node} (time=${ev.time})`;
    color = C.intersection;
  } else if (ev.type === 'finish') {
    label = `Finish node ${ev.node} (time=${ev.time})`;
    color = C.lineV;
  } else if (ev.type === 'explore-edge') {
    label = `Edge ${ev.from}→${ev.to}: ${ev.classification}`;
    color = ev.classification === 'tree' ? C.lineV :
            ev.classification === 'back' ? '#ef5350' : '#ce93d8';
  } else if (ev.type === 'return') {
    label = `Backtrack ${ev.from}→${ev.to}`;
    color = C.accent;
  } else if (ev.type === 'init') {
    label = `DFS from node ${ev.source}`;
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
  const container = document.getElementById('dfs-table-container');
  const countEl = document.getElementById('dfs-table-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.n === 0) {
    container.innerHTML = '<div class="ev-empty">Enter edges and source, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.visited.size}/${state.n}`;

  let html = '<table class="ot-dp-table"><thead><tr>';
  html += '<th>Node</th><th>d</th><th>f</th><th>Parent</th><th>State</th>';
  html += '</tr></thead><tbody>';

  for (let i = 0; i < state.n; i++) {
    const isVisited = state.visited.has(i);
    const isFinished = state.finish[i] >= 0;
    const isCurrent = i === state.currentNode;
    const inStack = state.stack.includes(i);

    let cls = '';
    if (isCurrent) cls = 'dfs-row-active';
    else if (inStack) cls = 'dfs-row-stack';
    else if (isFinished) cls = 'dfs-row-done';

    const dStr = state.discovery[i] >= 0 ? state.discovery[i] : '–';
    const fStr = state.finish[i] >= 0 ? state.finish[i] : '–';
    const pStr = state.parent[i] >= 0 ? state.parent[i] : (i === state.source ? 'src' : '–');

    let stateStr = '';
    if (isCurrent) stateStr = 'active';
    else if (inStack) stateStr = 'in stack';
    else if (isFinished) stateStr = 'done';
    else if (isVisited) stateStr = 'open';
    else stateStr = '';

    html += `<tr class="${cls}"><td>${i}</td><td>${dStr}</td><td>${fStr}</td><td>${pStr}</td><td>${stateStr}</td></tr>`;
  }
  html += '</tbody></table>';

  html += '<div style="margin-top:8px;padding:4px 8px;">';
  html += '<span style="font-size:10px;color:var(--text-dim)">Stack: </span>';
  if (state.stack.length > 0) {
    html += state.stack.map(v => `<span class="mp-chip" style="color:#b39ddb;background:rgba(124,77,255,0.12);border-color:#7c4dff">${v}</span>`).join('');
  } else {
    html += '<span style="font-size:10px;color:var(--text-muted)">empty</span>';
  }
  html += '</div>';

  container.innerHTML = html;
}

function renderStepInspector() {
  const inspEl = document.getElementById('dfs-inspector');
  const stepEl = document.getElementById('dfs-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Visited</span><strong>${state.visited.size}/${state.n}</strong></div>`;
  h += `<div class="mp-kv"><span>Time</span><strong>${state.timeCounter}</strong></div>`;
  h += `<div class="mp-kv"><span>Stack depth</span><strong>${state.stack.length}</strong></div>`;

  if (ev && ev.type === 'explore-edge') {
    h += `<div class="mp-block"><div class="mp-label">Edge Classification</div>`;
    h += `<div class="mp-kv"><span>Edge</span><strong>${ev.from} → ${ev.to}</strong></div>`;
    h += `<div class="mp-kv"><span>Type</span><strong style="color:${
      ev.classification === 'tree' ? C.lineV :
      ev.classification === 'back' ? '#ef5350' : '#ce93d8'
    }">${ev.classification}</strong></div>`;
    if (ev.classification === 'back') {
      h += `<div class="mp-kv"><span>Note</span><strong style="color:#ef5350">Cycle detected!</strong></div>`;
    }
    h += '</div>';
  }

  if (ev && ev.type === 'discover') {
    h += `<div class="mp-block"><div class="mp-label">Discovery</div>`;
    h += `<div class="mp-kv"><span>Node</span><strong>${ev.node}</strong></div>`;
    h += `<div class="mp-kv"><span>Discovery time</span><strong>${ev.time}</strong></div>`;
    h += `<div class="mp-kv"><span>Parent</span><strong>${ev.parent >= 0 ? ev.parent : 'none (root)'}</strong></div>`;
    h += '</div>';
  }

  if (ev && ev.type === 'finish') {
    h += `<div class="mp-block"><div class="mp-label">Finish</div>`;
    h += `<div class="mp-kv"><span>Node</span><strong>${ev.node}</strong></div>`;
    h += `<div class="mp-kv"><span>Finish time</span><strong>${ev.time}</strong></div>`;
    h += '</div>';
  }

  const treeCount = state.treeEdges.size;
  const backCount = state.backEdges.size;
  const crossCount = state.crossEdges.size;
  if (treeCount + backCount + crossCount > 0) {
    h += `<div class="mp-block"><div class="mp-label">Edge Summary</div>`;
    h += `<div class="mp-kv"><span style="color:${C.lineV}">Tree</span><strong>${treeCount}</strong></div>`;
    if (backCount > 0) h += `<div class="mp-kv"><span style="color:#ef5350">Back</span><strong>${backCount}</strong></div>`;
    if (crossCount > 0) h += `<div class="mp-kv"><span style="color:#ce93d8">Cross/Fwd</span><strong>${crossCount}</strong></div>`;
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
  document.getElementById('m-nodes').textContent = state.n || '0';
  document.getElementById('m-visited').textContent = state.visited.size > 0 ? `${state.visited.size}/${state.n}` : '–';
  document.getElementById('m-stack').textContent = state.stack.length > 0 ? state.stack.length : '–';
  document.getElementById('m-time').textContent = state.timeCounter > 0 ? state.timeCounter : '–';
}
