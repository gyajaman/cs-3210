export const id = 'dijkstra';
export const title = "Dijkstra's Algorithm";
export const categories = ['graph'];
export const badge = 'Graph';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let animFrameId;

const C = {
  accent:       '#7c4dff',
  accentLight:  '#a48fff',
  accentDim:    'rgba(124,77,255,0.15)',
  lineV:        '#66bb6a',
  sweep:        '#ef5350',
  intersection: '#ffca28',
  text:         '#c8c8d0',
  textDim:      '#666680',
  textMuted:    '#44445a',
  bgCanvas:     '#0d1117',
};

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
  animFrameId = null;

  state = {
    edges: [],
    adjList: [],
    positions: [],
    source: 0,
    n: 0,
    phase: 'input',

    dist: [],
    prev: [],
    visited: new Set(),
    pq: [],
    treeEdges: new Set(),

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
  renderDistTable();
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
      <label>Edges</label>
      <input type="text" id="dj-edges" value="" placeholder="0-1:4, 0-2:1, 2-1:2" style="width:260px">
    </div>
    <div class="input-group">
      <label>Source</label>
      <input type="text" id="dj-source" value="" placeholder="0" style="width:30px">
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
    <div class="ds-section dj-section-table">
      <div class="ds-header">
        <span>Distances & PQ</span>
        <span class="ds-count" id="dj-table-count"></span>
      </div>
      <div id="dj-table-container" class="ot-scroll">
        <div class="ev-empty">Enter edges and source, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section dj-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="dj-step-count"></span>
      </div>
      <div id="dj-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter edges and source, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Nodes</span><span class="value" id="m-nodes">0</span></div>
      <div class="info-metric"><span class="label">Visited</span><span class="value" id="m-visited">–</span></div>
      <div class="info-metric"><span class="label">PQ Size</span><span class="value" id="m-pq">–</span></div>
      <div class="info-metric"><span class="label">Current</span><span class="value" id="m-current">–</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Dijkstra's Algorithm</div>
    <div class="es-sub">Enter directed edges as from-to:weight, or click Example</div>
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
  on(document.getElementById('dj-edges'), 'input', onInputChange);
  on(document.getElementById('dj-source'), 'input', onInputChange);
}

function handleResize() {
  setupCanvas();
  if (state.n > 0) state.positions = computePositions(state.n);
  render();
}

function onInputChange() { updateControls(); }

// ── Input ──

function parseInput() {
  const edgesStr = document.getElementById('dj-edges').value.trim();
  const sourceStr = document.getElementById('dj-source').value.trim();

  const edges = [];
  let maxNode = -1;

  for (const part of edgesStr.split(/[,;]\s*/)) {
    const m = part.trim().match(/^(\d+)\s*-\s*(\d+)\s*:\s*(\d+)$/);
    if (!m) continue;
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    const weight = parseInt(m[3], 10);
    if (from === to || weight <= 0) continue;
    edges.push({ from, to, weight });
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

// ── Examples ──

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('dj-edges').value = '0-1:4, 0-2:1, 2-1:2, 1-3:1, 2-3:5, 3-4:3, 4-5:2';
  document.getElementById('dj-source').value = '0';
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
    const w = 1 + Math.floor(Math.random() * 9);
    edgeStrs.push(`${from}-${to}:${w}`);
    edgeSet.add(`${from},${to}`);
  }

  const extra = Math.floor(n * 0.7);
  for (let k = 0; k < extra; k++) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    if (a === b || edgeSet.has(`${a},${b}`)) continue;
    edgeSet.add(`${a},${b}`);
    edgeStrs.push(`${a}-${b}:${1 + Math.floor(Math.random() * 9)}`);
  }

  document.getElementById('dj-edges').value = edgeStrs.join(', ');
  document.getElementById('dj-source').value = '0';
  updateControls();
}

// ── Layout ──

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

// ── Trace ──

function buildTrace(edges, source, n) {
  const adj = Array.from({ length: n }, () => []);
  for (const e of edges) adj[e.from].push({ to: e.to, weight: e.weight });

  const dist = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  const visited = new Set();
  const trace = [];

  dist[source] = 0;
  trace.push({ type: 'init', source, n });

  const pq = [{ node: source, dist: 0 }];

  while (pq.length > 0) {
    pq.sort((a, b) => a.dist - b.dist);
    const { node: u } = pq.shift();
    if (visited.has(u)) continue;

    trace.push({ type: 'visit', node: u, dist: dist[u] });
    visited.add(u);

    for (const { to: v, weight: w } of adj[u]) {
      const newDist = dist[u] + w;
      if (visited.has(v)) {
        trace.push({
          type: 'relax', from: u, to: v, weight: w,
          oldDist: dist[v], newDist, improved: false, reason: 'visited',
        });
      } else if (newDist < dist[v]) {
        const oldDist = dist[v];
        dist[v] = newDist;
        prev[v] = u;
        pq.push({ node: v, dist: newDist });
        trace.push({
          type: 'relax', from: u, to: v, weight: w,
          oldDist, newDist, improved: true,
        });
      } else {
        trace.push({
          type: 'relax', from: u, to: v, weight: w,
          oldDist: dist[v], newDist, improved: false, reason: 'no-improvement',
        });
      }
    }
  }

  trace.push({ type: 'complete', distances: [...dist], predecessors: [...prev] });
  return { trace, dist, prev, adj };
}

// ── Visualization lifecycle ──

function startVisualization() {
  if (!inputValid()) return;
  const { edges, source, n } = parseInput();

  state.edges = edges;
  state.source = source;
  state.n = n;
  state.phase = 'running';
  state.positions = computePositions(n);

  const { trace } = buildTrace(edges, source, n);
  state.trace = trace;
  state.currentStep = -1;

  state.dist = Array(n).fill(Infinity);
  state.prev = Array(n).fill(-1);
  state.visited = new Set();
  state.pq = [];
  state.treeEdges = new Set();
  state.currentNode = -1;
  state.currentEdge = null;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('dj-edges').disabled = true;
  document.getElementById('dj-source').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through or press Play.');
  updateMetrics();
  renderDistTable();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.dist[ev.source] = 0;
      state.pq = [{ node: ev.source, dist: 0 }];
      state.currentNode = -1;
      state.currentEdge = null;
      updateStatus(`Source = ${ev.source}. Distance set to 0. All others ∞.`);
      break;

    case 'visit':
      state.visited.add(ev.node);
      state.currentNode = ev.node;
      state.currentEdge = null;
      state.pq = state.pq.filter(e => e.node !== ev.node);
      updateStatus(`Visit node ${ev.node} (d = ${ev.dist}). Examining outgoing edges…`);
      break;

    case 'relax': {
      state.currentEdge = { from: ev.from, to: ev.to };
      if (ev.improved) {
        state.dist[ev.to] = ev.newDist;
        state.prev[ev.to] = ev.from;
        state.pq = state.pq.filter(e => e.node !== ev.to);
        state.pq.push({ node: ev.to, dist: ev.newDist });
        state.pq.sort((a, b) => a.dist - b.dist);
        state.treeEdges = new Set([...state.treeEdges].filter(e => {
          const [, t] = e.split(',');
          return parseInt(t) !== ev.to;
        }));
        state.treeEdges.add(`${ev.from},${ev.to}`);
        const oldStr = ev.oldDist === Infinity ? '∞' : ev.oldDist;
        updateStatus(`Relax ${ev.from}→${ev.to}: d[${ev.to}] = ${oldStr} → ${ev.newDist} (improved)`);
      } else if (ev.reason === 'visited') {
        updateStatus(`Edge ${ev.from}→${ev.to}: node ${ev.to} already finalized, skip`);
      } else {
        updateStatus(`Relax ${ev.from}→${ev.to}: d[${ev.to}] = ${ev.oldDist} ≤ ${ev.newDist} (no change)`);
      }
      break;
    }

    case 'complete':
      state.currentNode = -1;
      state.currentEdge = null;
      updateStatus('Done! All reachable nodes have shortest distances.');
      break;
  }

  renderDistTable();
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
  renderDistTable();
  renderStepInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  cancelAnim();
  state.phase = 'input';
  state.trace = [];
  state.currentStep = -1;
  state.edges = [];
  state.n = 0;
  state.positions = [];
  state.dist = [];
  state.prev = [];
  state.visited = new Set();
  state.pq = [];
  state.treeEdges = new Set();
  state.currentNode = -1;
  state.currentEdge = null;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('dj-edges').disabled = false;
  document.getElementById('dj-source').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter edges and source, then click Visualize.');
  updateMetrics();
  renderDistTable();
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

// ── Edge drawing ──

function drawEdges() {
  const isCurEdge = (e) => state.currentEdge &&
    state.currentEdge.from === e.from && state.currentEdge.to === e.to;

  for (const edge of state.edges) {
    if (isCurEdge(edge) || state.treeEdges.has(`${edge.from},${edge.to}`)) continue;
    drawDirectedEdge(edge, 'rgba(200,200,208,0.18)', 1, false);
  }
  for (const edge of state.edges) {
    if (isCurEdge(edge)) continue;
    if (state.treeEdges.has(`${edge.from},${edge.to}`)) {
      drawDirectedEdge(edge, C.lineV, 2, true);
    }
  }
  if (state.currentEdge) {
    const edge = state.edges.find(e =>
      e.from === state.currentEdge.from && e.to === state.currentEdge.to);
    if (edge) drawDirectedEdge(edge, C.intersection, 2.5, true);
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
  const aLen = 9;
  const aHalf = Math.PI / 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - aLen * Math.cos(arrowAngle - aHalf), tipY - aLen * Math.sin(arrowAngle - aHalf));
  ctx.lineTo(tipX - aLen * Math.cos(arrowAngle + aHalf), tipY - aLen * Math.sin(arrowAngle + aHalf));
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  const labelX = 0.25 * p1.x + 0.5 * mx + 0.25 * p2.x;
  const labelY = 0.25 * p1.y + 0.5 * my + 0.25 * p2.y;
  const lOff = curveAmt > 0 ? 3 : 12;
  const lx = labelX + px * lOff;
  const ly = labelY + py * lOff;

  ctx.fillStyle = glow ? color : C.textDim;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(edge.weight), lx, ly);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── Node drawing ──

function drawNodes() {
  for (let i = 0; i < state.n; i++) {
    const pos = state.positions[i];
    const isCurrent = i === state.currentNode;
    const isVisited = state.visited.has(i);
    const isQueued = state.pq.some(e => e.node === i);
    const isSource = i === state.source;

    if (isSource && !isCurrent) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, NODE_R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(124,77,255,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.save();
    if (isCurrent) {
      ctx.shadowColor = C.intersection;
      ctx.shadowBlur = 14;
    } else if (isVisited) {
      ctx.shadowColor = C.lineV;
      ctx.shadowBlur = 6;
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, NODE_R, 0, Math.PI * 2);

    if (isCurrent) {
      ctx.fillStyle = 'rgba(255,202,40,0.20)';
      ctx.strokeStyle = C.intersection;
      ctx.lineWidth = 2.5;
    } else if (isVisited) {
      ctx.fillStyle = 'rgba(102,187,106,0.15)';
      ctx.strokeStyle = C.lineV;
      ctx.lineWidth = 2;
    } else if (isQueued) {
      ctx.fillStyle = 'rgba(124,77,255,0.15)';
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
    } else {
      ctx.fillStyle = 'rgba(200,200,208,0.06)';
      ctx.strokeStyle = 'rgba(200,200,208,0.25)';
      ctx.lineWidth = 1.5;
    }

    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = isCurrent ? C.intersection :
                    isVisited ? C.lineV :
                    isQueued ? C.accentLight : C.text;
    ctx.font = 'bold 14px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i), pos.x, pos.y);

    const d = state.dist[i];
    const distText = d === undefined ? '' : (d === Infinity ? '∞' : String(d));
    if (distText) {
      ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillStyle = d === Infinity ? C.textMuted :
                      isCurrent ? C.intersection :
                      isVisited ? C.lineV :
                      isQueued ? C.accentLight : C.textDim;
      ctx.fillText(`d=${distText}`, pos.x, pos.y + NODE_R + 14);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

// ── Title ──

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;

  let label, color;
  if (ev.type === 'complete') {
    label = 'Shortest paths found';
    color = C.lineV;
  } else if (ev.type === 'visit') {
    label = `Visiting node ${ev.node}  (d = ${ev.dist})`;
    color = C.intersection;
  } else if (ev.type === 'relax') {
    if (ev.improved) {
      const oldStr = ev.oldDist === Infinity ? '∞' : ev.oldDist;
      label = `Relax ${ev.from}→${ev.to}:  d[${ev.to}] = ${oldStr} → ${ev.newDist}  ✓`;
      color = C.lineV;
    } else if (ev.reason === 'visited') {
      label = `Edge ${ev.from}→${ev.to}:  node ${ev.to} finalized, skip`;
      color = C.textDim;
    } else {
      label = `Relax ${ev.from}→${ev.to}:  d[${ev.to}] = ${ev.oldDist} ≤ ${ev.newDist}  ✗`;
      color = C.sweep;
    }
  } else if (ev.type === 'init') {
    label = `Source = ${ev.source}, d[${ev.source}] = 0`;
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

// ── DS Panel: Distance Table + PQ ──

function renderDistTable() {
  const container = document.getElementById('dj-table-container');
  const countEl = document.getElementById('dj-table-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.n === 0) {
    container.innerHTML = '<div class="ev-empty">Enter edges and source, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.visited.size}/${state.n}`;

  let html = '<table class="ot-dp-table"><thead><tr>';
  html += '<th>Node</th><th>d</th><th>prev</th><th>Status</th>';
  html += '</tr></thead><tbody>';

  for (let i = 0; i < state.n; i++) {
    const isCurrent = i === state.currentNode;
    const isVisited = state.visited.has(i);
    const isQueued = state.pq.some(e => e.node === i);

    let cls = '';
    if (isCurrent) cls = 'dj-row-current';
    else if (isVisited) cls = 'dj-row-visited';
    else if (isQueued) cls = 'dj-row-queued';

    const d = state.dist[i];
    const distStr = d === Infinity ? '∞' : String(d);
    const prevStr = state.prev[i] >= 0 ? String(state.prev[i]) : '–';
    const statusStr = isCurrent ? '▶ visiting' :
                      isVisited ? '✓ done' :
                      isQueued ? 'in PQ' : '–';

    html += `<tr class="${cls}"><td>${i}</td><td>${distStr}</td><td>${prevStr}</td><td>${statusStr}</td></tr>`;
  }
  html += '</tbody></table>';

  if (state.pq.length > 0) {
    html += '<div class="dj-pq-section"><div class="mp-label" style="margin-top:10px">Priority Queue</div>';
    html += '<div class="mp-chip-row">';
    for (let k = 0; k < state.pq.length; k++) {
      const item = state.pq[k];
      const isMin = k === 0;
      const style = isMin
        ? 'color:#ffca28;background:rgba(255,202,40,0.12);border-color:rgba(255,202,40,0.3)'
        : 'color:#b39ddb;background:rgba(124,77,255,0.08);border-color:rgba(124,77,255,0.2)';
      html += `<span class="mp-chip" style="${style}">${item.node}: d=${item.dist}${isMin ? ' ←min' : ''}</span>`;
    }
    html += '</div></div>';
  }

  container.innerHTML = html;
}

// ── DS Panel: Step Inspector ──

function renderStepInspector() {
  const inspEl = document.getElementById('dj-inspector');
  const stepEl = document.getElementById('dj-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Current Node</span><strong>${state.currentNode >= 0 ? state.currentNode : '–'}</strong></div>`;
  h += `<div class="mp-kv"><span>Visited</span><strong>${state.visited.size} / ${state.n}</strong></div>`;

  if (ev && ev.type === 'visit') {
    h += `<div class="mp-block"><div class="mp-label">Extract-Min</div>`;
    h += `<div class="mp-kv"><span>Node</span><strong style="color:${C.intersection}">${ev.node}</strong></div>`;
    h += `<div class="mp-kv"><span>Distance</span><strong style="color:${C.intersection}">${ev.dist}</strong></div>`;
    h += `<div class="mp-kv"><span>Action</span><strong>Finalize d[${ev.node}] = ${ev.dist}</strong></div>`;
    h += '</div>';
  }

  if (ev && ev.type === 'relax') {
    h += `<div class="mp-block"><div class="mp-label">Edge Relaxation</div>`;
    h += `<div class="mp-kv"><span>Edge</span><strong>${ev.from} → ${ev.to}  (w=${ev.weight})</strong></div>`;

    if (ev.reason === 'visited') {
      h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.textDim}">Node ${ev.to} already finalized</strong></div>`;
    } else {
      const oldStr = ev.oldDist === Infinity ? '∞' : ev.oldDist;
      h += `<div class="mp-kv"><span>Current d[${ev.to}]</span><strong>${oldStr}</strong></div>`;
      h += `<div class="mp-kv"><span>New path</span><strong>d[${ev.from}] + ${ev.weight} = ${state.dist[ev.from]} + ${ev.weight} = ${ev.newDist}</strong></div>`;
      if (ev.improved) {
        h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.lineV}">Improved! (${ev.newDist} < ${oldStr})</strong></div>`;
      } else {
        h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.sweep}">No improvement (${ev.oldDist} ≤ ${ev.newDist})</strong></div>`;
      }
    }
    h += '</div>';
  }

  if (state.phase === 'complete') {
    h += `<div class="mp-block"><div class="mp-label">Final Distances</div>`;
    for (let i = 0; i < state.n; i++) {
      const d = state.dist[i];
      h += `<div class="mp-kv"><span>d[${i}]</span><strong>${d === Infinity ? '∞ (unreachable)' : d}</strong></div>`;
    }
    h += '</div>';

    h += `<div class="mp-block"><div class="mp-label">Shortest Path Tree</div>`;
    for (let i = 0; i < state.n; i++) {
      if (i === state.source) continue;
      const path = [];
      let cur = i;
      while (cur >= 0) { path.unshift(cur); cur = state.prev[cur]; }
      if (path[0] === state.source) {
        h += `<div class="mp-kv"><span>${state.source}→${i}</span><strong>${path.join(' → ')}  (d=${state.dist[i]})</strong></div>`;
      } else {
        h += `<div class="mp-kv"><span>${state.source}→${i}</span><strong style="color:${C.textMuted}">unreachable</strong></div>`;
      }
    }
    h += '</div>';
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
  document.getElementById('m-nodes').textContent = state.n || '0';
  document.getElementById('m-visited').textContent = state.n > 0 ? `${state.visited.size}/${state.n}` : '–';
  document.getElementById('m-pq').textContent = state.pq.length > 0 ? state.pq.length : '–';
  document.getElementById('m-current').textContent = state.currentNode >= 0 ? state.currentNode : '–';
}
