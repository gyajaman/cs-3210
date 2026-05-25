import { C } from '../theme.js';

export const id = 'heap-merge';
export const title = 'Binary Heap Merge';
export const categories = ['data-structures'];
export const badge = 'Data Structures';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;

const HEAP_A_COLOR = { fill: 'rgba(124,77,255,0.15)', border: '#7c4dff', text: '#b39ddb' };
const HEAP_B_COLOR = { fill: 'rgba(79,195,247,0.15)', border: '#4fc3f7', text: '#81d4fa' };

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
    heapA: [],
    heapB: [],
    merged: [],
    sources: [],
    splitIndex: 0,
    phase: 'input',
    showTwoHeaps: true,

    currentNode: -1,
    comparingLeft: -1,
    comparingRight: -1,
    highlightSmallest: -1,
    justSwapped: [],
    settled: new Set(),

    swapCount: 0,
    siftCount: 0,

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
  updateStatus('Enter two min-heaps, then click Visualize.');
  updateMetrics();
  renderArrayView();
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
      <label>Heap A</label>
      <input type="text" id="hm-heapa" value="" placeholder="4, 8, 6" style="width:120px">
    </div>
    <div class="input-group">
      <label>Heap B</label>
      <input type="text" id="hm-heapb" value="" placeholder="2, 7, 5, 9" style="width:120px">
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
    <div class="ds-section hm-section-array">
      <div class="ds-header">
        <span>Array View</span>
        <span class="ds-count" id="hm-array-count"></span>
      </div>
      <div id="hm-array-container" class="ot-scroll">
        <div class="ev-empty">Enter two min-heaps and click Visualize</div>
      </div>
    </div>
    <div class="ds-section hm-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="hm-step-count"></span>
      </div>
      <div id="hm-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter two min-heaps, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Heap A</span><span class="value" id="m-heapa">0</span></div>
      <div class="info-metric"><span class="label">Heap B</span><span class="value" id="m-heapb">0</span></div>
      <div class="info-metric"><span class="label">Swaps</span><span class="value" id="m-swaps">–</span></div>
      <div class="info-metric"><span class="label">Sift-downs</span><span class="value" id="m-sifts">–</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Binary Heap Merge</div>
    <div class="es-sub">Merge two min-heaps via concatenation + build-heap in O(n)</div>
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
  on(document.getElementById('hm-heapa'), 'input', onInputChange);
  on(document.getElementById('hm-heapb'), 'input', onInputChange);
}

function handleResize() { setupCanvas(); render(); }
function onInputChange() { updateControls(); }

function parseHeap(str) {
  return str.trim().split(/[,;]\s*/).map(s => parseInt(s.trim(), 10)).filter(v => !isNaN(v) && v > 0);
}

function isMinHeap(arr) {
  for (let i = 0; i < arr.length; i++) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    if (left < arr.length && arr[i] > arr[left]) return false;
    if (right < arr.length && arr[i] > arr[right]) return false;
  }
  return true;
}

function inputValid() {
  const a = parseHeap(document.getElementById('hm-heapa').value);
  const b = parseHeap(document.getElementById('hm-heapb').value);
  return a.length >= 1 && a.length <= 8 && b.length >= 1 && b.length <= 8
    && isMinHeap(a) && isMinHeap(b);
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('hm-heapa').value = '4, 8, 6';
  document.getElementById('hm-heapb').value = '2, 7, 5, 9';
  updateControls();
}

function generateMinHeap(size) {
  const values = [];
  for (let i = 0; i < size; i++) values.push(1 + Math.floor(Math.random() * 50));
  for (let i = Math.floor(size / 2) - 1; i >= 0; i--) {
    let cur = i;
    while (true) {
      let smallest = cur;
      const l = 2 * cur + 1;
      const r = 2 * cur + 2;
      if (l < size && values[l] < values[smallest]) smallest = l;
      if (r < size && values[r] < values[smallest]) smallest = r;
      if (smallest !== cur) {
        [values[cur], values[smallest]] = [values[smallest], values[cur]];
        cur = smallest;
      } else break;
    }
  }
  return values;
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const sizeA = 2 + Math.floor(Math.random() * 5);
  const sizeB = 2 + Math.floor(Math.random() * 5);
  document.getElementById('hm-heapa').value = generateMinHeap(sizeA).join(', ');
  document.getElementById('hm-heapb').value = generateMinHeap(sizeB).join(', ');
  updateControls();
}

function buildTrace(heapA, heapB) {
  const trace = [];
  trace.push({ type: 'init', heapA: [...heapA], heapB: [...heapB] });

  const merged = [...heapA, ...heapB];
  const n = merged.length;
  trace.push({ type: 'concat', merged: [...merged], splitIndex: heapA.length });

  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    trace.push({ type: 'sift-start', index: i, value: merged[i] });

    let current = i;
    while (true) {
      let smallest = current;
      const left = 2 * current + 1;
      const right = 2 * current + 2;

      if (left < n && merged[left] < merged[smallest]) smallest = left;
      if (right < n && merged[right] < merged[smallest]) smallest = right;

      trace.push({
        type: 'compare',
        current,
        left: left < n ? left : -1,
        right: right < n ? right : -1,
        smallest,
        values: {
          current: merged[current],
          left: left < n ? merged[left] : null,
          right: right < n ? merged[right] : null,
        },
      });

      if (smallest !== current) {
        trace.push({
          type: 'swap',
          i: current,
          j: smallest,
          valI: merged[current],
          valJ: merged[smallest],
        });
        [merged[current], merged[smallest]] = [merged[smallest], merged[current]];
        current = smallest;
      } else {
        trace.push({ type: 'settled', index: current, value: merged[current] });
        break;
      }
    }
  }

  trace.push({ type: 'complete', heap: [...merged] });
  return trace;
}

function startVisualization() {
  if (!inputValid()) return;
  const heapA = parseHeap(document.getElementById('hm-heapa').value);
  const heapB = parseHeap(document.getElementById('hm-heapb').value);

  state.heapA = heapA;
  state.heapB = heapB;
  state.merged = [...heapA, ...heapB];
  state.sources = [
    ...heapA.map(() => 'a'),
    ...heapB.map(() => 'b'),
  ];
  state.splitIndex = heapA.length;
  state.phase = 'running';
  state.showTwoHeaps = true;

  state.trace = buildTrace(heapA, heapB);
  state.currentStep = -1;
  state.currentNode = -1;
  state.comparingLeft = -1;
  state.comparingRight = -1;
  state.highlightSmallest = -1;
  state.justSwapped = [];
  state.settled = new Set();
  state.swapCount = 0;
  state.siftCount = 0;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('hm-heapa').disabled = true;
  document.getElementById('hm-heapb').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Two min-heaps ready. Step to merge them.');
  updateMetrics();
  renderArrayView();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.showTwoHeaps = true;
      updateStatus(`Heap A: [${state.heapA.join(', ')}]  Heap B: [${state.heapB.join(', ')}]`);
      break;

    case 'concat':
      state.showTwoHeaps = false;
      state.merged = [...ev.merged];
      state.sources = [
        ...state.heapA.map(() => 'a'),
        ...state.heapB.map(() => 'b'),
      ];
      updateStatus(`Concatenated: [${ev.merged.join(', ')}]. Starting build-heap from index ${Math.floor(ev.merged.length / 2) - 1}.`);
      break;

    case 'sift-start':
      state.currentNode = ev.index;
      state.comparingLeft = -1;
      state.comparingRight = -1;
      state.highlightSmallest = -1;
      state.justSwapped = [];
      state.siftCount++;
      updateStatus(`Sift-down: checking node ${ev.value} at index ${ev.index}`);
      break;

    case 'compare': {
      state.currentNode = ev.current;
      state.comparingLeft = ev.left;
      state.comparingRight = ev.right;
      state.highlightSmallest = ev.smallest;
      state.justSwapped = [];
      const parts = [`current=${ev.values.current}`];
      if (ev.values.left !== null) parts.push(`left=${ev.values.left}`);
      if (ev.values.right !== null) parts.push(`right=${ev.values.right}`);
      const action = ev.smallest === ev.current ? 'no swap needed' : `smallest is ${state.merged[ev.smallest]} at index ${ev.smallest}`;
      updateStatus(`Compare: ${parts.join(', ')}. ${action}.`);
      break;
    }

    case 'swap':
      [state.merged[ev.i], state.merged[ev.j]] = [state.merged[ev.j], state.merged[ev.i]];
      [state.sources[ev.i], state.sources[ev.j]] = [state.sources[ev.j], state.sources[ev.i]];
      state.justSwapped = [ev.i, ev.j];
      state.currentNode = ev.j;
      state.comparingLeft = -1;
      state.comparingRight = -1;
      state.highlightSmallest = -1;
      state.swapCount++;
      updateStatus(`Swap: ${ev.valI} ↔ ${ev.valJ} (index ${ev.i} ↔ ${ev.j})`);
      break;

    case 'settled':
      state.settled.add(ev.index);
      state.currentNode = -1;
      state.comparingLeft = -1;
      state.comparingRight = -1;
      state.highlightSmallest = -1;
      state.justSwapped = [];
      updateStatus(`Settled: ${ev.value} is in correct position at index ${ev.index}.`);
      break;

    case 'complete':
      state.currentNode = -1;
      state.comparingLeft = -1;
      state.comparingRight = -1;
      state.highlightSmallest = -1;
      state.justSwapped = [];
      updateStatus(`Merge complete! Valid min-heap of ${ev.heap.length} elements. ${state.swapCount} swap${state.swapCount !== 1 ? 's' : ''}.`);
      break;
  }

  renderArrayView();
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
  renderArrayView();
  renderStepInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  state.phase = 'input';
  state.trace = [];
  state.currentStep = -1;
  state.heapA = [];
  state.heapB = [];
  state.merged = [];
  state.sources = [];
  state.splitIndex = 0;
  state.showTwoHeaps = true;
  state.currentNode = -1;
  state.comparingLeft = -1;
  state.comparingRight = -1;
  state.highlightSmallest = -1;
  state.justSwapped = [];
  state.settled = new Set();
  state.swapCount = 0;
  state.siftCount = 0;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('hm-heapa').disabled = false;
  document.getElementById('hm-heapb').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter two min-heaps, then click Visualize.');
  updateMetrics();
  renderArrayView();
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

function getNodeState(index) {
  if (state.phase === 'complete') return 'complete';
  if (state.settled.has(index)) return 'settled';
  if (state.justSwapped.includes(index)) return 'swapped';
  if (index === state.highlightSmallest && state.highlightSmallest !== state.currentNode) return 'smallest';
  if (index === state.currentNode) return 'current';
  if (index === state.comparingLeft || index === state.comparingRight) return 'comparing';
  return state.sources[index] === 'a' ? 'heap-a' : 'heap-b';
}

function nodeStyle(nodeState) {
  switch (nodeState) {
    case 'current':
      return { fill: 'rgba(255,202,40,0.18)', border: '#ffca28', text: '#fff176', glow: '#ffca28' };
    case 'comparing':
      return { fill: 'rgba(79,195,247,0.12)', border: 'rgba(79,195,247,0.6)', text: '#81d4fa', glow: null };
    case 'smallest':
      return { fill: 'rgba(239,83,80,0.15)', border: '#ef5350', text: '#ef9a9a', glow: '#ef5350' };
    case 'swapped':
      return { fill: 'rgba(239,83,80,0.18)', border: '#ef5350', text: '#ef9a9a', glow: '#ef5350' };
    case 'settled':
      return { fill: 'rgba(102,187,106,0.12)', border: '#66bb6a', text: '#a5d6a7', glow: '#66bb6a' };
    case 'complete':
      return { fill: 'rgba(102,187,106,0.15)', border: '#66bb6a', text: '#a5d6a7', glow: '#66bb6a' };
    case 'heap-a':
      return { fill: HEAP_A_COLOR.fill, border: HEAP_A_COLOR.border, text: HEAP_A_COLOR.text, glow: null };
    case 'heap-b':
      return { fill: HEAP_B_COLOR.fill, border: HEAP_B_COLOR.border, text: HEAP_B_COLOR.text, glow: null };
    default:
      return { fill: 'rgba(255,255,255,0.04)', border: 'rgba(200,200,208,0.3)', text: C.text, glow: null };
  }
}

function getTreePositions(n, centerX, topY, width, maxHeight) {
  if (n === 0) return [];
  const positions = [];
  const depth = Math.floor(Math.log2(n));
  const levelH = Math.min(65, maxHeight / (depth + 1));

  for (let i = 0; i < n; i++) {
    const level = Math.floor(Math.log2(i + 1));
    const posInLevel = i - (Math.pow(2, level) - 1);
    const slotsAtLevel = Math.pow(2, level);
    const x = centerX - width / 2 + (posInLevel + 0.5) / slotsAtLevel * width;
    const y = topY + level * levelH;
    positions.push({ x, y });
  }

  return positions;
}

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  if (state.showTwoHeaps) {
    drawTwoHeaps();
  } else {
    drawMergedHeap();
  }
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

function drawTreeAt(arr, centerX, topY, width, maxHeight, colorScheme) {
  const n = arr.length;
  if (n === 0) return;
  const positions = getTreePositions(n, centerX, topY, width, maxHeight);
  const nodeR = Math.min(22, Math.max(14, 280 / n));

  for (let i = 1; i < n; i++) {
    const parentIdx = Math.floor((i - 1) / 2);
    ctx.strokeStyle = 'rgba(200,200,208,0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(positions[parentIdx].x, positions[parentIdx].y);
    ctx.lineTo(positions[i].x, positions[i].y);
    ctx.stroke();
  }

  for (let i = 0; i < n; i++) {
    const { x, y } = positions[i];

    ctx.save();
    if (colorScheme.glow) {
      ctx.shadowColor = colorScheme.glow;
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.arc(x, y, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = colorScheme.fill;
    ctx.fill();
    ctx.strokeStyle = colorScheme.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = colorScheme.text;
    ctx.font = `bold ${Math.min(14, nodeR)}px JetBrains Mono, Fira Code, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(arr[i]), x, y);

    ctx.fillStyle = C.textMuted;
    ctx.font = '8px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(String(i), x, y + nodeR + 10);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawTwoHeaps() {
  const treeMaxH = ch * 0.65;
  const topY = 55;

  ctx.fillStyle = HEAP_A_COLOR.text;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('MIN-HEAP A', cw * 0.25, topY - 16);
  drawTreeAt(state.heapA, cw * 0.25, topY, cw * 0.38, treeMaxH, HEAP_A_COLOR);

  ctx.fillStyle = HEAP_B_COLOR.text;
  ctx.fillText('MIN-HEAP B', cw * 0.75, topY - 16);
  drawTreeAt(state.heapB, cw * 0.75, topY, cw * 0.38, treeMaxH, HEAP_B_COLOR);

  ctx.fillStyle = C.textDim;
  ctx.font = 'bold 18px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.fillText('+', cw * 0.5, ch * 0.42);

  ctx.textAlign = 'left';
}

function drawMergedHeap() {
  const n = state.merged.length;
  if (n === 0) return;

  const topY = 55;
  const treeMaxH = ch * 0.72;
  const treeWidth = Math.min(cw * 0.85, n * 70);
  const positions = getTreePositions(n, cw / 2, topY, treeWidth, treeMaxH);
  const nodeR = Math.min(22, Math.max(14, 280 / n));

  for (let i = 1; i < n; i++) {
    const parentIdx = Math.floor((i - 1) / 2);
    const parentState = getNodeState(parentIdx);
    const childState = getNodeState(i);

    let edgeColor = 'rgba(200,200,208,0.12)';
    if (parentState === 'current' || childState === 'current') edgeColor = 'rgba(255,202,40,0.35)';
    else if (parentState === 'swapped' || childState === 'swapped') edgeColor = 'rgba(239,83,80,0.3)';
    else if (parentState === 'comparing' || childState === 'comparing') edgeColor = 'rgba(79,195,247,0.25)';
    else if (parentState === 'complete' || (parentState === 'settled' && childState === 'settled')) edgeColor = 'rgba(102,187,106,0.2)';

    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(positions[parentIdx].x, positions[parentIdx].y);
    ctx.lineTo(positions[i].x, positions[i].y);
    ctx.stroke();
  }

  for (let i = 0; i < n; i++) {
    const { x, y } = positions[i];
    const ns = getNodeState(i);
    const style = nodeStyle(ns);

    ctx.save();
    if (style.glow) {
      ctx.shadowColor = style.glow;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(x, y, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.strokeStyle = style.border;
    ctx.lineWidth = ns === 'current' || ns === 'swapped' || ns === 'smallest' ? 2.5 : 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = style.text;
    ctx.font = `bold ${Math.min(14, nodeR)}px JetBrains Mono, Fira Code, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(state.merged[i]), x, y);

    ctx.fillStyle = C.textMuted;
    ctx.font = '8px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(String(i), x, y + nodeR + 10);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;

  let label, color;
  if (ev.type === 'complete') {
    label = `Valid min-heap: [${state.merged.join(', ')}]`;
    color = C.lineV;
  } else if (ev.type === 'init') {
    label = `Heap A (${state.heapA.length}) + Heap B (${state.heapB.length}) → merge`;
    color = C.accent;
  } else if (ev.type === 'concat') {
    label = `Concatenated ${ev.merged.length} elements — running build-heap`;
    color = C.accent;
  } else if (ev.type === 'sift-start') {
    label = `Sift-down from index ${ev.index} (value ${ev.value})`;
    color = C.intersection;
  } else if (ev.type === 'compare') {
    const action = ev.smallest === ev.current ? 'heap property holds' : `swap with index ${ev.smallest}`;
    label = `Compare index ${ev.current} with children — ${action}`;
    color = ev.smallest === ev.current ? C.lineV : C.intersection;
  } else if (ev.type === 'swap') {
    label = `Swap: ${ev.valI} ↔ ${ev.valJ}`;
    color = '#ef5350';
  } else if (ev.type === 'settled') {
    label = `Node ${ev.value} settled at index ${ev.index}`;
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

function renderArrayView() {
  const container = document.getElementById('hm-array-container');
  const countEl = document.getElementById('hm-array-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.merged.length === 0) {
    container.innerHTML = '<div class="ev-empty">Enter two min-heaps and click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  if (state.showTwoHeaps) {
    countEl.textContent = `${state.heapA.length} + ${state.heapB.length}`;
    let html = '<table class="ot-dp-table"><thead><tr><th></th>';
    for (let i = 0; i < state.heapA.length; i++) html += `<th>${i}</th>`;
    html += '</tr></thead><tbody><tr><th>A</th>';
    for (let i = 0; i < state.heapA.length; i++) {
      html += `<td class="ot-cell" style="color:${HEAP_A_COLOR.text};background:${HEAP_A_COLOR.fill}">${state.heapA[i]}</td>`;
    }
    html += '</tr></tbody></table>';

    html += '<div style="height:6px"></div>';
    html += '<table class="ot-dp-table"><thead><tr><th></th>';
    for (let i = 0; i < state.heapB.length; i++) html += `<th>${i}</th>`;
    html += '</tr></thead><tbody><tr><th>B</th>';
    for (let i = 0; i < state.heapB.length; i++) {
      html += `<td class="ot-cell" style="color:${HEAP_B_COLOR.text};background:${HEAP_B_COLOR.fill}">${state.heapB[i]}</td>`;
    }
    html += '</tr></tbody></table>';
    container.innerHTML = html;
    return;
  }

  const n = state.merged.length;
  countEl.textContent = `${n} elements`;

  let html = '<table class="ot-dp-table"><thead><tr><th>i</th>';
  for (let i = 0; i < n; i++) html += `<th>${i}</th>`;
  html += '</tr></thead><tbody><tr><th>val</th>';

  for (let i = 0; i < n; i++) {
    const ns = getNodeState(i);
    let cls = 'ot-cell';
    if (ns === 'current') cls += ' ot-cell-current';
    else if (ns === 'swapped') cls += ' hm-cell-swap';
    else if (ns === 'smallest') cls += ' hm-cell-smallest';
    else if (ns === 'comparing') cls += ' hm-cell-compare';
    else if (ns === 'settled' || ns === 'complete') cls += ' ot-cell-filled';

    html += `<td class="${cls}">${state.merged[i]}</td>`;
  }
  html += '</tr><tr><th>src</th>';
  for (let i = 0; i < n; i++) {
    const src = state.sources[i];
    const srcColor = src === 'a' ? HEAP_A_COLOR.text : HEAP_B_COLOR.text;
    html += `<td class="ot-cell" style="color:${srcColor};font-size:9px">${src.toUpperCase()}</td>`;
  }
  html += '</tr></tbody></table>';

  container.innerHTML = html;
}

function renderStepInspector() {
  const inspEl = document.getElementById('hm-inspector');
  const stepEl = document.getElementById('hm-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Total Nodes</span><strong>${state.heapA.length + state.heapB.length}</strong></div>`;
  h += `<div class="mp-kv"><span>Swaps</span><strong>${state.swapCount}</strong></div>`;
  h += `<div class="mp-kv"><span>Sift-downs</span><strong>${state.siftCount}</strong></div>`;

  if (ev && ev.type === 'compare') {
    h += `<div class="mp-block"><div class="mp-label">Comparison</div>`;
    h += `<div class="mp-kv"><span>Parent [${ev.current}]</span><strong>${ev.values.current}</strong></div>`;
    if (ev.values.left !== null) {
      h += `<div class="mp-kv"><span>Left [${ev.left}]</span><strong>${ev.values.left}</strong></div>`;
    }
    if (ev.values.right !== null) {
      h += `<div class="mp-kv"><span>Right [${ev.right}]</span><strong>${ev.values.right}</strong></div>`;
    }
    const result = ev.smallest === ev.current
      ? `<strong style="color:${C.lineV}">No swap needed</strong>`
      : `<strong style="color:#ef5350">Swap with [${ev.smallest}]</strong>`;
    h += `<div class="mp-kv"><span>Result</span>${result}</div>`;
    h += '</div>';
  }

  if (ev && ev.type === 'swap') {
    h += `<div class="mp-block"><div class="mp-label">Swap</div>`;
    h += `<div class="mp-kv"><span>Index ${ev.i} → ${ev.j}</span><strong>${ev.valI} ↔ ${ev.valJ}</strong></div>`;
    h += '</div>';
  }

  if (ev && ev.type === 'settled') {
    h += `<div class="mp-block"><div class="mp-label">Settled</div>`;
    h += `<div class="mp-kv"><span>Value</span><strong style="color:${C.lineV}">${ev.value} at index ${ev.index}</strong></div>`;
    h += '</div>';
  }

  if (state.phase === 'complete') {
    h += `<div class="mp-block"><div class="mp-label">Result</div>`;
    h += `<div class="mp-kv"><span>Min-heap</span><strong class="qs-answer-value">[${state.merged.join(', ')}]</strong></div>`;
    h += `<div class="mp-kv"><span>Root (min)</span><strong style="color:${C.lineV}">${state.merged[0]}</strong></div>`;
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
  document.getElementById('m-heapa').textContent = state.heapA.length || '0';
  document.getElementById('m-heapb').textContent = state.heapB.length || '0';
  document.getElementById('m-swaps').textContent = state.swapCount > 0 ? state.swapCount : '–';
  document.getElementById('m-sifts').textContent = state.siftCount > 0 ? state.siftCount : '–';
}
