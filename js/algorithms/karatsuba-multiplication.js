export const id = 'karatsuba-multiplication';
export const title = 'Karatsuba Multiplication';
export const category = 'divide-conquer';
export const badge = 'Divide & Conquer';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let animFrameId;

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
    xInput: '',
    yInput: '',
    phase: 'input',

    nodes: [],
    trace: [],
    currentStep: -1,
    currentEvent: null,

    activeNodeId: null,
    nodeStatus: {},
    computingLabel: null,
    revealed: {},  // nodeId -> { split, z2, z0, z1, z1Product, result }

    layout: new Map(),
    fullTreeBounds: null,

    camera: { x: 0, y: 0, scale: 1 },
    targetCamera: { x: 0, y: 0, scale: 1 },
    cameraAnimating: false,

    isPlaying: false,
    isStepping: false,
    speed: 5,
    animDelay: 600,

    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragCamStartX: 0,
    dragCamStartY: 0,
  };

  setupDOM();
  setupCanvas();
  bindEvents();
  updateControls();
  updateMetrics();
  renderNodeList();
  renderInspector();
  render();
}

export function destroy() {
  cancelDelay();
  cancelAnimFrame();
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
      <label>x</label>
      <input type="text" id="input-x" value="" maxlength="8" placeholder="e.g. 1234">
    </div>
    <div class="input-group">
      <label>y</label>
      <input type="text" id="input-y" value="" maxlength="8" placeholder="e.g. 5678">
    </div>
    <button id="btn-example">Example</button>
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
    <div class="ds-section ka-section-tree">
      <div class="ds-header">
        <span>Recursion Tree</span>
        <span class="ds-count" id="ka-node-count"></span>
      </div>
      <div id="ka-node-list" class="mp-scroll">
        <div class="ev-empty">Enter two numbers, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section ka-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="ka-step-count"></span>
      </div>
      <div id="ka-inspector" class="mp-inspector">
        <div class="ev-empty">No active computation yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter two integers to multiply using Karatsuba's method
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Digits</span><span class="value" id="m-digits">-</span></div>
      <div class="info-metric"><span class="label">Nodes</span><span class="value" id="m-nodes">-</span></div>
      <div class="info-metric"><span class="label">Depth</span><span class="value" id="m-depth">-</span></div>
      <div class="info-metric"><span class="label">Result</span><span class="value" id="m-result">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Karatsuba Multiplication</div>
    <div class="es-sub">Enter two integers and click Visualize to see the recursive decomposition</div>
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
  on(document.getElementById('btn-run'), 'click', startVisualization);
  on(document.getElementById('btn-step'), 'click', stepForward);
  on(document.getElementById('btn-play'), 'click', togglePlay);
  on(document.getElementById('btn-reset'), 'click', resetVisualization);
  on(document.getElementById('speed'), 'input', updateSpeed);
  on(document.getElementById('input-x'), 'input', handleInputChange);
  on(document.getElementById('input-y'), 'input', handleInputChange);
  on(canvas, 'mousedown', handleMouseDown);
  on(window, 'mousemove', handleMouseMove);
  on(window, 'mouseup', handleMouseUp);
  on(canvas, 'wheel', handleWheel);
}

function handleResize() {
  setupCanvas();
  if (state.layout.size > 0) {
    computeFullTreeBounds();
    updateTargetCamera();
    state.camera = { ...state.targetCamera };
  }
  render();
}

function handleInputChange() {
  state.xInput = document.getElementById('input-x').value;
  state.yInput = document.getElementById('input-y').value;
  updateControls();
}

function handleMouseDown(e) {
  if (state.phase !== 'complete') return;
  state.dragging = true;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.dragCamStartX = state.camera.x;
  state.dragCamStartY = state.camera.y;
  canvas.style.cursor = 'grabbing';
  e.preventDefault();
}

function handleMouseMove(e) {
  if (!state.dragging) return;
  const dx = (e.clientX - state.dragStartX) / state.camera.scale;
  const dy = (e.clientY - state.dragStartY) / state.camera.scale;
  state.camera.x = state.dragCamStartX - dx;
  state.camera.y = state.dragCamStartY - dy;
  state.targetCamera.x = state.camera.x;
  state.targetCamera.y = state.camera.y;
  render();
}

function handleMouseUp() {
  if (!state.dragging) return;
  state.dragging = false;
  canvas.style.cursor = state.phase === 'complete' ? 'grab' : 'default';
}

function handleWheel(e) {
  if (state.phase !== 'complete') return;
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = Math.max(0.2, Math.min(3.0, state.camera.scale * zoomFactor));
  state.camera.scale = newScale;
  state.targetCamera.scale = newScale;
  render();
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('input-x').value = '1234';
  document.getElementById('input-y').value = '5678';
  state.xInput = '1234';
  state.yInput = '5678';
  updateControls();
}

// ── Karatsuba Trace Builder ──

function buildTrace(xStr, yStr) {
  const nodes = [];
  const trace = [];
  let nextNodeId = 0;

  function padToEqual(a, b) {
    const maxLen = Math.max(a.length, b.length);
    return [a.padStart(maxLen, '0'), b.padStart(maxLen, '0')];
  }

  function makeNode(id, parentId, childIndex, xPad, yPad, depth) {
    return {
      id, parentId, childIndex, x: xPad, y: yPad,
      xH: null, xL: null, yH: null, yL: null, m: null,
      isBase: false, z2NodeId: null, z0NodeId: null, z1NodeId: null,
      result: null, z2: null, z0: null, z1: null,
      z1Product: null, sumX: null, sumY: null, depth,
    };
  }

  function solve(nodeId) {
    const node = nodes[nodeId];
    const [xPad, yPad] = padToEqual(node.x, node.y);
    node.x = xPad;
    node.y = yPad;

    trace.push({ type: 'enter', nodeId, x: xPad, y: yPad, depth: node.depth });

    const xVal = parseInt(xPad, 10);
    const yVal = parseInt(yPad, 10);

    if (xPad.length <= 1) {
      const result = xVal * yVal;
      node.isBase = true;
      node.result = String(result);
      trace.push({ type: 'base', nodeId, x: xPad, y: yPad, result: String(result) });
      trace.push({ type: 'return', nodeId, result: String(result) });
      return result;
    }

    const n = xPad.length;
    const m = Math.floor(n / 2);
    const xH = xPad.substring(0, n - m);
    const xL = xPad.substring(n - m);
    const yH = yPad.substring(0, n - m);
    const yL = yPad.substring(n - m);
    node.xH = xH; node.xL = xL; node.yH = yH; node.yL = yL; node.m = m;

    const sumX = String(parseInt(xH, 10) + parseInt(xL, 10));
    const sumY = String(parseInt(yH, 10) + parseInt(yL, 10));
    node.sumX = sumX; node.sumY = sumY;

    // Pre-allocate all 3 children so split reveals them together
    const z2Id = nextNodeId++;
    const z0Id = nextNodeId++;
    const z1Id = nextNodeId++;
    node.z2NodeId = z2Id; node.z0NodeId = z0Id; node.z1NodeId = z1Id;

    const cd = node.depth + 1;
    const [z2x, z2y] = padToEqual(xH, yH);
    const [z0x, z0y] = padToEqual(xL, yL);
    const [z1x, z1y] = padToEqual(sumX, sumY);
    nodes[z2Id] = makeNode(z2Id, nodeId, 0, z2x, z2y, cd);
    nodes[z0Id] = makeNode(z0Id, nodeId, 1, z0x, z0y, cd);
    nodes[z1Id] = makeNode(z1Id, nodeId, 2, z1x, z1y, cd);

    trace.push({ type: 'split', nodeId, xH, xL, yH, yL, m, z2ChildId: z2Id, z0ChildId: z0Id, z1ChildId: z1Id });

    // z2 = xH * yH
    trace.push({ type: 'compute-z2', nodeId, a: xH, b: yH });
    const z2 = solve(z2Id);
    node.z2 = String(z2);

    // z0 = xL * yL
    trace.push({ type: 'compute-z0', nodeId, a: xL, b: yL });
    const z0 = solve(z0Id);
    node.z0 = String(z0);

    // z1 = (xH + xL) * (yH + yL) - z2 - z0
    trace.push({ type: 'compute-z1-setup', nodeId, xH, xL, yH, yL, sumX, sumY });
    const z1Product = solve(z1Id);
    node.z1Product = String(z1Product);
    const z1 = z1Product - z2 - z0;
    node.z1 = String(z1);
    trace.push({
      type: 'compute-z1-subtract', nodeId,
      z1Product: String(z1Product), z2: String(z2), z0: String(z0), z1: String(z1),
    });

    // Combine
    const result = z2 * Math.pow(10, 2 * m) + z1 * Math.pow(10, m) + z0;
    node.result = String(result);
    trace.push({
      type: 'combine', nodeId,
      z2: String(z2), z1: String(z1), z0: String(z0), m, result: String(result),
    });
    trace.push({ type: 'return', nodeId, result: String(result) });

    return result;
  }

  // Create root node and solve
  const rootId = nextNodeId++;
  const [rx, ry] = padToEqual(xStr, yStr);
  nodes[rootId] = makeNode(rootId, null, null, rx, ry, 0);
  solve(rootId);
  return { nodes, trace };
}

// ── Visualization Control ──

function startVisualization() {
  let x = state.xInput.replace(/[^0-9]/g, '');
  let y = state.yInput.replace(/[^0-9]/g, '');
  x = x.replace(/^0+/, '') || '0';
  y = y.replace(/^0+/, '') || '0';
  if (x === '' || y === '' || x === '0' || y === '0') {
    updateStatus('Enter two positive integers');
    return;
  }

  state.phase = 'running';
  state.isPlaying = false;
  state.isStepping = false;

  const built = buildTrace(x, y);
  state.nodes = built.nodes;
  state.trace = built.trace;
  state.currentStep = -1;
  state.currentEvent = null;
  state.activeNodeId = null;
  state.computingLabel = null;
  state.nodeStatus = {};
  state.revealed = {};

  for (const node of state.nodes) {
    state.nodeStatus[node.id] = 'pending';
    state.revealed[node.id] = { split: false, z2: false, z0: false, z1: false, z1Sub: false, result: false };
  }

  computeLayout();
  computeFullTreeBounds();

  // Start camera showing full tree
  const fullCam = computeFullTreeCamera();
  state.camera = { ...fullCam };
  state.targetCamera = { ...fullCam };

  els.emptyState.classList.add('hidden');
  updateControls();
  updateStatus('Trace built. Step through the Karatsuba recursion or press Play.');
  updateMetrics();
  renderNodeList();
  renderInspector();
  render();
}

function applyEvent(ev) {
  state.currentEvent = ev;

  switch (ev.type) {
    case 'enter':
      state.activeNodeId = ev.nodeId;
      state.nodeStatus[ev.nodeId] = 'entering';
      state.computingLabel = null;
      updateStatus(`Enter: ${trim(ev.x)} \u00d7 ${trim(ev.y)} (depth ${ev.depth})`);
      break;

    case 'split':
      state.nodeStatus[ev.nodeId] = 'splitting';
      state.activeNodeId = ev.nodeId;
      state.revealed[ev.nodeId].split = true;
      // Reveal all 3 children at once
      state.nodeStatus[ev.z2ChildId] = 'pending-visible';
      state.nodeStatus[ev.z0ChildId] = 'pending-visible';
      state.nodeStatus[ev.z1ChildId] = 'pending-visible';
      updateStatus(`Split: xH=${trim(ev.xH)}, xL=${trim(ev.xL)}, yH=${trim(ev.yH)}, yL=${trim(ev.yL)}, m=${ev.m}`);
      break;

    case 'compute-z2':
      state.nodeStatus[ev.nodeId] = 'computing-z2';
      state.computingLabel = 'z2';
      state.activeNodeId = ev.nodeId;
      updateStatus(`Computing z\u2082 = ${trim(ev.a)} \u00d7 ${trim(ev.b)}`);
      break;

    case 'compute-z0':
      state.nodeStatus[ev.nodeId] = 'computing-z0';
      state.computingLabel = 'z0';
      state.activeNodeId = ev.nodeId;
      // z2 child has returned by now
      state.revealed[ev.nodeId].z2 = true;
      updateStatus(`Computing z\u2080 = ${trim(ev.a)} \u00d7 ${trim(ev.b)}`);
      break;

    case 'compute-z1-setup':
      state.nodeStatus[ev.nodeId] = 'computing-z1';
      state.computingLabel = 'z1';
      state.activeNodeId = ev.nodeId;
      // z0 child has returned by now
      state.revealed[ev.nodeId].z0 = true;
      updateStatus(`Computing z\u2081: (${trim(ev.sumX)}) \u00d7 (${trim(ev.sumY)}) then subtract z\u2082 and z\u2080`);
      break;

    case 'compute-z1-subtract':
      state.activeNodeId = ev.nodeId;
      state.revealed[ev.nodeId].z1 = true;
      updateStatus(`z\u2081 = ${ev.z1Product} \u2212 ${ev.z2} \u2212 ${ev.z0} = ${ev.z1}`);
      break;

    case 'base':
      state.nodeStatus[ev.nodeId] = 'complete';
      state.activeNodeId = ev.nodeId;
      state.revealed[ev.nodeId].result = true;
      updateStatus(`Base case: ${trim(ev.x)} \u00d7 ${trim(ev.y)} = ${ev.result}`);
      break;

    case 'combine':
      state.nodeStatus[ev.nodeId] = 'combining';
      state.activeNodeId = ev.nodeId;
      state.revealed[ev.nodeId].result = true;
      updateStatus(`Combine: ${ev.z2}\u00b710\u02b2\u1d50 + ${ev.z1}\u00b710\u1d50 + ${ev.z0} = ${ev.result}  (m=${ev.m})`);
      break;

    case 'return': {
      state.nodeStatus[ev.nodeId] = 'complete';
      state.revealed[ev.nodeId].result = true;
      const node = state.nodes[ev.nodeId];
      // Keep camera on the completed node so user can see the result
      state.activeNodeId = ev.nodeId;
      state.computingLabel = null;
      if (state.currentStep < state.trace.length - 1) {
        updateStatus(`Return ${ev.result} from ${trim(node.x)} \u00d7 ${trim(node.y)}`);
      }
      break;
    }
  }

  updateTargetCamera();
  startCameraAnimation();
  renderNodeList();
  renderInspector();
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
  state.activeNodeId = 0;
  state.computingLabel = null;

  const root = state.nodes[0];
  updateStatus(`Complete: ${trim(root.x)} \u00d7 ${trim(root.y)} = ${root.result}`);

  // Zoom out to full tree
  state.targetCamera = computeFullTreeCamera();
  startCameraAnimation();

  updateControls();
  updateMetrics();
  renderNodeList();
  renderInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  cancelAnimFrame();
  state.phase = 'input';
  state.nodes = [];
  state.trace = [];
  state.currentStep = -1;
  state.currentEvent = null;
  state.activeNodeId = null;
  state.computingLabel = null;
  state.nodeStatus = {};
  state.revealed = {};
  state.layout = new Map();
  state.fullTreeBounds = null;
  state.camera = { x: 0, y: 0, scale: 1 };
  state.targetCamera = { x: 0, y: 0, scale: 1 };
  state.cameraAnimating = false;
  state.isPlaying = false;
  state.isStepping = false;

  els.emptyState.classList.remove('hidden');
  updateControls();
  updateStatus('Enter two integers to multiply using Karatsuba\'s method');
  updateMetrics();
  renderNodeList();
  renderInspector();
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

// ── Camera System ──

function computeFullTreeCamera() {
  if (!state.fullTreeBounds) return { x: 0, y: 0, scale: 1 };
  const b = state.fullTreeBounds;
  const pad = 50;
  const treeW = b.maxX - b.minX;
  const treeH = b.maxY - b.minY;
  if (treeW <= 0 || treeH <= 0) return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, scale: 1 };

  const scaleX = (cw - 2 * pad) / treeW;
  const scaleY = (ch - 2 * pad) / treeH;
  const scale = Math.min(scaleX, scaleY, 1.5);

  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
    scale,
  };
}

function updateTargetCamera() {
  if (state.activeNodeId === null || state.phase === 'complete') {
    state.targetCamera = computeFullTreeCamera();
    return;
  }

  const pos = state.layout.get(state.activeNodeId);
  if (!pos) {
    state.targetCamera = computeFullTreeCamera();
    return;
  }

  // Zoom level: show neighborhood comfortably
  const node = state.nodes[state.activeNodeId];
  const depth = node.depth;
  // Deeper nodes get more zoom
  const baseScale = 0.9;
  const depthBonus = depth * 0.15;
  const scale = Math.min(baseScale + depthBonus, 1.8);

  state.targetCamera = {
    x: pos.cx,
    y: pos.cy,
    scale,
  };
}

function startCameraAnimation() {
  if (state.cameraAnimating) return;
  state.cameraAnimating = true;
  animateCamera();
}

function animateCamera() {
  if (!state || !state.cameraAnimating) return;

  const lerp = 0.15;
  const cam = state.camera;
  const target = state.targetCamera;

  cam.x += (target.x - cam.x) * lerp;
  cam.y += (target.y - cam.y) * lerp;
  cam.scale += (target.scale - cam.scale) * lerp;

  const dx = Math.abs(target.x - cam.x);
  const dy = Math.abs(target.y - cam.y);
  const ds = Math.abs(target.scale - cam.scale);

  render();

  if (dx > 0.5 || dy > 0.5 || ds > 0.001) {
    animFrameId = requestAnimationFrame(animateCamera);
  } else {
    cam.x = target.x;
    cam.y = target.y;
    cam.scale = target.scale;
    state.cameraAnimating = false;
    render();
  }
}

function cancelAnimFrame() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (state) state.cameraAnimating = false;
}

// ── Tree Layout ──

const NODE_W = 120;
const NODE_H = 52;
const H_GAP = 24;
const V_GAP = 56;

function computeLayout() {
  state.layout = new Map();
  if (state.nodes.length === 0) return;

  const widthCache = new Map();

  function subtreeWidth(nodeId) {
    if (widthCache.has(nodeId)) return widthCache.get(nodeId);
    const node = state.nodes[nodeId];
    const childIds = [node.z2NodeId, node.z0NodeId, node.z1NodeId].filter(id => id != null);
    if (childIds.length === 0) {
      widthCache.set(nodeId, NODE_W);
      return NODE_W;
    }
    let total = 0;
    for (const cid of childIds) {
      total += subtreeWidth(cid);
    }
    total += H_GAP * (childIds.length - 1);
    const w = Math.max(NODE_W, total);
    widthCache.set(nodeId, w);
    return w;
  }

  function assign(nodeId, cx, top) {
    state.layout.set(nodeId, { cx, cy: top + NODE_H / 2, width: NODE_W, height: NODE_H });

    const node = state.nodes[nodeId];
    const childIds = [node.z2NodeId, node.z0NodeId, node.z1NodeId].filter(id => id != null);
    if (childIds.length === 0) return;

    const childrenW = childIds.reduce((s, cid) => s + subtreeWidth(cid), 0)
                      + H_GAP * (childIds.length - 1);
    let startX = cx - childrenW / 2;
    for (const cid of childIds) {
      const childW = subtreeWidth(cid);
      assign(cid, startX + childW / 2, top + NODE_H + V_GAP);
      startX += childW + H_GAP;
    }
  }

  assign(0, 0, 0);
}

function computeFullTreeBounds() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [, pos] of state.layout) {
    minX = Math.min(minX, pos.cx - pos.width / 2);
    maxX = Math.max(maxX, pos.cx + pos.width / 2);
    minY = Math.min(minY, pos.cy - pos.height / 2);
    maxY = Math.max(maxY, pos.cy + pos.height / 2);
  }
  state.fullTreeBounds = { minX, maxX, minY, maxY };
}

// ── Canvas Rendering ──

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();

  if (state.layout.size === 0) return;

  const cam = state.camera;
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);

  drawEdges();
  drawNodes();

  ctx.restore();
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

function drawEdges() {
  for (const node of state.nodes) {
    const parentPos = state.layout.get(node.id);
    if (!parentPos) continue;

    const childIds = [node.z2NodeId, node.z0NodeId, node.z1NodeId];
    for (let i = 0; i < 3; i++) {
      const cid = childIds[i];
      if (cid == null) continue;
      const childStatus = state.nodeStatus[cid];
      if (!childStatus || childStatus === 'pending') continue;

      const childPos = state.layout.get(cid);
      if (!childPos) continue;

      const parentStatus = state.nodeStatus[node.id];
      if (!parentStatus || parentStatus === 'pending') continue;

      ctx.strokeStyle = '#b388ff';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(parentPos.cx, parentPos.cy + parentPos.height / 2);

      const midY = (parentPos.cy + parentPos.height / 2 + childPos.cy - childPos.height / 2) / 2;
      ctx.bezierCurveTo(
        parentPos.cx, midY,
        childPos.cx, midY,
        childPos.cx, childPos.cy - childPos.height / 2
      );
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }
}

function drawNodes() {
  for (const node of state.nodes) {
    const status = state.nodeStatus[node.id];
    if (!status || status === 'pending') continue;
    drawNode(node.id);
  }
}

function drawNode(nodeId) {
  const pos = state.layout.get(nodeId);
  if (!pos) return;
  const node = state.nodes[nodeId];
  const status = state.nodeStatus[nodeId] || 'pending';
  const isActive = nodeId === state.activeNodeId;

  const { cx, cy, width, height } = pos;
  const x = cx - width / 2;
  const y = cy - height / 2;

  let fill, stroke, textColor;
  switch (status) {
    case 'entering':
    case 'splitting':
      fill = 'rgba(124,77,255,0.18)';
      stroke = '#7c4dff';
      textColor = '#c6b6ff';
      break;
    case 'computing-z2':
    case 'computing-z0':
    case 'computing-z1':
      fill = 'rgba(255,202,40,0.12)';
      stroke = '#ffca28';
      textColor = '#fff176';
      break;
    case 'combining':
      fill = 'rgba(79,195,247,0.14)';
      stroke = '#4fc3f7';
      textColor = '#81d4fa';
      break;
    case 'complete':
      fill = 'rgba(102,187,106,0.12)';
      stroke = '#66bb6a';
      textColor = '#a5d6a7';
      break;
    default:
      fill = 'rgba(143,149,173,0.08)';
      stroke = '#2f344a';
      textColor = '#8f93aa';
  }

  ctx.save();

  if (isActive) {
    ctx.shadowColor = stroke;
    ctx.shadowBlur = 14;
  }

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = isActive ? 2.5 : 1.2;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.shadowBlur = 0;

  // Node text: show sub-problem while computing, swap to result when complete
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const rev = state.revealed[nodeId];
  if (rev && rev.result && node.result !== null) {
    ctx.fillStyle = '#66bb6a';
    ctx.font = '12px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(node.result, cx, cy);
  } else {
    ctx.fillStyle = textColor;
    ctx.font = '11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(`${trim(node.x)} \u00d7 ${trim(node.y)}`, cx, cy);
  }

  // Child index badge (z2, z0, z1)
  if (node.childIndex !== null) {
    const badges = ['z\u2082', 'z\u2080', 'z\u2081'];
    ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillStyle = '#b388ff';
    ctx.globalAlpha = 0.8;
    ctx.textAlign = 'right';
    ctx.fillText(badges[node.childIndex], x + width - 5, y + 10);
    ctx.globalAlpha = 1.0;
  }

  ctx.restore();
}

// ── Side Panel: Node List ──

function renderNodeList() {
  const listEl = document.getElementById('ka-node-list');
  const countEl = document.getElementById('ka-node-count');
  if (!listEl || !countEl) return;

  if (state.nodes.length === 0) {
    listEl.innerHTML = '<div class="ev-empty">Enter two numbers, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  const completed = Object.values(state.nodeStatus).filter(s => s === 'complete').length;
  countEl.textContent = `${completed}/${state.nodes.length}`;

  let html = '';
  for (const node of state.nodes) {
    const status = state.nodeStatus[node.id] || 'pending';
    const active = state.activeNodeId === node.id ? ' active' : '';
    const statusClass = status === 'complete' ? 'complete' :
                        (status === 'pending' || status === 'pending-visible') ? 'pending' : 'running';
    const resultText = node.result !== null ? node.result : '-';

    html += `
      <div class="call-item ${statusClass}${active}" style="padding-left:${10 + node.depth * 14}px">
        <span class="call-title">${(state.revealed[node.id] && state.revealed[node.id].result && node.result !== null) ? resultText : `${trim(node.x)} \u00d7 ${trim(node.y)}`}</span>
        <span class="call-meta">d=${node.depth}</span>
        <span class="call-result">${status === 'complete' ? 'done' : '-'}</span>
      </div>
    `;
  }
  listEl.innerHTML = html;

  // Scroll active into view
  if (state.activeNodeId !== null) {
    const items = listEl.querySelectorAll('.call-item');
    for (const item of items) {
      if (item.classList.contains('active')) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        break;
      }
    }
  }
}

// ── Side Panel: Step Inspector ──

function renderInspector() {
  const panel = document.getElementById('ka-inspector');
  const stepEl = document.getElementById('ka-step-count');
  if (!panel || !stepEl) return;

  if (state.phase === 'input') {
    stepEl.textContent = '';
    panel.innerHTML = '<div class="ev-empty">No active computation yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;

  const activeNode = state.activeNodeId !== null ? state.nodes[state.activeNodeId] : null;
  if (!activeNode) {
    panel.innerHTML = '<div class="ev-empty">-</div>';
    return;
  }

  const rev = state.revealed[activeNode.id];

  let html = `
    <div class="mp-kv"><span>Sub-problem</span><strong>${trim(activeNode.x)} \u00d7 ${trim(activeNode.y)}</strong></div>
    <div class="mp-kv"><span>Depth</span><strong>${activeNode.depth}</strong></div>
  `;

  if (rev.split) {
    html += `
      <div class="mp-kv"><span>m (split)</span><strong>${activeNode.m}</strong></div>
      <div class="mp-kv"><span>x\u2095, x\u2097</span><strong>${trim(activeNode.xH)}, ${trim(activeNode.xL)}</strong></div>
      <div class="mp-kv"><span>y\u2095, y\u2097</span><strong>${trim(activeNode.yH)}, ${trim(activeNode.yL)}</strong></div>
    `;

    html += '<div class="mp-block"><div class="mp-label">Sub-multiplications</div>';
    html += `<div class="mp-kv"><span>z\u2082 = x\u2095\u00b7y\u2095</span><strong>${rev.z2 ? activeNode.z2 : '\u2026'}</strong></div>`;
    html += `<div class="mp-kv"><span>z\u2080 = x\u2097\u00b7y\u2097</span><strong>${rev.z0 ? activeNode.z0 : '\u2026'}</strong></div>`;
    html += `<div class="mp-kv"><span>z\u2081 = (${trim(activeNode.sumX)})\u00b7(${trim(activeNode.sumY)}) \u2212 z\u2082 \u2212 z\u2080</span><strong>${rev.z1 ? activeNode.z1 : '\u2026'}</strong></div>`;
    html += '</div>';
  }

  if (rev.result) {
    html += `
      <div class="mp-block">
        <div class="mp-label">Result</div>
        <div class="mp-kv"><span>${rev.split ? 'z\u2082\u00b710\u02b2\u1d50 + z\u2081\u00b710\u1d50 + z\u2080' : `${trim(activeNode.x)} \u00d7 ${trim(activeNode.y)}`}</span><strong>${activeNode.result}</strong></div>
      </div>
    `;
  }

  panel.innerHTML = html;
}

// ── Controls & Status ──

function updateControls() {
  const run = document.getElementById('btn-run');
  const step = document.getElementById('btn-step');
  const play = document.getElementById('btn-play');
  const reset = document.getElementById('btn-reset');
  const example = document.getElementById('btn-example');
  const inputX = document.getElementById('input-x');
  const inputY = document.getElementById('input-y');

  const isInput = state.phase === 'input';
  const running = state.phase === 'running';

  const hasInput = state.xInput.replace(/[^0-9]/g, '').replace(/^0+/, '') !== ''
                && state.yInput.replace(/[^0-9]/g, '').replace(/^0+/, '') !== '';
  run.disabled = !isInput || !hasInput;
  step.disabled = !running || state.isPlaying || state.isStepping || state.trace.length === 0;
  play.disabled = !running || state.isStepping || state.trace.length === 0;
  play.textContent = state.isPlaying ? 'Pause' : 'Play';
  reset.disabled = isInput;
  example.disabled = !isInput;
  inputX.disabled = !isInput;
  inputY.disabled = !isInput;

  canvas.style.cursor = state.phase === 'complete' ? 'grab' : 'default';
}

function updateStatus(msg) {
  const el = document.getElementById('info-status');
  if (!el) return;
  let badgeCls = 'drawing';
  let label = 'Input';
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
  const digitsEl = document.getElementById('m-digits');
  const nodesEl = document.getElementById('m-nodes');
  const depthEl = document.getElementById('m-depth');
  const resultEl = document.getElementById('m-result');
  if (!digitsEl) return;

  if (state.phase === 'input') {
    const x = state.xInput.replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
    const y = state.yInput.replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
    digitsEl.textContent = `${Math.max(x.length, y.length)}`;
    nodesEl.textContent = '-';
    depthEl.textContent = '-';
    resultEl.textContent = '-';
    return;
  }

  const root = state.nodes[0];
  digitsEl.textContent = `${Math.max(root.x.length, root.y.length)}`;

  const completed = Object.values(state.nodeStatus).filter(s => s === 'complete').length;
  nodesEl.textContent = `${completed}/${state.nodes.length}`;

  let maxD = 0;
  for (const node of state.nodes) {
    if (state.nodeStatus[node.id] !== 'pending' && node.depth > maxD) maxD = node.depth;
  }
  depthEl.textContent = `${maxD}`;

  if (state.phase === 'complete') {
    resultEl.textContent = root.result;
  } else {
    resultEl.textContent = '\u2026';
  }
}

// ── Helpers ──

function trim(s) {
  if (!s) return '0';
  const t = s.replace(/^0+/, '');
  return t === '' ? '0' : t;
}
