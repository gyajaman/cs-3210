export const id = 'sweep-line-intersections';
export const title = 'Orthogonal Line Intersections';
export const category = 'sweep-line';
export const badge = 'Sweep Line';

let els, canvas, ctx, bstCanvas, bctx, bstContainer;
let cw, ch, bw, bh, dpr;
let state, listeners;
let animFrameId, animResolve, delayTimer, delayResolve;

function on(el, event, handler) {
  el.addEventListener(event, handler);
  listeners.push({ el, event, handler });
}

export function init(elements) {
  els = elements;
  listeners = [];
  animFrameId = animResolve = delayTimer = delayResolve = null;

  state = {
    lines: [],
    nextId: 0,
    phase: 'draw',
    isDrawing: false,
    drawStart: null,
    previewEnd: null,
    events: [],
    currentIdx: -1,
    sweepX: null,
    activeSet: [],
    activeLineIds: new Set(),
    foundIntersections: [],
    currentEvent: null,
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
  renderBST();
  render();
}

export function destroy() {
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
  els = canvas = ctx = bstCanvas = bctx = bstContainer = null;
}

function setupDOM() {
  els.toolbarControls.innerHTML = `
    <button id="btn-example">Example</button>
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
        <span class="ds-count" id="eq-count"></span>
      </div>
      <div id="event-list">
        <div class="ev-empty">Draw lines then click Visualize</div>
      </div>
    </div>
    <div class="ds-section">
      <div class="ds-header">
        <span>Active Set (Balanced BST)</span>
        <span class="ds-count" id="bst-count"></span>
      </div>
      <div id="bst-container">
        <canvas id="bst-canvas"></canvas>
        <div class="bst-empty" id="bst-empty">BST will appear during visualization</div>
        <div class="bst-range-label" id="bst-range" style="display:none"></div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Draw</span>
      Draw lines on the canvas, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Lines</span><span class="value" id="m-lines">0</span></div>
      <div class="info-metric"><span class="label">Events</span><span class="value" id="m-events">-</span></div>
      <div class="info-metric"><span class="label">Active</span><span class="value" id="m-active">-</span></div>
      <div class="info-metric"><span class="label">Intersections</span><span class="value" id="m-inter">0</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Orthogonal Line Intersections</div>
    <div class="es-sub">Click and drag to draw lines, then click Find Intersections</div>
  `;

  canvas = els.canvas;
  ctx = canvas.getContext('2d');
  bstContainer = document.getElementById('bst-container');
  bstCanvas = document.getElementById('bst-canvas');
  bctx = bstCanvas.getContext('2d');
}

function setupCanvas() {
  dpr = window.devicePixelRatio || 1;

  const rect = els.canvasContainer.getBoundingClientRect();
  cw = rect.width; ch = rect.height;
  canvas.width = cw * dpr; canvas.height = ch * dpr;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const brect = bstContainer.getBoundingClientRect();
  bw = brect.width; bh = brect.height;
  bstCanvas.width = bw * dpr; bstCanvas.height = bh * dpr;
  bstCanvas.style.width = bw + 'px'; bstCanvas.style.height = bh + 'px';
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function bindEvents() {
  on(canvas, 'mousedown', handleMouseDown);
  on(canvas, 'mousemove', handleMouseMove);
  on(canvas, 'mouseup', handleMouseUp);
  on(canvas, 'mouseleave', handleMouseLeave);
  on(window, 'resize', handleResize);
  on(document.getElementById('btn-example'), 'click', loadExample);
  on(document.getElementById('btn-undo'), 'click', undoLine);
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
  renderBST();
}

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function handleMouseDown(e) {
  if (state.phase !== 'draw') return;
  state.isDrawing = true;
  state.drawStart = getPos(e);
  state.previewEnd = state.drawStart;
}

function handleMouseMove(e) {
  if (!state.isDrawing) return;
  state.previewEnd = getPos(e);
  render();
}

function handleMouseUp(e) {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  const end = getPos(e);
  const dx = Math.abs(end.x - state.drawStart.x);
  const dy = Math.abs(end.y - state.drawStart.y);
  if (Math.max(dx, dy) < 15) { state.previewEnd = null; render(); return; }

  const id = state.nextId++;
  if (dx >= dy) {
    const x1 = Math.min(state.drawStart.x, end.x);
    const x2 = Math.max(state.drawStart.x, end.x);
    state.lines.push({ id, type: 'h', y: state.drawStart.y, x1, x2 });
  } else {
    const y1 = Math.min(state.drawStart.y, end.y);
    const y2 = Math.max(state.drawStart.y, end.y);
    state.lines.push({ id, type: 'v', x: state.drawStart.x, y1, y2 });
  }
  state.previewEnd = null;
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function handleMouseLeave() {
  if (state.isDrawing) {
    state.isDrawing = false;
    state.previewEnd = null;
    render();
  }
}

/* ── Rendering ── */

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();

  for (const line of state.lines) {
    const isActive = state.activeLineIds.has(line.id);
    const isCurrent = state.currentEvent && state.currentEvent.lineId === line.id;
    drawSegment(line, isActive, isCurrent);
  }

  if (state.sweepX !== null) drawSweepLine();
  for (const pt of state.foundIntersections) drawIntersectionMarker(pt);
  if (state.phase === 'running' || state.phase === 'complete') drawEventTicks();

  if (state.isDrawing && state.previewEnd) {
    const snap = snapLine(state.drawStart, state.previewEnd);
    ctx.strokeStyle = snap.type === 'h' ? 'rgba(79,195,247,0.5)' : 'rgba(102,187,106,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(snap.x1, snap.y1);
    ctx.lineTo(snap.x2, snap.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function snapLine(start, end) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx >= dy) return { x1: start.x, y1: start.y, x2: end.x, y2: start.y, type: 'h' };
  return { x1: start.x, y1: start.y, x2: start.x, y2: end.y, type: 'v' };
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const sp = 50;
  for (let x = sp; x < cw; x += sp) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
  for (let y = sp; y < ch; y += sp) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
}

function drawSegment(line, isActive, isCurrent) {
  let color;
  if (isCurrent && state.currentEvent && state.currentEvent.type === 'vertical') {
    color = '#fff176'; ctx.lineWidth = 3;
  } else if (isActive) {
    color = '#ce93d8'; ctx.lineWidth = 3;
    ctx.shadowColor = '#ce93d8'; ctx.shadowBlur = 6;
  } else {
    color = line.type === 'h' ? '#4fc3f7' : '#66bb6a'; ctx.lineWidth = 2;
  }
  ctx.strokeStyle = color;
  ctx.beginPath();
  if (line.type === 'h') { ctx.moveTo(line.x1, line.y); ctx.lineTo(line.x2, line.y); }
  else { ctx.moveTo(line.x, line.y1); ctx.lineTo(line.x, line.y2); }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  if (line.type === 'h') { dot(ctx, line.x1, line.y, 3); dot(ctx, line.x2, line.y, 3); }
  else { dot(ctx, line.x, line.y1, 3); dot(ctx, line.x, line.y2, 3); }
}

function dot(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

function drawSweepLine() {
  ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(state.sweepX, 0); ctx.lineTo(state.sweepX, ch); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(239,83,80,0.06)';
  ctx.fillRect(0, 0, state.sweepX, ch);
  ctx.fillStyle = '#ef5350';
  ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText('sweep', state.sweepX + 5, 16);
}

function drawIntersectionMarker(pt) {
  ctx.fillStyle = '#ffca28'; ctx.shadowColor = '#ffca28'; ctx.shadowBlur = 10;
  dot(ctx, pt.x, pt.y, 5);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,202,40,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2); ctx.stroke();
}

function drawEventTicks() {
  const y = ch - 8;
  for (let i = 0; i < state.events.length; i++) {
    let color = i < state.currentIdx ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
    if (i === state.currentIdx) color = '#ef5350';
    ctx.fillStyle = color;
    ctx.fillRect(state.events[i].x - 1, y - 4, 2, 8);
  }
}

/* ── Algorithm ── */

function buildEvents() {
  const events = [];
  for (const line of state.lines) {
    if (line.type === 'h') {
      events.push({ type: 'start', x: line.x1, y: line.y, lineId: line.id });
      events.push({ type: 'end', x: line.x2, y: line.y, lineId: line.id });
    } else {
      events.push({ type: 'vertical', x: line.x, y1: line.y1, y2: line.y2, lineId: line.id });
    }
  }
  const order = { start: 0, vertical: 1, end: 2 };
  events.sort((a, b) => a.x !== b.x ? a.x - b.x : order[a.type] - order[b.type]);
  return events;
}

function processEvent(ev) {
  state.currentEvent = ev;
  switch (ev.type) {
    case 'start':
      state.activeSet.push({ y: ev.y, lineId: ev.lineId });
      state.activeSet.sort((a, b) => a.y - b.y);
      state.activeLineIds.add(ev.lineId);
      break;
    case 'end':
      state.activeSet = state.activeSet.filter(item => item.lineId !== ev.lineId);
      state.activeLineIds.delete(ev.lineId);
      break;
    case 'vertical':
      for (const item of state.activeSet) {
        if (item.y >= ev.y1 && item.y <= ev.y2) {
          state.foundIntersections.push({ x: ev.x, y: item.y });
        }
      }
      break;
  }
}

/* ── Animation ── */

function animateSweepTo(targetX) {
  return new Promise(resolve => {
    const startX = state.sweepX != null ? state.sweepX : targetX;
    const dist = Math.abs(targetX - startX);
    if (dist < 1) { state.sweepX = targetX; render(); resolve(); return; }
    const duration = Math.min(dist * (2.5 / state.speed), 400);
    const t0 = performance.now();
    animResolve = resolve;
    function frame(now) {
      const t = Math.min((now - t0) / duration, 1);
      state.sweepX = startX + (targetX - startX) * (t * (2 - t));
      render();
      if (t < 1) animFrameId = requestAnimationFrame(frame);
      else { animResolve = null; resolve(); }
    }
    animFrameId = requestAnimationFrame(frame);
  });
}

function cancelAnim() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (animResolve) { animResolve(); animResolve = null; }
  if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
  if (delayResolve) { delayResolve(); delayResolve = null; }
}

function delay(ms) {
  return new Promise(resolve => {
    delayResolve = resolve;
    delayTimer = setTimeout(() => { delayResolve = null; resolve(); }, ms);
  });
}

/* ── Controls ── */

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value);
  state.animDelay = 1200 / state.speed;
}

function startVisualization() {
  if (state.lines.length === 0) return;
  state.phase = 'running';
  state.events = buildEvents();
  state.currentIdx = -1;
  state.sweepX = null;
  state.activeSet = [];
  state.activeLineIds = new Set();
  state.foundIntersections = [];
  state.currentEvent = null;
  state.isPlaying = false;
  updateControls();
  updateStatus('Step through events or press Play');
  updateMetrics();
  renderEventList();
  renderBST();
  render();
}

async function stepForward() {
  if (state.phase !== 'running' || state.isPlaying || state.isStepping) return;
  if (state.currentIdx >= state.events.length - 1) { finishVisualization(); return; }
  state.isStepping = true;
  updateControls();
  try {
    state.currentIdx++;
    const ev = state.events[state.currentIdx];
    state.currentEvent = ev;
    await animateSweepTo(ev.x);
    processEvent(ev);
    render();
    renderEventList();
    renderBST();
    updateEventStatus(ev);
    updateMetrics();
    if (state.currentIdx >= state.events.length - 1) finishVisualization();
  } finally {
    state.isStepping = false;
    updateControls();
  }
}

async function togglePlay() {
  if (state.isPlaying) { state.isPlaying = false; cancelAnim(); updateControls(); return; }
  state.isPlaying = true;
  updateControls();
  while (state.isPlaying && state.currentIdx < state.events.length - 1) {
    state.currentIdx++;
    const ev = state.events[state.currentIdx];
    state.currentEvent = ev;
    if (!state.isPlaying) break;
    await animateSweepTo(ev.x);
    if (!state.isPlaying) break;
    processEvent(ev);
    render();
    renderEventList();
    renderBST();
    updateEventStatus(ev);
    updateMetrics();
    if (state.currentIdx >= state.events.length - 1) { finishVisualization(); return; }
    if (!state.isPlaying) break;
    await delay(state.animDelay);
    if (!state.isPlaying) break;
  }
  state.isPlaying = false;
  updateControls();
}

function finishVisualization() {
  state.phase = 'complete';
  state.isPlaying = false;
  state.sweepX = null;
  state.currentEvent = null;
  render();
  renderBST();
  updateControls();
  const n = state.foundIntersections.length;
  updateStatus(`Complete: found ${n} intersection${n !== 1 ? 's' : ''} among ${state.lines.length} segments`);
}

function resetVisualization() {
  cancelAnim();
  state.phase = 'draw';
  state.events = [];
  state.currentIdx = -1;
  state.sweepX = null;
  state.activeSet = [];
  state.activeLineIds = new Set();
  state.foundIntersections = [];
  state.currentEvent = null;
  state.isPlaying = false;
  state.isStepping = false;
  updateControls();
  updateStatus('Draw lines on the canvas, then click Visualize');
  updateMetrics();
  renderEventList();
  renderBST();
  render();
}

function undoLine() {
  if (state.phase !== 'draw' || state.lines.length === 0) return;
  state.lines.pop();
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function clearAll() {
  if (state.phase !== 'draw') resetVisualization();
  state.lines = [];
  state.nextId = 0;
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

function loadExample() {
  if (state.phase !== 'draw') resetVisualization();
  state.lines = [];
  state.nextId = 0;
  const ox = Math.max(0, (cw - 700) / 2);
  const oy = Math.max(0, (ch - 500) / 2);
  const ex = [
    { type: 'h', y: oy + 80,  x1: ox + 80,  x2: ox + 520 },
    { type: 'h', y: oy + 180, x1: ox + 150, x2: ox + 650 },
    { type: 'h', y: oy + 280, x1: ox + 50,  x2: ox + 400 },
    { type: 'h', y: oy + 350, x1: ox + 250, x2: ox + 700 },
    { type: 'h', y: oy + 430, x1: ox + 100, x2: ox + 550 },
    { type: 'v', x: ox + 200, y1: oy + 50,  y2: oy + 460 },
    { type: 'v', x: ox + 380, y1: oy + 120, y2: oy + 400 },
    { type: 'v', x: ox + 550, y1: oy + 60,  y2: oy + 480 },
  ];
  for (const l of ex) { l.id = state.nextId++; state.lines.push(l); }
  updateEmptyState();
  updateMetrics();
  updateControls();
  render();
}

/* ── Event List ── */

function renderEventList() {
  const listEl = document.getElementById('event-list');
  const countEl = document.getElementById('eq-count');

  if (state.events.length === 0) {
    listEl.innerHTML = '<div class="ev-empty">Draw lines then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = state.currentIdx >= 0
    ? `${state.currentIdx + 1} / ${state.events.length}`
    : `${state.events.length} events`;

  let html = '';
  for (let i = 0; i < state.events.length; i++) {
    const ev = state.events[i];
    let cls = 'ev-item';
    if (i < state.currentIdx) cls += ' ev-processed';
    if (i === state.currentIdx) cls += ' ev-current';

    let icon, text;
    if (ev.type === 'start') {
      icon = '<span class="ev-icon ev-start">+</span>';
      text = `INSERT y=${Math.round(ev.y)}`;
    } else if (ev.type === 'end') {
      icon = '<span class="ev-icon ev-end">&minus;</span>';
      text = `DELETE y=${Math.round(ev.y)}`;
    } else {
      icon = '<span class="ev-icon ev-vert">Q</span>';
      text = `QUERY [${Math.round(ev.y1)},${Math.round(ev.y2)}]`;
    }
    html += `<div class="${cls}" id="ev-${i}">${icon}<span class="ev-text">${text}</span><span class="ev-x">x=${Math.round(ev.x)}</span></div>`;
  }
  listEl.innerHTML = html;

  if (state.currentIdx >= 0) {
    const el = document.getElementById(`ev-${state.currentIdx}`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ── BST Visualization ── */

function buildBalancedBST(arr, lo, hi) {
  if (lo > hi) return null;
  const mid = Math.floor((lo + hi) / 2);
  return {
    value: arr[mid].y,
    lineId: arr[mid].lineId,
    left: buildBalancedBST(arr, lo, mid - 1),
    right: buildBalancedBST(arr, mid + 1, hi),
  };
}

function getTreeDepth(node) {
  if (!node) return 0;
  return 1 + Math.max(getTreeDepth(node.left), getTreeDepth(node.right));
}

function renderBST() {
  bctx.clearRect(0, 0, bw, bh);
  const emptyEl = document.getElementById('bst-empty');
  const rangeEl = document.getElementById('bst-range');
  const countEl = document.getElementById('bst-count');

  if (state.phase === 'draw') {
    emptyEl.style.display = 'block';
    emptyEl.textContent = 'BST will appear during visualization';
    rangeEl.style.display = 'none';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.activeSet.length} node${state.activeSet.length !== 1 ? 's' : ''}`;

  if (state.activeSet.length === 0) {
    emptyEl.style.display = 'block';
    emptyEl.textContent = state.phase === 'complete' ? 'Empty (all removed)' : 'Empty';
    rangeEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';

  const tree = buildBalancedBST(state.activeSet, 0, state.activeSet.length - 1);
  const depth = getTreeDepth(tree);
  const nodeR = Math.max(10, Math.min(18, bw / (Math.pow(2, depth) * 2.5)));
  const levelH = Math.min(52, (bh - 30) / Math.max(depth, 1));
  const startY = nodeR + 12;

  let queryRange = null;
  let insertedY = null;

  if (state.currentEvent) {
    if (state.currentEvent.type === 'vertical') {
      queryRange = { y1: state.currentEvent.y1, y2: state.currentEvent.y2 };
    } else if (state.currentEvent.type === 'start') {
      insertedY = state.currentEvent.y;
    }
  }

  drawBSTNode(tree, bw / 2, startY, bw / 4, levelH, nodeR, queryRange, insertedY);

  if (queryRange) {
    rangeEl.style.display = 'block';
    rangeEl.textContent = `Range query: y \u2208 [${Math.round(queryRange.y1)}, ${Math.round(queryRange.y2)}]`;
  } else {
    rangeEl.style.display = 'none';
  }
}

function drawBSTNode(node, x, y, spread, levelH, r, queryRange, insertedY) {
  if (!node) return;

  if (node.left) {
    const cx = x - spread, cy = y + levelH;
    bctx.strokeStyle = '#2a2a44'; bctx.lineWidth = 1.5;
    bctx.beginPath(); bctx.moveTo(x, y + r); bctx.lineTo(cx, cy - r); bctx.stroke();
    drawBSTNode(node.left, cx, cy, spread / 2, levelH, r, queryRange, insertedY);
  }
  if (node.right) {
    const cx = x + spread, cy = y + levelH;
    bctx.strokeStyle = '#2a2a44'; bctx.lineWidth = 1.5;
    bctx.beginPath(); bctx.moveTo(x, y + r); bctx.lineTo(cx, cy - r); bctx.stroke();
    drawBSTNode(node.right, cx, cy, spread / 2, levelH, r, queryRange, insertedY);
  }

  let fill = '#1a1a30', stroke = '#3a3a5a', textCol = '#c8c8d0';

  if (queryRange && node.value >= queryRange.y1 && node.value <= queryRange.y2) {
    fill = 'rgba(255,202,40,0.15)'; stroke = '#ffca28'; textCol = '#ffca28';
    bctx.shadowColor = '#ffca28'; bctx.shadowBlur = 8;
  } else if (insertedY !== null && Math.abs(node.value - insertedY) < 0.5) {
    fill = 'rgba(102,187,106,0.15)'; stroke = '#66bb6a'; textCol = '#66bb6a';
    bctx.shadowColor = '#66bb6a'; bctx.shadowBlur = 8;
  } else if (state.currentEvent && state.currentEvent.type === 'end' &&
             Math.abs(node.value - state.currentEvent.y) < 0.5) {
    fill = 'rgba(239,83,80,0.15)'; stroke = '#ef5350'; textCol = '#ef5350';
  }

  bctx.fillStyle = fill; bctx.strokeStyle = stroke; bctx.lineWidth = 1.5;
  bctx.beginPath(); bctx.arc(x, y, r, 0, Math.PI * 2); bctx.fill(); bctx.stroke();
  bctx.shadowBlur = 0;

  bctx.fillStyle = textCol;
  bctx.font = `${Math.max(9, r - 4)}px JetBrains Mono, Consolas, monospace`;
  bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
  bctx.fillText(Math.round(node.value), x, y);
}

/* ── UI Helpers ── */

function updateControls() {
  const run = document.getElementById('btn-run');
  const step = document.getElementById('btn-step');
  const play = document.getElementById('btn-play');
  const reset = document.getElementById('btn-reset');
  const drawing = state.phase === 'draw';
  const running = state.phase === 'running';
  run.disabled = !drawing || state.lines.length === 0;
  step.disabled = !running || state.isPlaying || state.isStepping;
  play.disabled = !running || state.isStepping;
  play.textContent = state.isPlaying ? 'Pause' : 'Play';
  reset.disabled = drawing;
  canvas.style.cursor = drawing ? 'crosshair' : 'default';
}

function updateEmptyState() {
  els.emptyState.classList.toggle('hidden', state.lines.length > 0);
}

function updateStatus(msg) {
  const el = document.getElementById('info-status');
  let badge = 'drawing', label = 'Draw';
  if (state.phase === 'running') { badge = 'running'; label = 'Running'; }
  if (state.phase === 'complete') { badge = 'complete'; label = 'Done'; }
  el.innerHTML = `<span class="phase ${badge}">${label}</span> ${msg}`;
}

function updateEventStatus(ev) {
  const idx = state.currentIdx + 1, total = state.events.length;
  let msg = `Event ${idx}/${total}: `;
  if (ev.type === 'start') msg += `Left endpoint (y=${Math.round(ev.y)}) &mdash; inserting into BST`;
  else if (ev.type === 'end') msg += `Right endpoint (y=${Math.round(ev.y)}) &mdash; deleting from BST`;
  else msg += `Vertical line at x=${Math.round(ev.x)} &mdash; range query [${Math.round(ev.y1)}, ${Math.round(ev.y2)}]`;
  updateStatus(msg);
}

function updateMetrics() {
  document.getElementById('m-lines').textContent = state.lines.length;
  document.getElementById('m-events').textContent = state.events.length > 0
    ? `${Math.max(0, state.currentIdx + 1)}/${state.events.length}` : '-';
  document.getElementById('m-active').textContent = state.activeSet.length > 0
    ? '{' + state.activeSet.map(a => Math.round(a.y)).join(', ') + '}'
    : (state.phase === 'running' ? '{}' : '-');
  document.getElementById('m-inter').textContent = state.foundIntersections.length;
}
