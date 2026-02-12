export const id = 'maximal-points-divide-conquer';
export const title = 'Maximal Points in 2D';
export const category = 'divide-conquer';
export const badge = 'Divide & Conquer';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let prevDsPanelWidth = '';

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
    points: [],
    pointById: new Map(),
    pointOrder: new Map(),
    nextId: 0,
    phase: 'draw',

    sortedPoints: [],
    trace: [],
    callNodes: [],
    rootResultIds: [],
    finalMaxSet: new Set(),

    currentStep: -1,
    currentEvent: null,
    activeRange: null,
    splitMid: null,
    activeCallId: null,
    callStack: [],
    callStatus: {},
    callResults: {},
    rightSet: new Set(),
    rightMaxY: null,
    currentCandidateId: null,
    currentWitnessId: null,
    dominatedSet: new Set(),
    decision: null,

    isPlaying: false,
    isStepping: false,
    speed: 5,
    animDelay: 600,
  };

  setupDOM();
  setupCanvas();
  bindEvents();
  rebuildPointMaps();
  rebuildInsertionOrder();
  updateControls();
  updateEmptyState();
  updateStatus('Click to place points. Higher y means visually higher on the canvas.');
  updateMetrics();
  renderRecursionList();
  renderMergeInspector();
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
  prevDsPanelWidth = els.dsPanelContainer ? els.dsPanelContainer.style.width : '';

  els.toolbarControls.innerHTML = `
    <button id="btn-example">Example</button>
    <button id="btn-random">Random</button>
    <button id="btn-undo">Undo</button>
    <button id="btn-clear">Clear</button>
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
    <div class="ds-section mp-section-tree">
      <div class="ds-header">
        <span>Recursion Tree</span>
        <span class="ds-count" id="rt-count"></span>
      </div>
      <div id="recursion-list" class="mp-scroll">
        <div class="ev-empty">Place points, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section mp-section-merge">
      <div class="ds-header">
        <span>Merge Inspector</span>
        <span class="ds-count" id="merge-step"></span>
      </div>
      <div id="merge-inspector" class="mp-inspector">
        <div class="ev-empty">No active merge yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Draw</span>
      Click to place points, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Points</span><span class="value" id="m-points">0</span></div>
      <div class="info-metric"><span class="label">Calls</span><span class="value" id="m-calls">-</span></div>
      <div class="info-metric"><span class="label">Depth</span><span class="value" id="m-depth">-</span></div>
      <div class="info-metric"><span class="label">Maximal</span><span class="value" id="m-maximal">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Click to place points</div>
    <div class="es-sub">A point is dominated if another point has x >= and y >=, with at least one strict</div>
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
  on(canvas, 'click', handleCanvasClick);
  on(window, 'resize', handleResize);
  on(document.getElementById('btn-example'), 'click', loadExample);
  on(document.getElementById('btn-random'), 'click', loadRandom);
  on(document.getElementById('btn-undo'), 'click', undoPoint);
  on(document.getElementById('btn-clear'), 'click', clearAll);
  on(document.getElementById('btn-run'), 'click', startVisualization);
  on(document.getElementById('btn-step'), 'click', stepForward);
  on(document.getElementById('btn-play'), 'click', togglePlay);
  on(document.getElementById('btn-reset'), 'click', resetVisualization);
  on(document.getElementById('speed'), 'input', updateSpeed);
}

function handleResize() {
  setupCanvas();
  render();
}

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  const x = clamp(e.clientX - r.left, 18, cw - 18);
  const sy = clamp(e.clientY - r.top, 18, ch - 18);
  return { x, y: ch - sy };
}

function handleCanvasClick(e) {
  if (state.phase !== 'draw') return;
  const p = getPos(e);
  if (isNearExistingPoint(p.x, p.y, 14)) {
    updateStatus('Point ignored: too close to an existing point');
    return;
  }
  state.points.push({ id: state.nextId++, x: p.x, y: p.y });
  rebuildPointMaps();
  rebuildInsertionOrder();
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  drawActiveRange();
  drawSplitLine();
  drawRightThreshold();
  drawCandidateDominanceRegion();
  drawWitnessLink();
  drawPoints();
  drawFrontier();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const spacing = 50;
  for (let x = spacing; x < cw; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ch);
    ctx.stroke();
  }
  for (let y = spacing; y < ch; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cw, y);
    ctx.stroke();
  }
}

function drawActiveRange() {
  if (state.phase === 'draw' || !state.activeRange || state.sortedPoints.length === 0) return;
  const loPt = state.sortedPoints[state.activeRange.lo];
  const hiPt = state.sortedPoints[state.activeRange.hi];
  if (!loPt || !hiPt) return;

  const x1 = clamp(loPt.x - 16, 0, cw);
  const x2 = clamp(hiPt.x + 16, 0, cw);
  const w = Math.max(0, x2 - x1);
  if (w <= 0) return;

  ctx.fillStyle = 'rgba(124,77,255,0.08)';
  ctx.fillRect(x1, 0, w, ch);
  ctx.strokeStyle = 'rgba(124,77,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x1 + 0.5, 0.5, Math.max(0, w - 1), ch - 1);
  ctx.fillStyle = '#a48fff';
  ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText(`[${state.activeRange.lo}..${state.activeRange.hi}]`, x1 + 6, 14);
}

function drawSplitLine() {
  if (state.phase === 'draw' || state.splitMid === null || state.sortedPoints.length < 2) return;
  const mid = state.splitMid;
  const leftPt = state.sortedPoints[mid];
  const rightPt = state.sortedPoints[mid + 1];
  if (!leftPt || !rightPt) return;

  let sx = (leftPt.x + rightPt.x) / 2;
  if (Math.abs(leftPt.x - rightPt.x) < 0.5) sx = leftPt.x + 1;

  ctx.strokeStyle = '#ef5350';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(sx, 0);
  ctx.lineTo(sx, ch);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ef9a9a';
  ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText('split', sx + 5, 14);
}

function drawRightThreshold() {
  if (state.phase !== 'running' || state.rightMaxY === null) return;
  const sy = toScreenY(state.rightMaxY);

  ctx.strokeStyle = '#66bb6a';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, sy);
  ctx.lineTo(cw, sy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#81c784';
  ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText(`rightMaxY=${Math.round(state.rightMaxY)}`, 8, sy - 6);
}

function drawCandidateDominanceRegion() {
  if (state.phase !== 'running' || state.currentCandidateId === null) return;
  const p = state.pointById.get(state.currentCandidateId);
  if (!p) return;

  const sy = toScreenY(p.y);
  ctx.fillStyle = 'rgba(255,202,40,0.06)';
  ctx.fillRect(p.x, 0, cw - p.x, sy);
  ctx.strokeStyle = 'rgba(255,202,40,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(p.x + 0.5, 0.5, Math.max(0, cw - p.x - 1), Math.max(0, sy - 1));
  ctx.setLineDash([]);
}

function drawWitnessLink() {
  if (state.phase !== 'running') return;
  if (state.currentCandidateId === null || state.currentWitnessId === null) return;
  const c = state.pointById.get(state.currentCandidateId);
  const w = state.pointById.get(state.currentWitnessId);
  if (!c || !w) return;

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(w.x, toScreenY(w.y));
  ctx.lineTo(c.x, toScreenY(c.y));
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPoints() {
  for (const p of state.points) {
    const sx = p.x;
    const sy = toScreenY(p.y);
    const style = pointStyle(p.id);

    ctx.save();
    ctx.globalAlpha = style.alpha;
    if (style.shadow) {
      ctx.shadowColor = style.shadow;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth;
    ctx.beginPath();
    ctx.arc(sx, sy, style.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (style.outerRing) {
      ctx.strokeStyle = style.outerRing;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, style.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const order = state.pointOrder.get(p.id);
    if (order !== undefined) {
      ctx.fillStyle = '#8f93aa';
      ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillText(`#${order + 1}`, sx + 7, sy - 7);
    }
  }
}

function drawFrontier() {
  if (state.phase !== 'complete' || state.finalMaxSet.size === 0) return;
  const pts = state.sortedPoints.filter(p => state.finalMaxSet.has(p.id));
  if (pts.length < 2) return;

  ctx.strokeStyle = 'rgba(124,77,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, toScreenY(pts[0].y));
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const next = pts[i];
    const prevY = toScreenY(prev.y);
    const nextY = toScreenY(next.y);
    ctx.lineTo(prev.x, nextY);
    ctx.lineTo(next.x, nextY);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function pointStyle(pointId) {
  const base = {
    fill: '#8f95ad',
    stroke: '#2f344a',
    r: 5,
    lineWidth: 1.5,
    alpha: 1,
    shadow: null,
    outerRing: null,
  };

  if (state.phase === 'complete') {
    if (state.finalMaxSet.has(pointId)) {
      base.fill = '#7c4dff';
      base.stroke = '#c6b6ff';
      base.shadow = '#7c4dff';
      base.r = 6;
    } else {
      base.fill = 'rgba(143,149,173,0.35)';
      base.stroke = 'rgba(47,52,74,0.5)';
      base.alpha = 0.7;
    }
    return base;
  }

  if (state.dominatedSet.has(pointId)) {
    base.fill = 'rgba(239,83,80,0.58)';
    base.stroke = '#ef5350';
    base.alpha = 0.9;
  } else if (state.currentCandidateId === pointId) {
    base.fill = '#ffca28';
    base.stroke = '#fff176';
    base.shadow = '#ffca28';
    base.r = 6;
  } else if (state.rightSet.has(pointId)) {
    base.fill = '#66bb6a';
    base.stroke = '#a5d6a7';
    base.shadow = '#66bb6a';
    base.r = 5.5;
  } else if (state.activeCallId !== null && (state.callResults[state.activeCallId] || []).includes(pointId)) {
    base.fill = '#4fc3f7';
    base.stroke = '#81d4fa';
  }

  if (state.currentWitnessId === pointId) {
    base.outerRing = '#ffffff';
  }

  return base;
}

function startVisualization() {
  if (state.points.length === 0) return;

  state.phase = 'running';
  state.isPlaying = false;
  state.isStepping = false;

  state.sortedPoints = state.points
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id);
  rebuildPointMaps();
  rebuildSortedOrder();

  const built = buildTrace(state.sortedPoints);
  state.trace = built.trace;
  state.callNodes = built.callNodes;
  state.rootResultIds = built.rootResultIds;
  state.finalMaxSet = new Set();
  state.currentStep = -1;
  state.currentEvent = null;

  state.activeRange = null;
  state.splitMid = null;
  state.activeCallId = null;
  state.callStack = [];
  state.callStatus = {};
  state.callResults = {};
  state.rightSet = new Set();
  state.rightMaxY = null;
  state.currentCandidateId = null;
  state.currentWitnessId = null;
  state.dominatedSet = new Set();
  state.decision = null;

  for (const node of state.callNodes) {
    state.callStatus[node.id] = 'pending';
  }

  updateControls();
  updateStatus('Trace ready. Points are sorted by x and relabeled as #1 to #n. Step through the divide-and-conquer calls or press Play.');
  updateMetrics();
  renderRecursionList();
  renderMergeInspector();
  render();
}

function dominates(a, b) {
  return a.x >= b.x && a.y >= b.y && (a.x > b.x || a.y > b.y);
}

function buildTrace(sortedPoints) {
  const trace = [];
  const callNodes = [];
  let nextCallId = 0;

  function solve(lo, hi, depth, parentId) {
    const callId = nextCallId++;
    callNodes.push({ id: callId, lo, hi, depth, parentId, resultIds: [] });
    trace.push({ type: 'enter', callId, lo, hi, depth });

    if (lo === hi) {
      const p = sortedPoints[lo];
      trace.push({ type: 'base', callId, pointId: p.id });
      trace.push({ type: 'return', callId, lo, hi, resultIds: [p.id] });
      callNodes[callId].resultIds = [p.id];
      return [p];
    }

    const mid = Math.floor((lo + hi) / 2);
    trace.push({ type: 'split', callId, lo, mid, hi });

    const rightMaxima = solve(mid + 1, hi, depth + 1, callId);
    const rightIds = rightMaxima.map(p => p.id);
    const rightMaxY = rightMaxima.reduce((m, p) => Math.max(m, p.y), -Infinity);
    trace.push({ type: 'right-ready', callId, rightIds, rightMaxY });

    const leftMaxima = solve(lo, mid, depth + 1, callId);
    trace.push({
      type: 'merge-start',
      callId,
      rightIds,
      rightMaxY,
      leftIds: leftMaxima.map(p => p.id),
    });

    const merged = rightMaxima.slice();
    for (const lp of leftMaxima) {
      const witness = rightMaxima.find(rp => dominates(rp, lp)) || null;
      trace.push({
        type: 'check-left',
        callId,
        pointId: lp.id,
        rightMaxY,
        dominated: !!witness,
        witnessId: witness ? witness.id : null,
      });
      if (witness) {
        trace.push({ type: 'drop-left', callId, pointId: lp.id, witnessId: witness.id });
      } else {
        merged.push(lp);
        trace.push({ type: 'keep-left', callId, pointId: lp.id });
      }
    }

    merged.sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id);
    const resultIds = merged.map(p => p.id);
    trace.push({ type: 'merge-done', callId, lo, hi, resultIds });
    trace.push({ type: 'return', callId, lo, hi, resultIds });
    callNodes[callId].resultIds = resultIds;
    return merged;
  }

  const rootResultIds = sortedPoints.length > 0
    ? solve(0, sortedPoints.length - 1, 0, null).map(p => p.id)
    : [];

  return { trace, callNodes, rootResultIds };
}

function applyEvent(ev) {
  state.currentEvent = ev;

  switch (ev.type) {
    case 'enter':
      state.callStack.push(ev.callId);
      state.callStatus[ev.callId] = 'running';
      state.activeCallId = ev.callId;
      state.activeRange = { lo: ev.lo, hi: ev.hi };
      state.splitMid = null;
      state.rightSet = new Set();
      state.rightMaxY = null;
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      updateStatus(`Enter F(${ev.lo},${ev.hi}) at depth ${ev.depth}`);
      break;

    case 'split':
      state.activeCallId = ev.callId;
      state.activeRange = { lo: ev.lo, hi: ev.hi };
      state.splitMid = ev.mid;
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      updateStatus(`Split F(${ev.lo},${ev.hi}) at mid=${ev.mid}`);
      break;

    case 'right-ready':
      state.activeCallId = ev.callId;
      state.rightSet = new Set(ev.rightIds);
      state.rightMaxY = ev.rightMaxY;
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      updateStatus(`Right half solved: ${ev.rightIds.length} maximal point(s), rightMaxY=${Math.round(ev.rightMaxY)}`);
      break;

    case 'merge-start':
      state.activeCallId = ev.callId;
      state.rightSet = new Set(ev.rightIds);
      state.rightMaxY = ev.rightMaxY;
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      updateStatus(`Merge in F(${eventCallRange(ev.callId)})`);
      break;

    case 'base':
      state.currentCandidateId = ev.pointId;
      state.currentWitnessId = null;
      state.decision = 'keep';
      updateStatus(`Base case keeps ${pointTextShort(ev.pointId)}`);
      break;

    case 'check-left': {
      state.currentCandidateId = ev.pointId;
      state.currentWitnessId = ev.witnessId;
      state.decision = ev.dominated ? 'drop' : 'keep';
      const msg = ev.dominated
        ? `${pointTextShort(ev.pointId)} is dominated by ${pointTextShort(ev.witnessId)}`
        : `${pointTextShort(ev.pointId)} survives against the right maxima`;
      updateStatus(msg);
      break;
    }

    case 'drop-left':
      state.currentCandidateId = ev.pointId;
      state.currentWitnessId = ev.witnessId;
      state.decision = 'drop';
      state.dominatedSet.add(ev.pointId);
      updateStatus(`Drop ${pointTextShort(ev.pointId)} (dominated by ${pointTextShort(ev.witnessId)})`);
      break;

    case 'keep-left':
      state.currentCandidateId = ev.pointId;
      state.currentWitnessId = null;
      state.decision = 'keep';
      updateStatus(`Keep ${pointTextShort(ev.pointId)} in merged result`);
      break;

    case 'merge-done':
      state.callResults[ev.callId] = ev.resultIds.slice();
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      updateStatus(`Merge complete for F(${ev.lo},${ev.hi}) with ${ev.resultIds.length} maximal point(s)`);
      break;

    case 'return':
      state.callStatus[ev.callId] = 'complete';
      state.callResults[ev.callId] = ev.resultIds.slice();

      if (state.callStack[state.callStack.length - 1] === ev.callId) {
        state.callStack.pop();
      } else {
        state.callStack = state.callStack.filter(id => id !== ev.callId);
      }
      state.activeCallId = state.callStack.length > 0
        ? state.callStack[state.callStack.length - 1]
        : null;
      if (state.activeCallId !== null) {
        const parentNode = state.callNodes[state.activeCallId];
        state.activeRange = parentNode ? { lo: parentNode.lo, hi: parentNode.hi } : null;
      } else {
        state.activeRange = null;
      }
      state.splitMid = null;
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      if (state.currentStep < state.trace.length - 1) {
        updateStatus(`Return from F(${ev.lo},${ev.hi})`);
      }
      break;
  }

  renderRecursionList();
  renderMergeInspector();
  updateMetrics();
  render();
}

async function stepForward() {
  if (state.phase !== 'running' || state.isPlaying || state.isStepping) return;
  if (state.currentStep >= state.trace.length - 1) {
    finishVisualization();
    return;
  }

  state.isStepping = true;
  updateControls();
  try {
    state.currentStep += 1;
    applyEvent(state.trace[state.currentStep]);
    if (state.currentStep >= state.trace.length - 1) {
      finishVisualization();
    }
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
    if (state.currentStep >= state.trace.length - 1) {
      finishVisualization();
      return;
    }
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
  state.currentCandidateId = null;
  state.currentWitnessId = null;
  state.decision = null;
  state.activeCallId = null;
  state.activeRange = null;
  state.splitMid = null;
  state.rightSet = new Set();
  state.rightMaxY = null;
  state.finalMaxSet = new Set(state.rootResultIds);

  const n = state.finalMaxSet.size;
  updateStatus(`Complete: ${n} maximal point${n !== 1 ? 's' : ''} out of ${state.points.length}`);
  updateControls();
  updateMetrics();
  renderRecursionList();
  renderMergeInspector();
  render();
}

function delay(ms) {
  return new Promise(resolve => {
    delayResolve = resolve;
    delayTimer = setTimeout(() => {
      delayResolve = null;
      resolve();
    }, ms);
  });
}

function cancelDelay() {
  if (delayTimer) {
    clearTimeout(delayTimer);
    delayTimer = null;
  }
  if (delayResolve) {
    delayResolve();
    delayResolve = null;
  }
}

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

function resetVisualization() {
  cancelDelay();
  state.phase = 'draw';
  state.sortedPoints = [];
  state.trace = [];
  state.callNodes = [];
  state.rootResultIds = [];
  state.finalMaxSet = new Set();
  state.currentStep = -1;
  state.currentEvent = null;
  state.activeRange = null;
  state.splitMid = null;
  state.activeCallId = null;
  state.callStack = [];
  state.callStatus = {};
  state.callResults = {};
  state.rightSet = new Set();
  state.rightMaxY = null;
  state.currentCandidateId = null;
  state.currentWitnessId = null;
  state.dominatedSet = new Set();
  state.decision = null;
  state.isPlaying = false;
  state.isStepping = false;
  rebuildInsertionOrder();
  updateControls();
  updateStatus('Click to place points. Higher y means visually higher on the canvas.');
  updateMetrics();
  renderRecursionList();
  renderMergeInspector();
  render();
}

function undoPoint() {
  if (state.phase !== 'draw' || state.points.length === 0) return;
  state.points.pop();
  rebuildPointMaps();
  rebuildInsertionOrder();
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function clearAll() {
  if (state.phase !== 'draw') resetVisualization();
  state.points = [];
  state.nextId = 0;
  rebuildPointMaps();
  rebuildInsertionOrder();
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function loadExample() {
  if (state.phase !== 'draw') resetVisualization();
  state.points = [];
  state.nextId = 0;

  const pad = 48;
  const w = Math.max(120, cw - pad * 2);
  const h = Math.max(120, ch - pad * 2);
  const sample = [
    [0.10, 0.20],
    [0.18, 0.46],
    [0.26, 0.28],
    [0.34, 0.62],
    [0.45, 0.40],
    [0.56, 0.72],
    [0.64, 0.55],
    [0.64, 0.67],
    [0.74, 0.79],
    [0.82, 0.63],
    [0.90, 0.88],
    [0.90, 0.71],
  ];

  for (const [nx, ny] of sample) {
    state.points.push({
      id: state.nextId++,
      x: pad + nx * w,
      y: pad + ny * h,
    });
  }

  rebuildPointMaps();
  rebuildInsertionOrder();
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function loadRandom() {
  if (state.phase !== 'draw') resetVisualization();
  state.points = [];
  state.nextId = 0;

  const count = 14;
  let guard = 0;
  while (state.points.length < count && guard < 2000) {
    guard += 1;
    const p = {
      x: rand(30, cw - 30),
      y: rand(30, ch - 30),
    };
    if (isNearExistingPoint(p.x, p.y, 18)) continue;
    state.points.push({ id: state.nextId++, x: p.x, y: p.y });
  }

  rebuildPointMaps();
  rebuildInsertionOrder();
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function renderRecursionList() {
  const listEl = document.getElementById('recursion-list');
  const countEl = document.getElementById('rt-count');
  if (!listEl || !countEl) return;

  if (state.callNodes.length === 0) {
    listEl.innerHTML = '<div class="ev-empty">Place points, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  const completed = completedCalls();
  countEl.textContent = `${completed}/${state.callNodes.length}`;

  let html = '';
  for (const node of state.callNodes) {
    const status = state.callStatus[node.id] || 'pending';
    const active = state.activeCallId === node.id ? ' active' : '';
    const resultCount = (state.callResults[node.id] || []).length;
    html += `
      <div class="call-item ${status}${active}" id="call-${node.id}" style="padding-left:${10 + node.depth * 16}px">
        <span class="call-title">F(${node.lo},${node.hi})</span>
        <span class="call-meta">${node.hi - node.lo + 1} pts</span>
        <span class="call-result">${status === 'complete' ? `${resultCount} max` : '-'}</span>
      </div>
    `;
  }
  listEl.innerHTML = html;

  if (state.activeCallId !== null) {
    const el = document.getElementById(`call-${state.activeCallId}`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderMergeInspector() {
  const mergeEl = document.getElementById('merge-inspector');
  const stepEl = document.getElementById('merge-step');
  if (!mergeEl || !stepEl) return;

  if (state.phase === 'draw' || state.trace.length === 0) {
    stepEl.textContent = '';
    mergeEl.innerHTML = '<div class="ev-empty">No active merge yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;

  const activeNode = state.activeCallId !== null ? state.callNodes[state.activeCallId] : null;
  const candidate = state.currentCandidateId !== null ? state.pointById.get(state.currentCandidateId) : null;
  const witness = state.currentWitnessId !== null ? state.pointById.get(state.currentWitnessId) : null;
  const resultIds = activeNode ? (state.callResults[activeNode.id] || []) : [];
  const rightIds = Array.from(state.rightSet);

  mergeEl.innerHTML = `
    <div class="mp-kv"><span>Active Call</span><strong>${activeNode ? `F(${activeNode.lo},${activeNode.hi})` : '-'}</strong></div>
    <div class="mp-kv"><span>Range</span><strong>${state.activeRange ? `[${state.activeRange.lo}..${state.activeRange.hi}]` : '-'}</strong></div>
    <div class="mp-kv"><span>Split Mid</span><strong>${state.splitMid !== null ? state.splitMid : '-'}</strong></div>
    <div class="mp-kv"><span>rightMaxY</span><strong>${state.rightMaxY !== null ? Math.round(state.rightMaxY) : '-'}</strong></div>
    <div class="mp-kv"><span>Candidate</span><strong>${candidate ? pointText(candidate) : '-'}</strong></div>
    <div class="mp-kv"><span>Witness</span><strong>${witness ? pointText(witness) : '-'}</strong></div>
    <div class="mp-kv"><span>Decision</span><strong>${decisionBadge(state.decision)}</strong></div>
    <div class="mp-block">
      <div class="mp-label">Right Maxima</div>
      <div class="mp-chip-row">${chipRow(rightIds)}</div>
    </div>
    <div class="mp-block">
      <div class="mp-label">Current Result</div>
      <div class="mp-chip-row">${chipRow(resultIds)}</div>
    </div>
  `;
}

function chipRow(ids) {
  if (!ids || ids.length === 0) {
    return '<span class="mp-chip mp-chip-empty">-</span>';
  }
  return ids
    .map(pid => `<span class="mp-chip">${pointTextShort(pid)}</span>`)
    .join('');
}

function decisionBadge(decision) {
  if (decision === 'keep') return '<span class="mp-decision keep">KEEP</span>';
  if (decision === 'drop') return '<span class="mp-decision drop">DROP</span>';
  return '<span class="mp-decision idle">-</span>';
}

function updateControls() {
  const run = document.getElementById('btn-run');
  const step = document.getElementById('btn-step');
  const play = document.getElementById('btn-play');
  const reset = document.getElementById('btn-reset');
  const undo = document.getElementById('btn-undo');
  const clear = document.getElementById('btn-clear');
  const example = document.getElementById('btn-example');
  const random = document.getElementById('btn-random');

  const drawing = state.phase === 'draw';
  const running = state.phase === 'running';

  run.disabled = !drawing || state.points.length === 0;
  step.disabled = !running || state.isPlaying || state.isStepping || state.trace.length === 0;
  play.disabled = !running || state.isStepping || state.trace.length === 0;
  play.textContent = state.isPlaying ? 'Pause' : 'Play';
  reset.disabled = drawing;

  undo.disabled = !drawing || state.points.length === 0;
  clear.disabled = !drawing || state.points.length === 0;
  example.disabled = !drawing;
  random.disabled = !drawing;

  canvas.style.cursor = drawing ? 'crosshair' : 'default';
}

function updateEmptyState() {
  els.emptyState.classList.toggle('hidden', state.points.length > 0);
}

function updateStatus(msg) {
  const el = document.getElementById('info-status');
  let badgeCls = 'drawing';
  let label = 'Draw';
  if (state.phase === 'running') {
    badgeCls = 'running';
    label = 'Running';
  } else if (state.phase === 'complete') {
    badgeCls = 'complete';
    label = 'Done';
  }
  el.innerHTML = `<span class="phase ${badgeCls}">${label}</span> ${msg}`;
}

function updateMetrics() {
  const pointsEl = document.getElementById('m-points');
  const callsEl = document.getElementById('m-calls');
  const depthEl = document.getElementById('m-depth');
  const maximalEl = document.getElementById('m-maximal');

  pointsEl.textContent = `${state.points.length}`;

  if (state.callNodes.length === 0) {
    callsEl.textContent = '-';
  } else {
    callsEl.textContent = `${completedCalls()}/${state.callNodes.length}`;
  }

  if (state.phase === 'draw' || state.callNodes.length === 0) {
    depthEl.textContent = '-';
  } else if (state.phase === 'running' && state.activeCallId !== null) {
    depthEl.textContent = `${state.callNodes[state.activeCallId].depth}`;
  } else {
    depthEl.textContent = `${maxDepth()}`;
  }

  if (state.phase === 'draw') {
    maximalEl.textContent = '-';
  } else if (state.phase === 'complete') {
    maximalEl.textContent = `${state.finalMaxSet.size}`;
  } else {
    maximalEl.textContent = `${Math.max(0, state.points.length - state.dominatedSet.size)}`;
  }
}

function completedCalls() {
  return Object.values(state.callStatus).filter(s => s === 'complete').length;
}

function maxDepth() {
  let d = 0;
  for (const node of state.callNodes) {
    if (node.depth > d) d = node.depth;
  }
  return d;
}

function rebuildPointMaps() {
  state.pointById = new Map(state.points.map(p => [p.id, p]));
}

function rebuildInsertionOrder() {
  state.pointOrder = new Map(state.points.map((p, i) => [p.id, i]));
}

function rebuildSortedOrder() {
  state.pointOrder = new Map(state.sortedPoints.map((p, i) => [p.id, i]));
}

function toScreenY(y) {
  return ch - y;
}

function pointText(p) {
  const idx = state.pointOrder.get(p.id);
  const name = idx !== undefined ? `P${idx + 1}` : `P${p.id}`;
  return `${name} (${Math.round(p.x)}, ${Math.round(p.y)})`;
}

function pointTextShort(idValue) {
  if (idValue === null || idValue === undefined) return '-';
  const p = state.pointById.get(idValue);
  if (!p) return '-';
  const idx = state.pointOrder.get(idValue);
  return idx !== undefined ? `P${idx + 1}` : `P${idValue}`;
}

function eventCallRange(callId) {
  const node = state.callNodes[callId];
  return node ? `${node.lo},${node.hi}` : '?';
}

function isNearExistingPoint(x, y, minDist) {
  const d2 = minDist * minDist;
  for (const p of state.points) {
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy < d2) return true;
  }
  return false;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}
