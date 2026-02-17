export const id = 'maximal-points-sweep-line';
export const title = 'Maximal Points in 2D';
export const categories = ['sweep-line'];
export const badge = 'Sweep Line';

const EPS = 1e-9;

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let animFrameId, animResolve, delayTimer, delayResolve;
let prevDsPanelWidth = '';

function on(el, event, handler) {
  el.addEventListener(event, handler);
  listeners.push({ el, event, handler });
}

export function init(elements) {
  els = elements;
  listeners = [];
  animFrameId = null;
  animResolve = null;
  delayTimer = null;
  delayResolve = null;

  state = {
    points: [],
    pointById: new Map(),
    pointOrder: new Map(),
    nextId: 0,
    phase: 'draw',

    sortedPoints: [],
    groups: [],
    trace: [],
    completedGroups: new Set(),
    currentGroupIdx: -1,
    currentGroupIds: new Set(),
    currentStep: -1,
    currentEvent: null,
    sweepX: null,
    rightMaxY: null,
    rightMaxWitnessId: null,
    currentCandidateId: null,
    currentWitnessId: null,
    decision: null,
    processedIds: new Set(),
    dominatedIds: new Set(),
    maximalIds: new Set(),

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
  updateStatus('Click to place points, then visualize the right-to-left sweep.');
  updateMetrics();
  renderEventList();
  renderSweepState();
  render();
}

export function destroy() {
  cancelPlayback();
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
    <div class="ds-section">
      <div class="ds-header">
        <span>Event Queue</span>
        <span class="ds-count" id="ev-count"></span>
      </div>
      <div id="event-list">
        <div class="ev-empty">Place points, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section">
      <div class="ds-header">
        <span>Sweep State</span>
        <span class="ds-count" id="max-count"></span>
      </div>
      <div id="sweep-state" class="mp-inspector">
        <div class="ev-empty">No active sweep yet</div>
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
      <div class="info-metric"><span class="label">Groups</span><span class="value" id="m-groups">-</span></div>
      <div class="info-metric"><span class="label">Processed</span><span class="value" id="m-processed">-</span></div>
      <div class="info-metric"><span class="label">Maximal</span><span class="value" id="m-maximal">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Maximal Points: Sweep Line</div>
    <div class="es-sub">Click to place points, then click Find Maximal to run the algorithm</div>
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
  drawSweepBand();
  drawRightThreshold();
  drawDominanceRegion();
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

function drawSweepBand() {
  if (state.phase === 'draw' || state.sweepX === null) return;
  ctx.fillStyle = 'rgba(239,83,80,0.06)';
  ctx.fillRect(state.sweepX, 0, cw - state.sweepX, ch);

  ctx.strokeStyle = '#ef5350';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(state.sweepX, 0);
  ctx.lineTo(state.sweepX, ch);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ef5350';
  ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText('sweep', state.sweepX + 5, 16);
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

function drawDominanceRegion() {
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
    const style = pointStyle(p.id);
    const sx = p.x;
    const sy = toScreenY(p.y);

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
  if (state.maximalIds.size < 2) return;
  const pts = state.sortedPoints.filter(p => state.maximalIds.has(p.id));
  if (pts.length < 2) return;

  ctx.strokeStyle = state.phase === 'complete'
    ? 'rgba(124,77,255,0.65)'
    : 'rgba(124,77,255,0.35)';
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

function pointStyle(idValue) {
  const s = {
    fill: '#8f95ad',
    stroke: '#2f344a',
    r: 5,
    lineWidth: 1.5,
    alpha: 1,
    shadow: null,
    outerRing: null,
  };

  if (state.phase === 'complete') {
    if (state.maximalIds.has(idValue)) {
      s.fill = '#7c4dff';
      s.stroke = '#c6b6ff';
      s.shadow = '#7c4dff';
      s.r = 6;
    } else {
      s.fill = 'rgba(143,149,173,0.35)';
      s.stroke = 'rgba(47,52,74,0.5)';
      s.alpha = 0.7;
    }
    return s;
  }

  if (state.currentCandidateId === idValue) {
    s.fill = '#ffca28';
    s.stroke = '#fff176';
    s.shadow = '#ffca28';
    s.r = 6;
    return s;
  }

  if (state.dominatedIds.has(idValue)) {
    s.fill = 'rgba(239,83,80,0.58)';
    s.stroke = '#ef5350';
    s.alpha = 0.9;
  } else if (state.maximalIds.has(idValue)) {
    s.fill = '#66bb6a';
    s.stroke = '#a5d6a7';
    s.shadow = '#66bb6a';
    s.r = 5.5;
  } else if (state.currentGroupIds.has(idValue)) {
    s.fill = '#4fc3f7';
    s.stroke = '#81d4fa';
  } else if (state.processedIds.has(idValue)) {
    s.fill = 'rgba(143,149,173,0.45)';
    s.stroke = 'rgba(47,52,74,0.6)';
    s.alpha = 0.85;
  }

  if (state.currentWitnessId === idValue) {
    s.outerRing = '#ffffff';
  }
  return s;
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

  const built = buildSweepTrace(state.sortedPoints);
  state.groups = built.groups;
  state.trace = built.trace;
  state.completedGroups = new Set();
  state.currentGroupIdx = -1;
  state.currentGroupIds = new Set();
  state.currentStep = -1;
  state.currentEvent = null;
  state.sweepX = null;
  state.rightMaxY = null;
  state.rightMaxWitnessId = null;
  state.currentCandidateId = null;
  state.currentWitnessId = null;
  state.decision = null;
  state.processedIds = new Set();
  state.dominatedIds = new Set();
  state.maximalIds = new Set();

  updateControls();
  updateStatus('Points sorted by x and relabeled as #1 to #n. Sweep right-to-left with rightMaxY.');
  updateMetrics();
  renderEventList();
  renderSweepState();
  render();
}

function buildSweepTrace(sortedPoints) {
  const byId = new Map(sortedPoints.map(p => [p.id, p]));
  const desc = sortedPoints
    .slice()
    .sort((a, b) => b.x - a.x || b.y - a.y || a.id - b.id);
  const groups = buildGroups(desc, byId);

  const trace = [];
  let rightMaxY = -Infinity;
  let rightMaxWitnessId = null;

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    trace.push({
      type: 'enter-group',
      groupIdx: gi,
      x: g.x,
      pointIds: g.pointIds.slice(),
      rightMaxY: Number.isFinite(rightMaxY) ? rightMaxY : null,
      rightMaxWitnessId,
    });

    for (const pid of g.pointIds) {
      const p = byId.get(pid);
      if (!p) continue;
      const dominatedBySame = p.y < g.groupMaxY - EPS;
      const dominatedByRight = Number.isFinite(rightMaxY) && rightMaxY >= p.y - EPS;
      const dominated = dominatedBySame || dominatedByRight;

      let witnessId = null;
      let reason = 'none';
      if (dominatedBySame) {
        witnessId = g.groupMaxIds[0] || null;
        reason = 'same-x';
      } else if (dominatedByRight) {
        witnessId = rightMaxWitnessId;
        reason = 'right';
      }

      trace.push({
        type: 'check-point',
        groupIdx: gi,
        pointId: pid,
        dominated,
        reason,
        witnessId,
        rightMaxY: Number.isFinite(rightMaxY) ? rightMaxY : null,
      });
      trace.push({
        type: dominated ? 'drop-point' : 'keep-point',
        groupIdx: gi,
        pointId: pid,
        witnessId,
        reason,
      });
    }

    if (g.groupMaxY > rightMaxY + EPS) {
      rightMaxY = g.groupMaxY;
      rightMaxWitnessId = g.groupMaxIds[0] || rightMaxWitnessId;
    } else if (!Number.isFinite(rightMaxY)) {
      rightMaxY = g.groupMaxY;
      rightMaxWitnessId = g.groupMaxIds[0] || null;
    }

    trace.push({
      type: 'group-done',
      groupIdx: gi,
      x: g.x,
      rightMaxY: Number.isFinite(rightMaxY) ? rightMaxY : null,
      rightMaxWitnessId,
    });
  }

  return { groups, trace };
}

function buildGroups(descPoints, byId) {
  const groups = [];
  for (const p of descPoints) {
    const last = groups[groups.length - 1];
    if (!last || Math.abs(last.x - p.x) > EPS) {
      groups.push({ x: p.x, pointIds: [p.id], groupMaxY: p.y, groupMaxIds: [p.id] });
    } else {
      last.pointIds.push(p.id);
    }
  }

  for (const g of groups) {
    g.pointIds.sort((idA, idB) => {
      const a = byId.get(idA);
      const b = byId.get(idB);
      if (!a || !b) return 0;
      return b.y - a.y || a.id - b.id;
    });
    g.groupMaxY = -Infinity;
    for (const pid of g.pointIds) {
      const p = byId.get(pid);
      if (p && p.y > g.groupMaxY) g.groupMaxY = p.y;
    }
    g.groupMaxIds = g.pointIds.filter(pid => {
      const p = byId.get(pid);
      return p && Math.abs(p.y - g.groupMaxY) <= EPS;
    });
  }
  return groups;
}

function applyEvent(ev) {
  state.currentEvent = ev;

  switch (ev.type) {
    case 'enter-group':
      state.currentGroupIdx = ev.groupIdx;
      state.currentGroupIds = new Set(ev.pointIds);
      state.sweepX = ev.x;
      state.rightMaxY = ev.rightMaxY;
      state.rightMaxWitnessId = ev.rightMaxWitnessId;
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      updateStatus(`Sweep at x=${Math.round(ev.x)}: processing ${ev.pointIds.length} point(s)`);
      break;

    case 'check-point':
      state.currentCandidateId = ev.pointId;
      state.currentWitnessId = ev.witnessId;
      state.decision = ev.dominated ? 'drop' : 'keep';
      if (ev.dominated) {
        const reason = ev.reason === 'same-x'
          ? 'dominated by a higher point at the same x'
          : `dominated by right region (rightMaxY=${Math.round(ev.rightMaxY || 0)})`;
        updateStatus(`${pointTextShort(ev.pointId)} is ${reason}`);
      } else {
        updateStatus(`${pointTextShort(ev.pointId)} survives and becomes maximal so far`);
      }
      break;

    case 'drop-point':
      state.processedIds.add(ev.pointId);
      state.dominatedIds.add(ev.pointId);
      state.currentCandidateId = ev.pointId;
      state.currentWitnessId = ev.witnessId;
      state.decision = 'drop';
      updateStatus(`Drop ${pointTextShort(ev.pointId)}`);
      break;

    case 'keep-point':
      state.processedIds.add(ev.pointId);
      state.maximalIds.add(ev.pointId);
      state.currentCandidateId = ev.pointId;
      state.currentWitnessId = null;
      state.decision = 'keep';
      updateStatus(`Keep ${pointTextShort(ev.pointId)} as maximal`);
      break;

    case 'group-done':
      state.completedGroups.add(ev.groupIdx);
      state.currentGroupIds = new Set();
      state.currentCandidateId = null;
      state.currentWitnessId = null;
      state.decision = null;
      state.rightMaxY = ev.rightMaxY;
      state.rightMaxWitnessId = ev.rightMaxWitnessId;
      updateStatus(`Group at x=${Math.round(ev.x)} complete`);
      break;
  }

  renderEventList();
  renderSweepState();
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
    const ev = state.trace[state.currentStep];
    if (ev.type === 'enter-group') {
      await animateSweepTo(ev.x);
      if (state.phase !== 'running') return;
    }
    applyEvent(ev);
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
    cancelPlayback();
    updateControls();
    return;
  }

  state.isPlaying = true;
  updateControls();

  while (state.isPlaying && state.currentStep < state.trace.length - 1) {
    state.currentStep += 1;
    const ev = state.trace[state.currentStep];
    if (ev.type === 'enter-group') {
      await animateSweepTo(ev.x);
      if (!state.isPlaying || state.phase !== 'running') break;
    }
    applyEvent(ev);
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
  cancelPlayback();
  state.phase = 'complete';
  state.isPlaying = false;
  state.isStepping = false;
  state.currentCandidateId = null;
  state.currentWitnessId = null;
  state.currentGroupIds = new Set();
  state.currentGroupIdx = -1;
  state.sweepX = null;
  state.decision = null;

  const n = state.maximalIds.size;
  updateStatus(`Complete: ${n} maximal point${n !== 1 ? 's' : ''} out of ${state.points.length}`);
  updateControls();
  updateMetrics();
  renderEventList();
  renderSweepState();
  render();
}

function animateSweepTo(targetX) {
  return new Promise(resolve => {
    const startX = state.sweepX !== null ? state.sweepX : targetX;
    const dist = Math.abs(targetX - startX);
    if (dist < 1) {
      state.sweepX = targetX;
      render();
      resolve();
      return;
    }

    const duration = Math.min(dist * (2.5 / state.speed), 400);
    const t0 = performance.now();
    animResolve = resolve;

    function frame(now) {
      const t = Math.min((now - t0) / duration, 1);
      state.sweepX = startX + (targetX - startX) * (t * (2 - t));
      render();
      if (t < 1) {
        animFrameId = requestAnimationFrame(frame);
      } else {
        animResolve = null;
        resolve();
      }
    }

    animFrameId = requestAnimationFrame(frame);
  });
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

function cancelAnim() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (animResolve) {
    animResolve();
    animResolve = null;
  }
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

function cancelPlayback() {
  cancelAnim();
  cancelDelay();
}

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

function resetVisualization() {
  cancelPlayback();
  state.phase = 'draw';
  state.sortedPoints = [];
  state.groups = [];
  state.trace = [];
  state.completedGroups = new Set();
  state.currentGroupIdx = -1;
  state.currentGroupIds = new Set();
  state.currentStep = -1;
  state.currentEvent = null;
  state.sweepX = null;
  state.rightMaxY = null;
  state.rightMaxWitnessId = null;
  state.currentCandidateId = null;
  state.currentWitnessId = null;
  state.decision = null;
  state.processedIds = new Set();
  state.dominatedIds = new Set();
  state.maximalIds = new Set();
  state.isPlaying = false;
  state.isStepping = false;
  rebuildInsertionOrder();
  updateControls();
  updateStatus('Click to place points, then visualize the right-to-left sweep.');
  updateMetrics();
  renderEventList();
  renderSweepState();
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
    [0.10, 0.22],
    [0.16, 0.54],
    [0.23, 0.31],
    [0.30, 0.67],
    [0.39, 0.44],
    [0.49, 0.77],
    [0.58, 0.58],
    [0.65, 0.71],
    [0.75, 0.83],
    [0.82, 0.60],
    [0.90, 0.91],
    [0.92, 0.72],
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

function renderEventList() {
  const listEl = document.getElementById('event-list');
  const countEl = document.getElementById('ev-count');
  if (!listEl || !countEl) return;

  if (state.groups.length === 0) {
    listEl.innerHTML = '<div class="ev-empty">Place points, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.completedGroups.size}/${state.groups.length}`;

  let html = '';
  for (let i = 0; i < state.groups.length; i++) {
    const g = state.groups[i];
    let cls = 'ev-item';
    if (state.completedGroups.has(i)) cls += ' ev-processed';
    if (i === state.currentGroupIdx && !state.completedGroups.has(i)) cls += ' ev-current';

    html += `
      <div class="${cls}" id="ev-${i}">
        <span class="ev-icon ev-vert">x</span>
        <span class="ev-text">x=${Math.round(g.x)} (${g.pointIds.length} pt${g.pointIds.length !== 1 ? 's' : ''})</span>
        <span class="ev-x">maxY=${Math.round(g.groupMaxY)}</span>
      </div>
    `;
  }
  listEl.innerHTML = html;

  if (state.currentGroupIdx >= 0) {
    const el = document.getElementById(`ev-${state.currentGroupIdx}`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderSweepState() {
  const panel = document.getElementById('sweep-state');
  const countEl = document.getElementById('max-count');
  if (!panel || !countEl) return;

  if (state.phase === 'draw') {
    countEl.textContent = '';
    panel.innerHTML = '<div class="ev-empty">No active sweep yet</div>';
    return;
  }

  countEl.textContent = `${state.maximalIds.size} max`;

  const candidate = state.currentCandidateId !== null ? state.pointById.get(state.currentCandidateId) : null;
  const witness = state.currentWitnessId !== null ? state.pointById.get(state.currentWitnessId) : null;
  const maxIds = state.sortedPoints.filter(p => state.maximalIds.has(p.id)).map(p => p.id);

  panel.innerHTML = `
    <div class="mp-kv"><span>Sweep X</span><strong>${state.sweepX !== null ? Math.round(state.sweepX) : '-'}</strong></div>
    <div class="mp-kv"><span>rightMaxY</span><strong>${state.rightMaxY !== null ? Math.round(state.rightMaxY) : '-'}</strong></div>
    <div class="mp-kv"><span>Candidate</span><strong>${candidate ? pointText(candidate) : '-'}</strong></div>
    <div class="mp-kv"><span>Witness</span><strong>${witness ? pointText(witness) : '-'}</strong></div>
    <div class="mp-kv"><span>Decision</span><strong>${decisionBadge(state.decision)}</strong></div>
    <div class="mp-kv"><span>Processed</span><strong>${state.processedIds.size}/${state.points.length}</strong></div>
    <div class="mp-block">
      <div class="mp-label">Maximal Set</div>
      <div class="mp-chip-row">${chipRow(maxIds)}</div>
    </div>
  `;
}

function chipRow(ids) {
  if (!ids || ids.length === 0) {
    return '<span class="mp-chip mp-chip-empty">-</span>';
  }
  return ids.map(pid => `<span class="mp-chip">${pointTextShort(pid)}</span>`).join('');
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
  const groupsEl = document.getElementById('m-groups');
  const processedEl = document.getElementById('m-processed');
  const maximalEl = document.getElementById('m-maximal');

  pointsEl.textContent = `${state.points.length}`;
  groupsEl.textContent = state.groups.length > 0
    ? `${state.completedGroups.size}/${state.groups.length}`
    : '-';
  processedEl.textContent = state.phase === 'draw'
    ? '-'
    : `${state.processedIds.size}/${state.points.length}`;
  maximalEl.textContent = state.phase === 'draw'
    ? '-'
    : `${state.maximalIds.size}`;
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
