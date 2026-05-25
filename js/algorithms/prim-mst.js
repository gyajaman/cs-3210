import { C } from '../theme.js';

export const id = 'prim-mst';
export const title = "Prim's MST";
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
    selectedEdges: new Set(),
    rejectedEdges: new Set(),
    candidateEdges: new Set(),
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
  updateStatus('Enter undirected weighted edges and a start node.');
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
      <input type="text" id="pm-edges" value="" placeholder="0-1:4, 0-2:3, 1-2:1" style="width:260px">
    </div>
    <div class="input-group">
      <label>Start</label>
      <input type="text" id="pm-source" value="" placeholder="0" style="width:34px">
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
        <span>Cut Edges</span>
        <span class="ds-count" id="pm-edge-count"></span>
      </div>
      <div id="pm-edge-table" class="ot-scroll">
        <div class="ev-empty">Enter edges and click Visualize</div>
      </div>
    </div>
    <div class="ds-section mst-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="pm-step-count"></span>
      </div>
      <div id="pm-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter undirected weighted edges and a start node
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Nodes</span><span class="value" id="m-nodes">0</span></div>
      <div class="info-metric"><span class="label">Visited</span><span class="value" id="m-visited">-</span></div>
      <div class="info-metric"><span class="label">MST Edges</span><span class="value" id="m-mstedges">-</span></div>
      <div class="info-metric"><span class="label">Weight</span><span class="value" id="m-weight">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Prim's Minimum Spanning Tree</div>
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
  on(document.getElementById('pm-edges'), 'input', updateControls);
  on(document.getElementById('pm-source'), 'input', updateControls);
}

function handleResize() {
  setupCanvas();
  if (state.n > 0) state.positions = computePositions(state.n);
  render();
}

function parseInput() {
  const edgesStr = document.getElementById('pm-edges').value.trim();
  const source = parseInt(document.getElementById('pm-source').value.trim(), 10);
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

  return { edges, source, n: maxNode + 1 };
}

function inputValid() {
  const { edges, source, n } = parseInput();
  return edges.length >= 1 && n >= 2 && n <= 12 && !isNaN(source) && source >= 0 && source < n;
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('pm-edges').value = '0-1:4, 0-2:3, 1-2:1, 1-3:2, 2-3:4, 2-4:5, 3-4:1, 3-5:7, 4-5:6';
  document.getElementById('pm-source').value = '0';
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

  const extra = n;
  for (let k = 0; k < extra; k++) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    if (a === b) continue;
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edgeStrs.push(`${a}-${b}:${1 + Math.floor(Math.random() * 9)}`);
  }

  document.getElementById('pm-edges').value = edgeStrs.join(', ');
  document.getElementById('pm-source').value = '0';
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

function edgeCrossesVisited(edge, visited) {
  return visited.has(edge.u) !== visited.has(edge.v);
}

function buildTrace(edges, source, n) {
  const visited = new Set([source]);
  const selected = new Set();
  const rejected = new Set();
  const trace = [{ type: 'init', source }];
  let totalWeight = 0;

  while (visited.size < n) {
    const candidates = edges
      .filter(e => !selected.has(e.id) && !rejected.has(e.id) && edgeCrossesVisited(e, visited))
      .sort((a, b) => a.w - b.w || a.id - b.id);

    trace.push({
      type: 'scan',
      candidates: candidates.map(e => e.id),
      visited: [...visited],
    });

    if (candidates.length === 0) {
      trace.push({ type: 'disconnected', visited: [...visited] });
      break;
    }

    const edge = candidates[0];
    selected.add(edge.id);
    const nextNode = visited.has(edge.u) ? edge.v : edge.u;
    visited.add(nextNode);
    totalWeight += edge.w;
    trace.push({
      type: 'select',
      edgeId: edge.id,
      nextNode,
      selected: [...selected],
      visited: [...visited],
      totalWeight,
    });

    for (const e of edges) {
      if (!selected.has(e.id) && visited.has(e.u) && visited.has(e.v)) {
        rejected.add(e.id);
      }
    }
  }

  trace.push({
    type: 'complete',
    connected: visited.size === n,
    selected: [...selected],
    visited: [...visited],
    totalWeight,
  });

  return trace;
}

function startVisualization() {
  if (!inputValid()) return;
  const { edges, source, n } = parseInput();

  state.edges = edges;
  state.source = source;
  state.n = n;
  state.positions = computePositions(n);
  state.phase = 'running';
  state.visited = new Set();
  state.selectedEdges = new Set();
  state.rejectedEdges = new Set();
  state.candidateEdges = new Set();
  state.currentEdgeId = -1;
  state.totalWeight = 0;
  state.trace = buildTrace(edges, source, n);
  state.currentStep = -1;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('pm-edges').disabled = true;
  document.getElementById('pm-source').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through Prim\'s cut choices or press Play.');
  updateMetrics();
  renderEdgeTable();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.visited = new Set([ev.source]);
      state.currentEdgeId = -1;
      updateStatus(`Start at node ${ev.source}. The MST grows from this visited set.`);
      break;
    case 'scan':
      state.candidateEdges = new Set(ev.candidates);
      state.currentEdgeId = ev.candidates[0] ?? -1;
      updateStatus(ev.candidates.length
        ? `Cut has ${ev.candidates.length} candidate edge(s). Choose the lightest.`
        : 'No cut edges remain.');
      break;
    case 'select': {
      state.selectedEdges = new Set(ev.selected);
      state.visited = new Set(ev.visited);
      state.candidateEdges = new Set();
      state.currentEdgeId = ev.edgeId;
      state.totalWeight = ev.totalWeight;
      recomputeRejectedEdges();
      const edge = state.edges.find(e => e.id === ev.edgeId);
      updateStatus(`Selected ${edge.u}-${edge.v} (w=${edge.w}); node ${ev.nextNode} joins the tree.`);
      break;
    }
    case 'disconnected':
      state.currentEdgeId = -1;
      state.candidateEdges = new Set();
      updateStatus('Graph is disconnected from the current tree; Prim cannot finish an MST.');
      break;
    case 'complete':
      state.selectedEdges = new Set(ev.selected);
      state.visited = new Set(ev.visited);
      state.candidateEdges = new Set();
      state.currentEdgeId = -1;
      state.totalWeight = ev.totalWeight;
      recomputeRejectedEdges();
      updateStatus(ev.connected
        ? `Complete! MST weight = ${ev.totalWeight}.`
        : `Stopped with a spanning forest weight = ${ev.totalWeight}.`);
      break;
  }

  renderEdgeTable();
  renderStepInspector();
  updateMetrics();
  render();
}

function recomputeRejectedEdges() {
  state.rejectedEdges = new Set();
  for (const edge of state.edges) {
    if (!state.selectedEdges.has(edge.id) && state.visited.has(edge.u) && state.visited.has(edge.v)) {
      state.rejectedEdges.add(edge.id);
    }
  }
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
  state.positions = [];
  state.n = 0;
  state.visited = new Set();
  state.selectedEdges = new Set();
  state.rejectedEdges = new Set();
  state.candidateEdges = new Set();
  state.currentEdgeId = -1;
  state.totalWeight = 0;
  state.trace = [];
  state.currentStep = -1;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('pm-edges').disabled = false;
  document.getElementById('pm-source').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter undirected weighted edges and a start node.');
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
  if (state.rejectedEdges.has(edge.id)) return 'rgba(200,200,208,0.14)';
  if (state.candidateEdges.has(edge.id)) return edge.id === state.currentEdgeId ? C.intersection : C.accentLight;
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
  ctx.font = `bold 10px ${C.mono || 'JetBrains Mono, Fira Code, Consolas, monospace'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(edge.w), mx, my);
  ctx.restore();
}

function drawNodes() {
  for (let i = 0; i < state.n; i++) {
    const p = state.positions[i];
    const isVisited = state.visited.has(i);
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = isVisited ? 'rgba(102,187,106,0.16)' : 'rgba(200,200,208,0.06)';
    ctx.strokeStyle = isVisited ? C.lineV : 'rgba(200,200,208,0.25)';
    ctx.lineWidth = 2;
    if (isVisited) { ctx.shadowColor = C.lineV; ctx.shadowBlur = 8; }
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = isVisited ? C.lineV : C.text;
    ctx.font = `bold 13px ${C.mono || 'JetBrains Mono, Fira Code, Consolas, monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i), p.x, p.y);
    ctx.restore();
  }
}

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;
  let text = 'Prim MST';
  let color = C.textDim;
  if (ev.type === 'scan') { text = `Scan cut: ${ev.candidates.length} candidate edge(s)`; color = C.intersection; }
  if (ev.type === 'select') { text = `Select edge ${ev.edgeId}`; color = C.lineV; }
  if (ev.type === 'complete') { text = ev.connected ? `MST weight ${ev.totalWeight}` : 'Spanning forest'; color = ev.connected ? C.lineV : C.sweep; }
  ctx.fillStyle = color;
  ctx.font = `bold 12px ${C.mono || 'JetBrains Mono, Fira Code, Consolas, monospace'}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, cw / 2, 24);
}

function renderEdgeTable() {
  const container = document.getElementById('pm-edge-table');
  const countEl = document.getElementById('pm-edge-count');
  if (!container || !countEl) return;
  if (state.phase === 'input' || state.edges.length === 0) {
    container.innerHTML = '<div class="ev-empty">Enter edges and click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.selectedEdges.size}/${Math.max(0, state.n - 1)}`;
  let h = '<table class="ot-dp-table"><thead><tr><th>Edge</th><th>w</th><th>State</th></tr></thead><tbody>';
  for (const edge of state.edges) {
    let cls = '';
    let status = '-';
    if (state.selectedEdges.has(edge.id)) { cls = 'mst-row-selected'; status = 'MST'; }
    else if (state.rejectedEdges.has(edge.id)) { cls = 'mst-row-rejected'; status = 'closed'; }
    else if (state.candidateEdges.has(edge.id)) { cls = edge.id === state.currentEdgeId ? 'mst-row-current' : 'mst-row-candidate'; status = 'cut'; }
    h += `<tr class="${cls}"><td>${edge.u}-${edge.v}</td><td>${edge.w}</td><td>${status}</td></tr>`;
  }
  h += '</tbody></table>';
  container.innerHTML = h;
}

function renderStepInspector() {
  const el = document.getElementById('pm-inspector');
  const countEl = document.getElementById('pm-step-count');
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

  let h = `<div class="mp-kv"><span>Visited</span><strong>${[...state.visited].join(', ') || '-'}</strong></div>`;
  h += `<div class="mp-kv"><span>Total Weight</span><strong>${state.totalWeight}</strong></div>`;
  h += '<div class="mp-block">';
  if (ev.type === 'init') {
    h += '<div class="mp-label">Initialization</div><div class="ev-empty">Start with one node; repeatedly take the cheapest edge crossing the cut.</div>';
  } else if (ev.type === 'scan') {
    h += `<div class="mp-label">Cut Scan</div><div class="mp-kv"><span>Candidates</span><strong>${ev.candidates.length}</strong></div>`;
  } else if (ev.type === 'select') {
    const edge = state.edges.find(e => e.id === ev.edgeId);
    h += `<div class="mp-label">Selected Edge</div><div class="mp-kv"><span>Edge</span><strong style="color:${C.lineV}">${edge.u}-${edge.v}</strong></div><div class="mp-kv"><span>Weight</span><strong>${edge.w}</strong></div><div class="mp-kv"><span>New Node</span><strong>${ev.nextNode}</strong></div>`;
  } else if (ev.type === 'disconnected') {
    h += `<div class="mp-label">Disconnected</div><div class="ev-unit">No edge crosses from visited to unvisited nodes.</div>`;
  } else if (ev.type === 'complete') {
    h += '<div class="mp-label">Result</div>';
    h += `<div class="mp-kv"><span>Status</span><strong style="color:${ev.connected ? C.lineV : C.sweep}">${ev.connected ? 'MST complete' : 'Disconnected graph'}</strong></div>`;
    h += `<div class="mp-kv"><span>Weight</span><strong>${ev.totalWeight}</strong></div>`;
    h += `<div class="mp-kv"><span>Edges</span><strong>${state.selectedEdges.size}/${Math.max(0, state.n - 1)}</strong></div>`;
  }
  h += '</div>';
  el.innerHTML = h;
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
  document.getElementById('m-visited').textContent = state.phase === 'input' ? '-' : `${state.visited.size}/${state.n}`;
  document.getElementById('m-mstedges').textContent = state.phase === 'input' ? '-' : `${state.selectedEdges.size}/${Math.max(0, state.n - 1)}`;
  document.getElementById('m-weight').textContent = state.phase === 'input' ? '-' : state.totalWeight;
}
