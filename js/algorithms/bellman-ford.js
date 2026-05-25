import { C } from '../theme.js';

export const id = 'bellman-ford';
export const title = 'Bellman-Ford Algorithm';
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

    dist: [],
    prev: [],
    treeEdges: new Set(),
    negativeCycleEdges: new Set(),

    currentPass: 0,
    currentEdgeId: -1,
    changedThisPass: false,
    hasNegativeCycle: false,

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
      <input type="text" id="bf-edges" value="" placeholder="0-1:6, 1-4:-4" style="width:165px">
    </div>
    <div class="input-group">
      <label>Source</label>
      <input type="text" id="bf-source" value="" placeholder="0" style="width:30px">
    </div>
    <button id="btn-example">Example</button>
    <button id="btn-negative">-ve Cycle</button>
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
    <div class="ds-section bf-section-table">
      <div class="ds-header">
        <span>Distances</span>
        <span class="ds-count" id="bf-table-count"></span>
      </div>
      <div id="bf-table-container" class="ot-scroll">
        <div class="ev-empty">Enter edges and source, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section bf-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="bf-step-count"></span>
      </div>
      <div id="bf-inspector" class="mp-inspector">
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
      <div class="info-metric"><span class="label">Edges</span><span class="value" id="m-edges">0</span></div>
      <div class="info-metric"><span class="label">Pass</span><span class="value" id="m-pass">–</span></div>
      <div class="info-metric"><span class="label">Current</span><span class="value" id="m-current">–</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Bellman-Ford Algorithm</div>
    <div class="es-sub">Enter directed edges as from-to:weight. Negative weights are allowed.</div>
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
  on(document.getElementById('btn-negative'), 'click', loadNegativeCycle);
  on(document.getElementById('btn-random'), 'click', loadRandom);
  on(document.getElementById('btn-run'), 'click', startVisualization);
  on(document.getElementById('btn-step'), 'click', stepForward);
  on(document.getElementById('btn-play'), 'click', togglePlay);
  on(document.getElementById('btn-reset'), 'click', resetVisualization);
  on(document.getElementById('speed'), 'input', updateSpeed);
  on(document.getElementById('bf-edges'), 'input', onInputChange);
  on(document.getElementById('bf-source'), 'input', onInputChange);
}

function handleResize() {
  setupCanvas();
  if (state.n > 0) state.positions = computePositions(state.n);
  render();
}

function onInputChange() { updateControls(); }

function parseInput() {
  const edgesStr = document.getElementById('bf-edges').value.trim();
  const sourceStr = document.getElementById('bf-source').value.trim();

  const edges = [];
  let maxNode = -1;

  for (const part of edgesStr.split(/[,;]\s*/)) {
    const m = part.trim().match(/^(\d+)\s*-\s*(\d+)\s*:\s*(-?\d+)$/);
    if (!m) continue;
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    const weight = parseInt(m[3], 10);
    if (from === to || Math.abs(weight) > 99) continue;
    edges.push({ id: edges.length, from, to, weight });
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
  document.getElementById('bf-edges').value = '0-1:6, 0-2:7, 1-2:8, 1-3:5, 1-4:-4, 2-3:-3, 2-4:9, 3-1:-2, 4-0:2, 4-3:7';
  document.getElementById('bf-source').value = '0';
  updateControls();
}

function loadNegativeCycle() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('bf-edges').value = '0-1:1, 1-2:2, 2-3:-5, 3-1:1, 0-4:8, 4-3:2';
  document.getElementById('bf-source').value = '0';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 5 + Math.floor(Math.random() * 4);
  const edgeStrs = [];
  const edgeSet = new Set();

  for (let i = 0; i < n - 1; i++) {
    const w = -3 + Math.floor(Math.random() * 10);
    edgeStrs.push(`${i}-${i + 1}:${w}`);
    edgeSet.add(`${i},${i + 1}`);
  }

  const extra = Math.floor(n * 0.8);
  for (let k = 0; k < extra; k++) {
    const from = Math.floor(Math.random() * (n - 1));
    const to = from + 1 + Math.floor(Math.random() * (n - from - 1));
    if (edgeSet.has(`${from},${to}`)) continue;
    edgeSet.add(`${from},${to}`);
    const w = -5 + Math.floor(Math.random() * 15);
    edgeStrs.push(`${from}-${to}:${w}`);
  }

  document.getElementById('bf-edges').value = edgeStrs.join(', ');
  document.getElementById('bf-source').value = '0';
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
  const dist = Array(n).fill(Infinity);
  const prev = Array(n).fill(-1);
  const trace = [];

  dist[source] = 0;
  trace.push({ type: 'init', source, n });

  for (let pass = 1; pass <= n - 1; pass++) {
    let changed = false;
    trace.push({ type: 'pass-start', pass, maxPass: n - 1 });

    for (const edge of edges) {
      const fromDist = dist[edge.from];
      const oldDist = dist[edge.to];
      const candidate = fromDist === Infinity ? Infinity : fromDist + edge.weight;
      const improved = candidate < oldDist;

      if (improved) {
        dist[edge.to] = candidate;
        prev[edge.to] = edge.from;
        changed = true;
      }

      trace.push({
        type: 'relax',
        pass,
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        fromDist,
        oldDist,
        newDist: candidate,
        improved,
        reason: fromDist === Infinity ? 'unreachable' : improved ? 'improved' : 'no-improvement',
      });
    }

    trace.push({ type: 'pass-end', pass, changed });
    if (!changed) {
      trace.push({ type: 'early-stop', pass });
      break;
    }
  }

  let hasNegativeCycle = false;
  trace.push({ type: 'cycle-start' });
  for (const edge of edges) {
    const fromDist = dist[edge.from];
    const oldDist = dist[edge.to];
    const candidate = fromDist === Infinity ? Infinity : fromDist + edge.weight;
    const canImprove = candidate < oldDist;
    if (canImprove) hasNegativeCycle = true;
    trace.push({
      type: 'cycle-check',
      edgeId: edge.id,
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
      fromDist,
      oldDist,
      newDist: candidate,
      canImprove,
    });
  }

  trace.push({
    type: 'complete',
    distances: [...dist],
    predecessors: [...prev],
    hasNegativeCycle,
  });

  return { trace, dist, prev };
}

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
  state.treeEdges = new Set();
  state.negativeCycleEdges = new Set();
  state.currentPass = 0;
  state.currentEdgeId = -1;
  state.changedThisPass = false;
  state.hasNegativeCycle = false;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('bf-edges').disabled = true;
  document.getElementById('bf-source').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through passes or press Play.');
  updateMetrics();
  renderDistTable();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.dist[ev.source] = 0;
      state.currentPass = 0;
      state.currentEdgeId = -1;
      updateStatus(`Source = ${ev.source}. Distance set to 0. All others ∞.`);
      break;

    case 'pass-start':
      state.currentPass = ev.pass;
      state.currentEdgeId = -1;
      state.changedThisPass = false;
      updateStatus(`Pass ${ev.pass}/${ev.maxPass}: scan every edge and relax when possible.`);
      break;

    case 'relax': {
      state.currentPass = ev.pass;
      state.currentEdgeId = ev.edgeId;
      if (ev.improved) {
        state.dist[ev.to] = ev.newDist;
        state.prev[ev.to] = ev.from;
        state.changedThisPass = true;
        state.treeEdges = new Set([...state.treeEdges].filter(edgeId => {
          const edge = state.edges.find(e => e.id === edgeId);
          return edge && edge.to !== ev.to;
        }));
        state.treeEdges.add(ev.edgeId);
        const oldStr = formatDist(ev.oldDist);
        updateStatus(`Pass ${ev.pass}: relax ${ev.from}→${ev.to}. d[${ev.to}] = ${oldStr} → ${ev.newDist}.`);
      } else if (ev.reason === 'unreachable') {
        updateStatus(`Pass ${ev.pass}: skip ${ev.from}→${ev.to}; node ${ev.from} is still unreachable.`);
      } else {
        updateStatus(`Pass ${ev.pass}: ${ev.from}→${ev.to} gives ${formatDist(ev.newDist)}, no improvement.`);
      }
      break;
    }

    case 'pass-end':
      state.currentEdgeId = -1;
      state.changedThisPass = ev.changed;
      updateStatus(ev.changed
        ? `Pass ${ev.pass} changed at least one distance. Continue scanning.`
        : `Pass ${ev.pass} made no changes. Shortest distances are stable.`);
      break;

    case 'early-stop':
      state.currentEdgeId = -1;
      updateStatus(`No distance changed in pass ${ev.pass}; remaining passes can be skipped.`);
      break;

    case 'cycle-start':
      state.currentEdgeId = -1;
      updateStatus('Checking one more pass. Any improvement now means a reachable negative cycle.');
      break;

    case 'cycle-check':
      state.currentEdgeId = ev.edgeId;
      if (ev.canImprove) {
        state.hasNegativeCycle = true;
        state.negativeCycleEdges.add(ev.edgeId);
        updateStatus(`Negative cycle detected: ${ev.from}→${ev.to} can still improve d[${ev.to}].`);
      } else {
        updateStatus(`Check ${ev.from}→${ev.to}: no further improvement.`);
      }
      break;

    case 'complete':
      state.currentEdgeId = -1;
      state.hasNegativeCycle = ev.hasNegativeCycle;
      updateStatus(ev.hasNegativeCycle
        ? 'Done. A reachable negative cycle exists, so shortest paths are not well-defined.'
        : 'Done! No negative cycle was found and distances are final.');
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
  state.phase = 'complete';
  state.isPlaying = false;
  state.isStepping = false;
  updateStatus(state.hasNegativeCycle
    ? 'Done. A reachable negative cycle exists, so shortest paths are not well-defined.'
    : 'Done! No negative cycle was found and distances are final.');
  updateControls();
  updateMetrics();
  renderDistTable();
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
  state.dist = [];
  state.prev = [];
  state.treeEdges = new Set();
  state.negativeCycleEdges = new Set();
  state.currentPass = 0;
  state.currentEdgeId = -1;
  state.changedThisPass = false;
  state.hasNegativeCycle = false;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('bf-edges').disabled = false;
  document.getElementById('bf-source').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter edges and source, then click Visualize.');
  updateMetrics();
  renderDistTable();
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
    if (edge.id === state.currentEdgeId || state.treeEdges.has(edge.id) || state.negativeCycleEdges.has(edge.id)) continue;
    drawDirectedEdge(edge, 'rgba(200,200,208,0.18)', 1, false);
  }
  for (const edge of state.edges) {
    if (edge.id === state.currentEdgeId || state.negativeCycleEdges.has(edge.id)) continue;
    if (state.treeEdges.has(edge.id)) drawDirectedEdge(edge, C.lineV, 2, true);
  }
  for (const edge of state.edges) {
    if (state.negativeCycleEdges.has(edge.id) && edge.id !== state.currentEdgeId) {
      drawDirectedEdge(edge, C.sweep, 2.5, true);
    }
  }
  if (state.currentEdgeId >= 0) {
    const edge = state.edges.find(e => e.id === state.currentEdgeId);
    if (edge) {
      const color = state.negativeCycleEdges.has(edge.id) ? C.sweep : C.intersection;
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
  const sameDirIndex = state.edges.filter(e => e.from === edge.from && e.to === edge.to).findIndex(e => e.id === edge.id);
  const curveAmt = (hasReverse ? 18 : 0) + sameDirIndex * 10;

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
  if (curveAmt > 0) ctx.quadraticCurveTo(mx, my, tipX, tipY);
  else ctx.lineTo(tipX, tipY);
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

  const label = edge.weight > 0 ? `+${edge.weight}` : String(edge.weight);
  ctx.fillStyle = glow ? color : edge.weight < 0 ? '#ef9a9a' : C.textDim;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, lx, ly);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawNodes() {
  const currentEdge = state.edges.find(e => e.id === state.currentEdgeId);

  for (let i = 0; i < state.n; i++) {
    const pos = state.positions[i];
    const isSource = i === state.source;
    const isCurrentFrom = currentEdge && currentEdge.from === i;
    const isCurrentTo = currentEdge && currentEdge.to === i;
    const inNegCycle = state.negativeCycleEdges.size > 0 &&
      [...state.negativeCycleEdges].some(edgeId => {
        const edge = state.edges.find(e => e.id === edgeId);
        return edge && (edge.from === i || edge.to === i);
      });
    const reached = state.dist[i] !== Infinity;

    if (isSource) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, NODE_R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(124,77,255,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.save();
    if (inNegCycle) {
      ctx.shadowColor = C.sweep;
      ctx.shadowBlur = 14;
    } else if (isCurrentFrom || isCurrentTo) {
      ctx.shadowColor = C.intersection;
      ctx.shadowBlur = 12;
    } else if (reached) {
      ctx.shadowColor = C.lineV;
      ctx.shadowBlur = 4;
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, NODE_R, 0, Math.PI * 2);

    if (inNegCycle) {
      ctx.fillStyle = 'rgba(239,83,80,0.18)';
      ctx.strokeStyle = C.sweep;
      ctx.lineWidth = 2.5;
    } else if (isCurrentTo) {
      ctx.fillStyle = 'rgba(255,202,40,0.20)';
      ctx.strokeStyle = C.intersection;
      ctx.lineWidth = 2.5;
    } else if (isCurrentFrom) {
      ctx.fillStyle = 'rgba(79,195,247,0.14)';
      ctx.strokeStyle = C.lineH;
      ctx.lineWidth = 2;
    } else if (reached) {
      ctx.fillStyle = 'rgba(102,187,106,0.12)';
      ctx.strokeStyle = C.lineV;
      ctx.lineWidth = 1.8;
    } else {
      ctx.fillStyle = 'rgba(200,200,208,0.06)';
      ctx.strokeStyle = 'rgba(200,200,208,0.25)';
      ctx.lineWidth = 1.5;
    }

    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = inNegCycle ? C.sweep :
                    isCurrentTo ? C.intersection :
                    isCurrentFrom ? C.lineH :
                    reached ? C.lineV : C.text;
    ctx.font = 'bold 14px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i), pos.x, pos.y);

    const distText = state.dist[i] === undefined ? '' : formatDist(state.dist[i]);
    if (distText) {
      ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillStyle = state.dist[i] === Infinity ? C.textMuted :
                      inNegCycle ? C.sweep :
                      isCurrentTo ? C.intersection :
                      isCurrentFrom ? C.lineH : C.lineV;
      ctx.fillText(`d=${distText}`, pos.x, pos.y + NODE_R + 14);
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
    label = ev.hasNegativeCycle ? 'Reachable negative cycle found' : 'Shortest paths finalized';
    color = ev.hasNegativeCycle ? C.sweep : C.lineV;
  } else if (ev.type === 'relax') {
    if (ev.improved) {
      label = `Pass ${ev.pass}: ${ev.from}→${ev.to}, d[${ev.to}] = ${formatDist(ev.oldDist)} → ${ev.newDist}`;
      color = C.lineV;
    } else if (ev.reason === 'unreachable') {
      label = `Pass ${ev.pass}: ${ev.from} unreachable, skip ${ev.from}→${ev.to}`;
      color = C.textDim;
    } else {
      label = `Pass ${ev.pass}: ${ev.from}→${ev.to}, no improvement`;
      color = C.sweep;
    }
  } else if (ev.type === 'cycle-check') {
    label = ev.canImprove
      ? `${ev.from}→${ev.to} still improves: negative cycle`
      : `Cycle check ${ev.from}→${ev.to}: stable`;
    color = ev.canImprove ? C.sweep : C.lineH;
  } else if (ev.type === 'pass-start') {
    label = `Pass ${ev.pass}/${ev.maxPass}`;
    color = C.accent;
  } else if (ev.type === 'pass-end') {
    label = ev.changed ? `Pass ${ev.pass} changed distances` : `Pass ${ev.pass} made no changes`;
    color = ev.changed ? C.intersection : C.lineV;
  } else if (ev.type === 'cycle-start') {
    label = 'Negative-cycle check';
    color = C.lineH;
  } else if (ev.type === 'init') {
    label = `Source = ${ev.source}, d[${ev.source}] = 0`;
    color = C.accent;
  } else if (ev.type === 'early-stop') {
    label = `Early stop after pass ${ev.pass}`;
    color = C.lineV;
  } else {
    return;
  }

  ctx.fillStyle = color;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cw / 2, 18);
  ctx.textAlign = 'left';
}

function renderDistTable() {
  const container = document.getElementById('bf-table-container');
  const countEl = document.getElementById('bf-table-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.n === 0) {
    container.innerHTML = '<div class="ev-empty">Enter edges and source, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `pass ${state.currentPass || '-'}`;

  const currentEdge = state.edges.find(e => e.id === state.currentEdgeId);
  let html = '<table class="ot-dp-table"><thead><tr>';
  html += '<th>Node</th><th>d</th><th>prev</th><th>Status</th>';
  html += '</tr></thead><tbody>';

  for (let i = 0; i < state.n; i++) {
    const isFrom = currentEdge && currentEdge.from === i;
    const isTo = currentEdge && currentEdge.to === i;
    const inNegCycle = [...state.negativeCycleEdges].some(edgeId => {
      const edge = state.edges.find(e => e.id === edgeId);
      return edge && (edge.from === i || edge.to === i);
    });

    let cls = '';
    if (inNegCycle) cls = 'bf-row-negative';
    else if (isTo) cls = 'bf-row-current';
    else if (isFrom) cls = 'bf-row-from';
    else if (state.dist[i] !== Infinity) cls = 'bf-row-reached';

    const prevStr = state.prev[i] >= 0 ? String(state.prev[i]) : '–';
    const statusStr = inNegCycle ? 'cycle?' :
                      isTo ? 'target' :
                      isFrom ? 'from' :
                      state.dist[i] !== Infinity ? 'reached' : 'unreached';

    html += `<tr class="${cls}"><td>${i}</td><td>${formatDist(state.dist[i])}</td><td>${prevStr}</td><td>${statusStr}</td></tr>`;
  }
  html += '</tbody></table>';

  if (state.currentPass > 0) {
    const chipStyle = state.changedThisPass
      ? 'color:#ffca28;background:rgba(255,202,40,0.12);border-color:rgba(255,202,40,0.3)'
      : 'color:#66bb6a;background:rgba(102,187,106,0.12);border-color:rgba(102,187,106,0.3)';
    html += '<div class="bf-pass-section"><div class="mp-label" style="margin-top:10px">Pass State</div>';
    html += `<div class="mp-chip-row"><span class="mp-chip" style="${chipStyle}">${state.changedThisPass ? 'changed' : 'stable so far'}</span>`;
    if (state.hasNegativeCycle) {
      html += '<span class="mp-chip" style="color:#ef5350;background:rgba(239,83,80,0.14);border-color:rgba(239,83,80,0.35)">negative cycle</span>';
    }
    html += '</div></div>';
  }

  container.innerHTML = html;
}

function renderStepInspector() {
  const inspEl = document.getElementById('bf-inspector');
  const stepEl = document.getElementById('bf-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Pass</span><strong>${state.currentPass || '–'} / ${Math.max(0, state.n - 1)}</strong></div>`;
  h += `<div class="mp-kv"><span>Current Edge</span><strong>${currentEdgeLabel()}</strong></div>`;

  if (ev && ev.type === 'relax') {
    h += `<div class="mp-block"><div class="mp-label">Relaxation</div>`;
    h += `<div class="mp-kv"><span>Edge</span><strong>${ev.from} → ${ev.to}  (w=${formatSigned(ev.weight)})</strong></div>`;
    h += `<div class="mp-kv"><span>d[${ev.from}] before</span><strong>${formatDist(ev.fromDist)}</strong></div>`;
    h += `<div class="mp-kv"><span>d[${ev.to}] before</span><strong>${formatDist(ev.oldDist)}</strong></div>`;

    if (ev.reason === 'unreachable') {
      h += `<div class="mp-kv"><span>Candidate</span><strong style="color:${C.textDim}">∞</strong></div>`;
      h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.textDim}">Source side unreachable</strong></div>`;
    } else {
      h += `<div class="mp-kv"><span>Candidate</span><strong>${formatDist(ev.fromDist)} ${formatSigned(ev.weight)} = ${formatDist(ev.newDist)}</strong></div>`;
      if (ev.improved) {
        h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.lineV}">Improved (${ev.newDist} < ${formatDist(ev.oldDist)})</strong></div>`;
      } else {
        h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.sweep}">No improvement</strong></div>`;
      }
    }
    h += '</div>';
  }

  if (ev && ev.type === 'cycle-check') {
    h += `<div class="mp-block"><div class="mp-label">Negative-Cycle Check</div>`;
    h += `<div class="mp-kv"><span>Edge</span><strong>${ev.from} → ${ev.to}  (w=${formatSigned(ev.weight)})</strong></div>`;
    h += `<div class="mp-kv"><span>Candidate</span><strong>${formatDist(ev.newDist)}</strong></div>`;
    h += `<div class="mp-kv"><span>Current d[${ev.to}]</span><strong>${formatDist(ev.oldDist)}</strong></div>`;
    h += ev.canImprove
      ? `<div class="mp-kv"><span>Result</span><strong style="color:${C.sweep}">Can still improve</strong></div>`
      : `<div class="mp-kv"><span>Result</span><strong style="color:${C.lineV}">Stable</strong></div>`;
    h += '</div>';
  }

  if (state.phase === 'complete') {
    h += `<div class="mp-block"><div class="mp-label">Final Distances</div>`;
    for (let i = 0; i < state.n; i++) {
      h += `<div class="mp-kv"><span>d[${i}]</span><strong>${formatDist(state.dist[i])}</strong></div>`;
    }
    h += '</div>';

    if (state.hasNegativeCycle) {
      h += `<div class="mp-block"><div class="mp-label">Warning</div>`;
      h += `<div class="mp-kv"><span>Cycle</span><strong style="color:${C.sweep}">Reachable negative cycle detected</strong></div>`;
      h += '</div>';
    } else {
      h += `<div class="mp-block"><div class="mp-label">Shortest Paths</div>`;
      for (let i = 0; i < state.n; i++) {
        if (i === state.source) continue;
        const path = [];
        let cur = i;
        while (cur >= 0) { path.unshift(cur); cur = state.prev[cur]; }
        if (path[0] === state.source) {
          h += `<div class="mp-kv"><span>${state.source}→${i}</span><strong>${path.join(' → ')}  (d=${formatDist(state.dist[i])})</strong></div>`;
        } else {
          h += `<div class="mp-kv"><span>${state.source}→${i}</span><strong style="color:${C.textMuted}">unreachable</strong></div>`;
        }
      }
      h += '</div>';
    }
  }

  inspEl.innerHTML = h;
}

function updateControls() {
  const run = document.getElementById('btn-run');
  const step = document.getElementById('btn-step');
  const play = document.getElementById('btn-play');
  const reset = document.getElementById('btn-reset');
  const example = document.getElementById('btn-example');
  const negative = document.getElementById('btn-negative');
  const random = document.getElementById('btn-random');

  const isInput = state.phase === 'input';
  const running = state.phase === 'running';

  run.disabled = !isInput || !inputValid();
  step.disabled = !running || state.isPlaying || state.isStepping;
  play.disabled = !running || state.isStepping;
  play.textContent = state.isPlaying ? 'Pause' : 'Play';
  reset.disabled = isInput;
  example.disabled = !isInput;
  negative.disabled = !isInput;
  random.disabled = !isInput;
}

function updateEmptyState() {
  els.emptyState.classList.toggle('hidden', state.phase !== 'input');
}

function updateStatus(msg) {
  const el = document.getElementById('info-status');
  let badgeCls = 'drawing', label = 'Input';
  if (state.phase === 'running') { badgeCls = 'running'; label = 'Running'; }
  else if (state.phase === 'complete') { badgeCls = state.hasNegativeCycle ? 'running' : 'complete'; label = state.hasNegativeCycle ? 'Cycle' : 'Done'; }
  el.innerHTML = `<span class="phase ${badgeCls}">${label}</span> ${msg}`;
}

function updateMetrics() {
  document.getElementById('m-nodes').textContent = state.n || '0';
  document.getElementById('m-edges').textContent = state.edges.length || '0';
  document.getElementById('m-pass').textContent = state.currentPass > 0 ? `${state.currentPass}/${Math.max(0, state.n - 1)}` : '–';
  document.getElementById('m-current').textContent = currentEdgeLabel();
}

function currentEdgeLabel() {
  const edge = state.edges.find(e => e.id === state.currentEdgeId);
  return edge ? `${edge.from}→${edge.to}` : '–';
}

function formatDist(value) {
  return value === Infinity ? '∞' : String(value);
}

function formatSigned(value) {
  return value >= 0 ? `+${value}` : String(value);
}
