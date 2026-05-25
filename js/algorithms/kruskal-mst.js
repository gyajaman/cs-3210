import { C } from '../theme.js';

export const id = 'kruskal-mst';
export const title = "Kruskal's MST";
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
    sortedEdges: [],
    positions: [],
    n: 0,
    phase: 'input',
    parent: [],
    rank: [],
    selectedEdges: new Set(),
    rejectedEdges: new Set(),
    currentEdgeId: -1,
    totalWeight: 0,
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
  updateStatus('Enter undirected weighted edges, then click Visualize.');
  updateMetrics();
  renderEdgeTable();
  renderStepInspector();
  render();
}

export function destroy() {
  cancelDelay();
  for (const { el, event, handler } of listeners) {
    el.removeEventListener(event, handler);
  }
  listeners = [];
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  state = null;
  els = canvas = ctx = null;
}

function setupDOM() {
  els.toolbarControls.innerHTML = `
    <div class="input-group">
      <label>Edges</label>
      <input type="text" id="km-edges" value="" placeholder="0-1:4, 0-2:3, 1-2:1" style="width:300px">
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
    <div class="ds-section mst-section-table">
      <div class="ds-header">
        <span>Sorted Edges</span>
        <span class="ds-count" id="km-edge-count"></span>
      </div>
      <div id="km-edge-table" class="ot-scroll">
        <div class="ev-empty">Enter edges and click Visualize</div>
      </div>
    </div>
    <div class="ds-section mst-section-inspector">
      <div class="ds-header">
        <span>Union-Find</span>
        <span class="ds-count" id="km-step-count"></span>
      </div>
      <div id="km-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter undirected weighted edges, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Nodes</span><span class="value" id="m-nodes">0</span></div>
      <div class="info-metric"><span class="label">Checked</span><span class="value" id="m-checked">-</span></div>
      <div class="info-metric"><span class="label">MST Edges</span><span class="value" id="m-mstedges">-</span></div>
      <div class="info-metric"><span class="label">Weight</span><span class="value" id="m-weight">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Kruskal's Minimum Spanning Tree</div>
    <div class="es-sub">Enter undirected edges as u-v:weight, or click Example</div>
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
  on(document.getElementById('km-edges'), 'input', updateControls);
}

function handleResize() {
  setupCanvas();
  if (state.n > 0) state.positions = computePositions(state.n);
  render();
}

function parseInput() {
  const edgesStr = document.getElementById('km-edges').value.trim();
  const edges = [];
  let maxNode = -1;
  for (const part of edgesStr.split(/[,;]\s*/)) {
    const m = part.trim().match(/^(\d+)\s*-\s*(\d+)\s*:\s*(\d+)$/);
    if (!m) continue;
    const u = parseInt(m[1], 10);
    const v = parseInt(m[2], 10);
    const w = parseInt(m[3], 10);
    if (u === v || w <= 0) continue;
    edges.push({ id: edges.length, u, v, w });
    maxNode = Math.max(maxNode, u, v);
  }
  return { edges, n: maxNode + 1 };
}

function inputValid() {
  const { edges, n } = parseInput();
  return edges.length >= 1 && n >= 2 && n <= 12;
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('km-edges').value = '0-1:4, 0-2:3, 1-2:1, 1-3:2, 2-3:4, 2-4:5, 3-4:1, 3-5:7, 4-5:6';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 5 + Math.floor(Math.random() * 4);
  const edgeSet = new Set();
  const edgeStrs = [];
  for (let i = 1; i < n; i++) {
    const parent = Math.floor(Math.random() * i);
    const key = `${Math.min(parent, i)},${Math.max(parent, i)}`;
    edgeSet.add(key);
    edgeStrs.push(`${parent}-${i}:${1 + Math.floor(Math.random() * 9)}`);
  }
  for (let k = 0; k < n; k++) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    if (a === b) continue;
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edgeStrs.push(`${a}-${b}:${1 + Math.floor(Math.random() * 9)}`);
  }
  document.getElementById('km-edges').value = edgeStrs.join(', ');
  updateControls();
}

function computePositions(n) {
  const margin = 60;
  const topOffset = 32;
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

function makeDsu(n) {
  return {
    parent: Array.from({ length: n }, (_, i) => i),
    rank: Array(n).fill(0),
  };
}

function find(parent, x) {
  while (parent[x] !== x) x = parent[x];
  return x;
}

function union(parent, rank, a, b) {
  let ra = find(parent, a);
  let rb = find(parent, b);
  if (ra === rb) return false;
  if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
  parent[rb] = ra;
  if (rank[ra] === rank[rb]) rank[ra]++;
  return true;
}

function buildTrace(edges, n) {
  const sorted = [...edges].sort((a, b) => a.w - b.w || a.id - b.id);
  const { parent, rank } = makeDsu(n);
  const selected = new Set();
  const rejected = new Set();
  const trace = [{ type: 'init', sorted: sorted.map(e => e.id), parent: [...parent], rank: [...rank] }];
  let totalWeight = 0;

  for (const edge of sorted) {
    const rootU = find(parent, edge.u);
    const rootV = find(parent, edge.v);
    trace.push({ type: 'consider', edgeId: edge.id, rootU, rootV, parent: [...parent], rank: [...rank] });
    if (union(parent, rank, edge.u, edge.v)) {
      selected.add(edge.id);
      totalWeight += edge.w;
      trace.push({
        type: 'accept',
        edgeId: edge.id,
        selected: [...selected],
        parent: [...parent],
        rank: [...rank],
        totalWeight,
      });
      if (selected.size === n - 1) break;
    } else {
      rejected.add(edge.id);
      trace.push({
        type: 'reject',
        edgeId: edge.id,
        rejected: [...rejected],
        parent: [...parent],
        rank: [...rank],
        totalWeight,
      });
    }
  }

  trace.push({
    type: 'complete',
    connected: selected.size === n - 1,
    selected: [...selected],
    rejected: [...rejected],
    parent: [...parent],
    rank: [...rank],
    totalWeight,
  });
  return { trace, sorted };
}

function startVisualization() {
  if (!inputValid()) return;
  const { edges, n } = parseInput();
  const built = buildTrace(edges, n);

  state.edges = edges;
  state.sortedEdges = built.sorted;
  state.n = n;
  state.positions = computePositions(n);
  state.phase = 'running';
  state.parent = Array.from({ length: n }, (_, i) => i);
  state.rank = Array(n).fill(0);
  state.selectedEdges = new Set();
  state.rejectedEdges = new Set();
  state.currentEdgeId = -1;
  state.totalWeight = 0;
  state.trace = built.trace;
  state.currentStep = -1;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('km-edges').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Edges sorted by weight. Step through union-find decisions or press Play.');
  updateMetrics();
  renderEdgeTable();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.currentEdgeId = -1;
      state.parent = [...ev.parent];
      state.rank = [...ev.rank];
      updateStatus('Start with each node in its own component.');
      break;
    case 'consider': {
      state.currentEdgeId = ev.edgeId;
      state.parent = [...ev.parent];
      state.rank = [...ev.rank];
      const edge = state.edges.find(e => e.id === ev.edgeId);
      updateStatus(`Check ${edge.u}-${edge.v} (w=${edge.w}); roots are ${ev.rootU} and ${ev.rootV}.`);
      break;
    }
    case 'accept': {
      state.selectedEdges = new Set(ev.selected);
      state.parent = [...ev.parent];
      state.rank = [...ev.rank];
      state.currentEdgeId = ev.edgeId;
      state.totalWeight = ev.totalWeight;
      const edge = state.edges.find(e => e.id === ev.edgeId);
      updateStatus(`Accepted ${edge.u}-${edge.v}; components merged.`);
      break;
    }
    case 'reject': {
      state.rejectedEdges = new Set(ev.rejected);
      state.parent = [...ev.parent];
      state.rank = [...ev.rank];
      state.currentEdgeId = ev.edgeId;
      state.totalWeight = ev.totalWeight;
      const edge = state.edges.find(e => e.id === ev.edgeId);
      updateStatus(`Rejected ${edge.u}-${edge.v}; it would form a cycle.`);
      break;
    }
    case 'complete':
      state.selectedEdges = new Set(ev.selected);
      state.rejectedEdges = new Set(ev.rejected);
      state.parent = [...ev.parent];
      state.rank = [...ev.rank];
      state.currentEdgeId = -1;
      state.totalWeight = ev.totalWeight;
      updateStatus(ev.connected
        ? `Complete! MST weight = ${ev.totalWeight}.`
        : `Graph disconnected; produced a minimum spanning forest of weight ${ev.totalWeight}.`);
      break;
  }

  renderEdgeTable();
  renderStepInspector();
  updateMetrics();
  render();
}

async function stepForward() {
  if (state.phase !== 'running' || state.isPlaying || state.isStepping) return;
  if (state.currentStep >= state.trace.length - 1) { finishVisualization(); return; }
  state.isStepping = true;
  updateControls();
  await delay(80);
  state.currentStep++;
  applyEvent(state.trace[state.currentStep]);
  if (state.currentStep >= state.trace.length - 1) finishVisualization();
  state.isStepping = false;
  updateControls();
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
    state.currentStep++;
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
  renderEdgeTable();
  renderStepInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  state.phase = 'input';
  state.edges = [];
  state.sortedEdges = [];
  state.positions = [];
  state.n = 0;
  state.parent = [];
  state.rank = [];
  state.selectedEdges = new Set();
  state.rejectedEdges = new Set();
  state.currentEdgeId = -1;
  state.totalWeight = 0;
  state.trace = [];
  state.currentStep = -1;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('km-edges').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter undirected weighted edges, then click Visualize.');
  updateMetrics();
  renderEdgeTable();
  renderStepInspector();
  render();
}

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

function delay(ms) {
  return new Promise(resolve => {
    delayResolve = resolve;
    delayTimer = setTimeout(() => {
      delayTimer = null;
      delayResolve = null;
      resolve();
    }, ms);
  });
}

function cancelDelay() {
  if (delayTimer) clearTimeout(delayTimer);
  if (delayResolve) delayResolve();
  delayTimer = null;
  delayResolve = null;
}

function render() {
  if (!ctx || !state) return;
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
  for (let x = 50; x < cw; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
  for (let y = 50; y < ch; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
}

function drawEdges() {
  for (const edge of state.edges) {
    if (state.selectedEdges.has(edge.id)) continue;
    drawEdge(edge, edgeColor(edge), edge.id === state.currentEdgeId ? 3 : 1.5);
  }
  for (const edge of state.edges) {
    if (state.selectedEdges.has(edge.id)) drawEdge(edge, C.lineV, 3);
  }
}

function edgeColor(edge) {
  if (state.rejectedEdges.has(edge.id)) return C.sweep;
  if (edge.id === state.currentEdgeId) return C.intersection;
  return 'rgba(200,200,208,0.22)';
}

function drawEdge(edge, color, width) {
  const a = state.positions[edge.u];
  const b = state.positions[edge.v];
  if (!a || !b) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (state.rejectedEdges.has(edge.id)) ctx.setLineDash([5, 5]);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const trim = len > NODE_R * 2 ? NODE_R : 0;
  const sx = a.x + (dx / len) * trim;
  const sy = a.y + (dy / len) * trim;
  const tx = b.x - (dx / len) * trim;
  const ty = b.y - (dy / len) * trim;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);

  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  ctx.fillStyle = 'rgba(13,17,23,0.85)';
  ctx.strokeStyle = 'rgba(200,200,208,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(mx - 11, my - 10, 22, 18, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(edge.w), mx, my);
  ctx.restore();
}

function drawNodes() {
  for (let i = 0; i < state.n; i++) {
    const p = state.positions[i];
    const root = state.parent.length ? find(state.parent, i) : i;
    const finalResult = state.phase === 'complete';
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = finalResult ? 'rgba(102,187,106,0.16)' : 'rgba(124,77,255,0.12)';
    ctx.strokeStyle = finalResult ? C.lineV : C.accentLight;
    ctx.lineWidth = 2;
    if (finalResult) { ctx.shadowColor = C.lineV; ctx.shadowBlur = 8; }
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.text;
    ctx.font = 'bold 13px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i), p.x, finalResult ? p.y : p.y - 4);
    if (!finalResult) {
      ctx.fillStyle = C.textDim;
      ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillText(`r${root}`, p.x, p.y + 10);
    }
    ctx.restore();
  }
}

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;
  let text = 'Kruskal MST';
  let color = C.textDim;
  if (ev.type === 'consider') { text = `Check edge ${ev.edgeId}`; color = C.intersection; }
  if (ev.type === 'accept') { text = `Accept edge ${ev.edgeId}`; color = C.lineV; }
  if (ev.type === 'reject') { text = `Reject cycle edge ${ev.edgeId}`; color = C.sweep; }
  if (ev.type === 'complete') { text = ev.connected ? `MST weight ${ev.totalWeight}` : 'Spanning forest'; color = ev.connected ? C.lineV : C.sweep; }
  ctx.fillStyle = color;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, cw / 2, 24);
}

function renderEdgeTable() {
  const container = document.getElementById('km-edge-table');
  const countEl = document.getElementById('km-edge-count');
  if (!container || !countEl) return;
  if (state.phase === 'input' || state.sortedEdges.length === 0) {
    container.innerHTML = '<div class="ev-empty">Enter edges and click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  const checked = state.selectedEdges.size + state.rejectedEdges.size;
  countEl.textContent = `${checked}/${state.sortedEdges.length}`;
  let h = '<table class="ot-dp-table"><thead><tr><th>#</th><th>Edge</th><th>w</th><th>Action</th></tr></thead><tbody>';
  state.sortedEdges.forEach((edge, idx) => {
    let cls = '';
    let status = '-';
    if (state.selectedEdges.has(edge.id)) { cls = 'mst-row-selected'; status = 'take'; }
    else if (state.rejectedEdges.has(edge.id)) { cls = 'mst-row-rejected'; status = 'cycle'; }
    else if (edge.id === state.currentEdgeId) { cls = 'mst-row-current'; status = 'check'; }
    h += `<tr class="${cls}"><td>${idx + 1}</td><td>${edge.u}-${edge.v}</td><td>${edge.w}</td><td>${status}</td></tr>`;
  });
  h += '</tbody></table>';
  container.innerHTML = h;
}

function renderStepInspector() {
  const el = document.getElementById('km-inspector');
  const countEl = document.getElementById('km-step-count');
  if (!el || !countEl) return;
  if (state.phase === 'input' || state.trace.length === 0) {
    countEl.textContent = '';
    el.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }
  countEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) {
    el.innerHTML = '<div class="ev-empty">Press Step or Play</div>';
    return;
  }

  let h = `<div class="mp-kv"><span>Total Weight</span><strong>${state.totalWeight}</strong></div>`;
  h += `<div class="mp-kv"><span>Components</span><strong>${componentCount()}</strong></div>`;
  h += '<div class="mp-block">';
  if (ev.type === 'init') {
    h += '<div class="mp-label">Initialization</div><div class="ev-empty">Sort all edges by weight; accept an edge only when it connects two components.</div>';
  } else if (ev.type === 'consider') {
    const edge = state.edges.find(e => e.id === ev.edgeId);
    h += `<div class="mp-label">Consider Edge</div><div class="mp-kv"><span>Edge</span><strong>${edge.u}-${edge.v}</strong></div><div class="mp-kv"><span>Roots</span><strong>${ev.rootU} / ${ev.rootV}</strong></div>`;
  } else if (ev.type === 'accept') {
    const edge = state.edges.find(e => e.id === ev.edgeId);
    h += `<div class="mp-label">Accepted</div><div class="mp-kv"><span>Edge</span><strong style="color:${C.lineV}">${edge.u}-${edge.v}</strong></div><div class="mp-kv"><span>Reason</span><strong>Different components</strong></div>`;
  } else if (ev.type === 'reject') {
    const edge = state.edges.find(e => e.id === ev.edgeId);
    h += `<div class="mp-label">Rejected</div><div class="mp-kv"><span>Edge</span><strong style="color:${C.sweep}">${edge.u}-${edge.v}</strong></div><div class="mp-kv"><span>Reason</span><strong>Same component</strong></div>`;
  } else if (ev.type === 'complete') {
    h += '<div class="mp-label">Result</div>';
    h += `<div class="mp-kv"><span>Status</span><strong style="color:${ev.connected ? C.lineV : C.sweep}">${ev.connected ? 'MST complete' : 'Disconnected graph'}</strong></div>`;
    h += `<div class="mp-kv"><span>Weight</span><strong>${ev.totalWeight}</strong></div>`;
    h += `<div class="mp-kv"><span>Edges</span><strong>${state.selectedEdges.size}/${Math.max(0, state.n - 1)}</strong></div>`;
  }
  h += '</div>';
  if (ev.type !== 'complete') {
    h += '<div class="mp-block"><div class="mp-label">Parents</div><div class="mp-chip-row">';
    for (let i = 0; i < state.parent.length; i++) {
      h += `<span class="mp-chip">${i}->${state.parent[i]}</span>`;
    }
    h += '</div></div>';
  }
  el.innerHTML = h;
}

function componentCount() {
  if (!state.parent.length) return '-';
  const roots = new Set();
  for (let i = 0; i < state.parent.length; i++) roots.add(find(state.parent, i));
  return roots.size;
}

function updateControls() {
  const run = document.getElementById('btn-run');
  const step = document.getElementById('btn-step');
  const play = document.getElementById('btn-play');
  const reset = document.getElementById('btn-reset');
  const isInput = state.phase === 'input';
  const running = state.phase === 'running';
  run.disabled = !isInput || !inputValid();
  step.disabled = !running || state.isPlaying || state.isStepping || state.trace.length === 0;
  play.disabled = !running || state.isStepping || state.trace.length === 0;
  play.textContent = state.isPlaying ? 'Pause' : 'Play';
  reset.disabled = isInput;
  document.getElementById('btn-example').disabled = !isInput;
  document.getElementById('btn-random').disabled = !isInput;
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
  const nodesEl = document.getElementById('m-nodes');
  if (!nodesEl) return;
  nodesEl.textContent = state.n || '0';
  const checked = state.selectedEdges.size + state.rejectedEdges.size;
  document.getElementById('m-checked').textContent = state.phase === 'input' ? '-' : `${checked}/${state.sortedEdges.length}`;
  document.getElementById('m-mstedges').textContent = state.phase === 'input' ? '-' : `${state.selectedEdges.size}/${Math.max(0, state.n - 1)}`;
  document.getElementById('m-weight').textContent = state.phase === 'input' ? '-' : state.totalWeight;
}
