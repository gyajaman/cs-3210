import { C } from '../theme.js';

export const id = 'job-scheduling';
export const title = 'Job Scheduling';
export const categories = ['greedy'];
export const badge = 'Greedy';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;
let animFrameId;

const JOB_COLORS = [
  { fill: 'rgba(124,77,255,0.18)', border: '#7c4dff', label: '#b39ddb' },
  { fill: 'rgba(79,195,247,0.18)', border: '#4fc3f7', label: '#81d4fa' },
  { fill: 'rgba(102,187,106,0.18)', border: '#66bb6a', label: '#a5d6a7' },
  { fill: 'rgba(255,202,40,0.18)', border: '#ffca28', label: '#fff176' },
  { fill: 'rgba(239,83,80,0.18)', border: '#ef5350', label: '#ef9a9a' },
  { fill: 'rgba(206,147,216,0.18)', border: '#ce93d8', label: '#e1bee7' },
  { fill: 'rgba(255,138,101,0.18)', border: '#ff8a65', label: '#ffab91' },
  { fill: 'rgba(38,166,154,0.18)', border: '#26a69a', label: '#80cbc4' },
];

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
    jobs: [],
    n: 0,
    maxDeadline: 0,
    phase: 'input',

    sortedJobs: [],
    displayOrder: [],
    sorted: false,
    schedule: [],
    currentIdx: -1,
    totalProfit: 0,
    scheduledCount: 0,

    animPositions: new Map(),

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
  updateStatus('Enter jobs (profit:deadline) then click Visualize.');
  updateMetrics();
  renderPanel();
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
      <label>Jobs (p:d)</label>
      <input type="text" id="js-jobs" value="" placeholder="100:2, 19:1, 27:2, 25:1, 15:3" style="width:240px">
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
    <div class="ds-section js-section-table">
      <div class="ds-header">
        <span>Jobs (sorted by profit)</span>
        <span class="ds-count" id="js-table-count"></span>
      </div>
      <div id="js-table-container" class="ot-scroll">
        <div class="ev-empty">Enter jobs and click Visualize</div>
      </div>
    </div>
    <div class="ds-section js-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="js-step-count"></span>
      </div>
      <div id="js-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter jobs (profit:deadline), then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Jobs</span><span class="value" id="m-jobs">0</span></div>
      <div class="info-metric"><span class="label">Slots</span><span class="value" id="m-slots">-</span></div>
      <div class="info-metric"><span class="label">Scheduled</span><span class="value" id="m-sched">-</span></div>
      <div class="info-metric"><span class="label">Profit</span><span class="value" id="m-profit">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Job Scheduling (Greedy)</div>
    <div class="es-sub">Maximize profit by scheduling jobs before their deadlines</div>
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
  on(document.getElementById('js-jobs'), 'input', onInputChange);
}

function handleResize() { setupCanvas(); render(); }
function onInputChange() { updateControls(); }

function parseInput() {
  const jobsStr = document.getElementById('js-jobs').value.trim();
  const jobs = jobsStr.split(/[,;]\s*/).map((s, i) => {
    const parts = s.split(':');
    if (parts.length !== 2) return null;
    const p = parseFloat(parts[0]);
    const d = parseInt(parts[1], 10);
    if (isNaN(p) || isNaN(d) || p <= 0 || d <= 0) return null;
    return { id: i, profit: p, deadline: d };
  }).filter(Boolean);
  return jobs;
}

function inputValid() {
  const jobs = parseInput();
  return jobs.length >= 2 && jobs.length <= 8;
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('js-jobs').value = '100:2, 19:1, 27:2, 25:1, 15:3';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const n = 4 + Math.floor(Math.random() * 4);
  const maxD = Math.max(2, Math.floor(n * 0.6));
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const p = 10 + Math.floor(Math.random() * 90);
    const d = 1 + Math.floor(Math.random() * maxD);
    jobs.push(`${p}:${d}`);
  }
  document.getElementById('js-jobs').value = jobs.join(', ');
  updateControls();
}

function buildTrace(jobs) {
  const sorted = jobs.map((j, i) => ({ ...j, origIdx: i }))
    .sort((a, b) => b.profit - a.profit);

  const maxDeadline = Math.max(...jobs.map(j => j.deadline));
  const slots = new Array(maxDeadline + 1).fill(null);

  const trace = [];
  trace.push({ type: 'init', n: jobs.length, maxDeadline });
  trace.push({ type: 'sort', sorted: sorted.map(s => ({ origIdx: s.origIdx, profit: s.profit, deadline: s.deadline })) });

  for (let i = 0; i < sorted.length; i++) {
    const job = sorted[i];
    let assignedSlot = -1;
    for (let s = Math.min(job.deadline, maxDeadline); s >= 1; s--) {
      if (slots[s] === null) {
        assignedSlot = s;
        slots[s] = job;
        break;
      }
    }

    if (assignedSlot >= 0) {
      trace.push({
        type: 'schedule',
        sortIdx: i,
        origIdx: job.origIdx,
        profit: job.profit,
        deadline: job.deadline,
        slot: assignedSlot,
        slotsChecked: buildSlotsChecked(job.deadline, maxDeadline, slots, assignedSlot),
      });
    } else {
      trace.push({
        type: 'skip',
        sortIdx: i,
        origIdx: job.origIdx,
        profit: job.profit,
        deadline: job.deadline,
        slotsChecked: buildSlotsChecked(job.deadline, maxDeadline, slots, -1),
      });
    }
  }

  const scheduled = slots.filter(Boolean);
  const totalProfit = scheduled.reduce((s, j) => s + j.profit, 0);
  trace.push({ type: 'complete', totalProfit, scheduledCount: scheduled.length });

  return { trace, sorted, maxDeadline };
}

function buildSlotsChecked(deadline, maxDeadline, slots, assignedSlot) {
  const checked = [];
  const start = Math.min(deadline, maxDeadline);
  for (let s = start; s >= 1; s--) {
    if (s === assignedSlot) { checked.push({ slot: s, available: true }); break; }
    checked.push({ slot: s, available: slots[s] === null });
    if (slots[s] === null && assignedSlot < 0) break;
  }
  return checked;
}

function startVisualization() {
  if (!inputValid()) return;
  const jobs = parseInput();

  state.jobs = jobs;
  state.n = jobs.length;
  state.phase = 'running';

  const { trace, sorted, maxDeadline } = buildTrace(jobs);
  state.trace = trace;
  state.sortedJobs = sorted;
  state.maxDeadline = maxDeadline;
  state.displayOrder = jobs.map((j, i) => ({ ...j, origIdx: i }));
  state.sorted = false;
  state.animPositions = new Map();
  state.currentStep = -1;
  state.schedule = new Array(maxDeadline + 1).fill(null);
  state.currentIdx = -1;
  state.totalProfit = 0;
  state.scheduledCount = 0;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('js-jobs').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Jobs sorted by profit. Step through greedy scheduling.');
  updateMetrics();
  renderPanel();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  let needsAnim = false;
  switch (ev.type) {
    case 'init':
      snapBarsToSlots();
      updateStatus(`${ev.n} jobs, max deadline ${ev.maxDeadline}. Sorting by profit...`);
      break;

    case 'sort':
      state.displayOrder = state.sortedJobs;
      state.sorted = true;
      needsAnim = true;
      updateStatus(`Sorted by profit: ${ev.sorted.map(s => `J${s.origIdx}($${s.profit})`).join(' > ')}`);
      break;

    case 'schedule':
      state.currentIdx = ev.sortIdx;
      state.schedule[ev.slot] = { origIdx: ev.origIdx, profit: ev.profit, deadline: ev.deadline };
      state.totalProfit += ev.profit;
      state.scheduledCount += 1;
      updateStatus(`Schedule J${ev.origIdx} (profit $${ev.profit}) in slot ${ev.slot} (deadline ${ev.deadline})`);
      break;

    case 'skip':
      state.currentIdx = ev.sortIdx;
      updateStatus(`Skip J${ev.origIdx} (profit $${ev.profit}): no free slot before deadline ${ev.deadline}`);
      break;

    case 'complete':
      state.currentIdx = -1;
      updateStatus(`Done! Total profit = $${ev.totalProfit}, ${ev.scheduledCount} jobs scheduled`);
      break;
  }

  renderPanel();
  renderStepInspector();
  updateMetrics();
  render();
  return needsAnim;
}

async function stepForward() {
  if (state.phase !== 'running' || state.isPlaying || state.isStepping) return;
  if (state.currentStep >= state.trace.length - 1) { finishVisualization(); return; }

  state.isStepping = true;
  updateControls();
  try {
    state.currentStep += 1;
    const needsAnim = applyEvent(state.trace[state.currentStep]);
    if (needsAnim) await animateBars();
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
    const needsAnim = applyEvent(state.trace[state.currentStep]);
    if (needsAnim) await animateBars();
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
  renderPanel();
  renderStepInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  cancelAnim();
  state.phase = 'input';
  state.trace = [];
  state.currentStep = -1;
  state.jobs = [];
  state.n = 0;
  state.maxDeadline = 0;
  state.sortedJobs = [];
  state.displayOrder = [];
  state.sorted = false;
  state.animPositions = new Map();
  state.schedule = [];
  state.currentIdx = -1;
  state.totalProfit = 0;
  state.scheduledCount = 0;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('js-jobs').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter jobs (profit:deadline) then click Visualize.');
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

function cancelAnim() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

function barLayout() {
  const n = state.displayOrder.length;
  const barH = Math.min(34, (ch * 0.4 - 40) / n - 6);
  const gap = 6;
  const totalH = n * barH + (n - 1) * gap;
  const startY = 40;
  return { barH, gap, startY, totalH };
}

function slotY(slotIdx) {
  const { barH, gap, startY } = barLayout();
  return startY + slotIdx * (barH + gap);
}

function snapBarsToSlots() {
  for (let si = 0; si < state.displayOrder.length; si++) {
    const job = state.displayOrder[si];
    state.animPositions.set(job.origIdx, { y: slotY(si) });
  }
}

function animateBars(durationMs) {
  return new Promise(resolve => {
    cancelAnim();
    const starts = new Map();
    for (const [id, pos] of state.animPositions) {
      starts.set(id, pos.y);
    }
    const targets = new Map();
    for (let si = 0; si < state.displayOrder.length; si++) {
      const job = state.displayOrder[si];
      targets.set(job.origIdx, slotY(si));
    }

    const dur = durationMs || Math.max(300, 800 / state.speed);
    const t0 = performance.now();

    function frame(now) {
      if (!state) { resolve(); return; }
      let t = Math.min((now - t0) / dur, 1);
      t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      for (const [id, startY] of starts) {
        const targetY = targets.get(id);
        if (targetY !== undefined) {
          state.animPositions.set(id, { y: startY + (targetY - startY) * t });
        }
      }
      render();

      if (t < 1) {
        animFrameId = requestAnimationFrame(frame);
      } else {
        snapBarsToSlots();
        render();
        resolve();
      }
    }
    animFrameId = requestAnimationFrame(frame);
  });
}

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  drawJobList();
  drawTimeline();
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

function drawJobList() {
  const n = state.displayOrder.length;
  if (n === 0) return;

  const { barH } = barLayout();
  const barAreaX = 30;
  const maxProfit = Math.max(...state.jobs.map(j => j.profit));
  const barAreaW = cw * 0.35;
  const isFinal = state.phase === 'complete';

  for (let si = 0; si < n; si++) {
    const job = state.displayOrder[si];
    const origIdx = job.origIdx;
    const jc = JOB_COLORS[origIdx % JOB_COLORS.length];
    const posData = state.animPositions.get(origIdx);
    const y = posData ? posData.y : slotY(si);

    const isScheduled = state.schedule.some(s => s && s.origIdx === origIdx);
    const isCurrent = si === state.currentIdx;
    const isSkipped = !isScheduled && si < state.currentIdx && state.currentIdx >= 0;

    const fullBarW = (job.profit / maxProfit) * (barAreaW - 90);

    ctx.save();
    if (isCurrent) {
      ctx.shadowColor = C.intersection;
      ctx.shadowBlur = 10;
    } else if (isScheduled) {
      ctx.shadowColor = isFinal ? C.lineV : jc.border;
      ctx.shadowBlur = 6;
    }

    roundedRect(barAreaX + 70, y, fullBarW, barH, 4);
    if (isSkipped) {
      ctx.fillStyle = 'rgba(255,255,255,0.015)';
    } else if (isCurrent) {
      ctx.fillStyle = 'rgba(255,202,40,0.06)';
    } else if (isScheduled) {
      ctx.fillStyle = isFinal ? 'rgba(102,187,106,0.2)' : jc.fill;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
    }
    ctx.fill();

    ctx.strokeStyle = isSkipped ? 'rgba(200,200,208,0.06)' :
                      isCurrent ? C.intersection :
                      isScheduled ? (isFinal ? C.lineV : jc.border) :
                      'rgba(200,200,208,0.12)';
    ctx.lineWidth = isCurrent || isScheduled ? 1.5 : 1;
    ctx.stroke();
    ctx.restore();

    const labelColor = isSkipped ? C.textMuted :
                       isCurrent ? C.intersection :
                       isScheduled ? (isFinal ? C.lineV : jc.label) : C.text;
    ctx.fillStyle = labelColor;
    ctx.font = 'bold 11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`J${origIdx}`, barAreaX + 58, y + barH / 2);

    ctx.font = '9px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillStyle = isSkipped ? C.textMuted : C.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(`p=$${job.profit}`, barAreaX + 70 + fullBarW + 8, y + barH / 2 - 6);
    ctx.fillText(`d=${job.deadline}`, barAreaX + 70 + fullBarW + 8, y + barH / 2 + 7);

    if (isScheduled) {
      const slot = state.schedule.findIndex(s => s && s.origIdx === origIdx);
      ctx.fillStyle = isFinal ? C.lineV : jc.label;
      ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`slot ${slot}`, barAreaX + 70 + fullBarW / 2, y + barH / 2);
    } else if (isSkipped) {
      ctx.fillStyle = C.textMuted;
      ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SKIP', barAreaX + 70 + fullBarW / 2, y + barH / 2);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawTimeline() {
  const maxD = state.maxDeadline;
  if (maxD === 0) return;

  const isFinal = state.phase === 'complete';
  const timelineY = ch * 0.55;
  const slotH = Math.min(60, (ch - timelineY - 50) * 0.7);
  const padding = 60;
  const totalW = cw - padding * 2;
  const slotW = Math.min(100, totalW / maxD - 4);
  const totalSlotsW = maxD * slotW + (maxD - 1) * 4;
  const startX = (cw - totalSlotsW) / 2;

  ctx.fillStyle = C.textDim;
  ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SCHEDULE TIMELINE', cw / 2, timelineY - 12);

  for (let s = 1; s <= maxD; s++) {
    const x = startX + (s - 1) * (slotW + 4);
    const scheduled = state.schedule[s];

    ctx.save();
    if (scheduled) {
      const jc = JOB_COLORS[scheduled.origIdx % JOB_COLORS.length];
      ctx.shadowColor = isFinal ? C.lineV : jc.border;
      ctx.shadowBlur = 8;
      roundedRect(x, timelineY, slotW, slotH, 6);
      ctx.fillStyle = isFinal ? 'rgba(102,187,106,0.15)' : jc.fill;
      ctx.fill();
      ctx.strokeStyle = isFinal ? C.lineV : jc.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      roundedRect(x, timelineY, slotW, slotH, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,208,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    ctx.fillStyle = C.textDim;
    ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`t=${s}`, x + slotW / 2, timelineY + slotH + 16);

    if (scheduled) {
      const jc = JOB_COLORS[scheduled.origIdx % JOB_COLORS.length];
      ctx.fillStyle = isFinal ? C.lineV : jc.label;
      ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`J${scheduled.origIdx}`, x + slotW / 2, timelineY + slotH / 2 - 6);
      ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.fillText(`$${scheduled.profit}`, x + slotW / 2, timelineY + slotH / 2 + 10);
    } else {
      ctx.fillStyle = C.textMuted;
      ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('empty', x + slotW / 2, timelineY + slotH / 2 + 3);
    }
  }

  if (state.currentIdx >= 0 && state.currentIdx < state.displayOrder.length) {
    const job = state.displayOrder[state.currentIdx];
    const deadlineSlot = Math.min(job.deadline, maxD);
    for (let s = 1; s <= deadlineSlot; s++) {
      const x = startX + (s - 1) * (slotW + 4);
      if (!state.schedule[s]) {
        ctx.strokeStyle = C.intersection;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        roundedRect(x, timelineY, slotW, slotH, 6);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const dx = startX + (deadlineSlot - 1) * (slotW + 4) + slotW + 4;
    ctx.strokeStyle = C.intersection;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(dx, timelineY - 6);
    ctx.lineTo(dx, timelineY + slotH + 6);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = C.intersection;
    ctx.font = 'bold 9px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`deadline`, dx + 4, timelineY - 2);
  }

  if (state.scheduledCount > 0) {
    const summaryColor = isFinal ? C.lineV : C.text;
    ctx.fillStyle = summaryColor;
    ctx.font = 'bold 11px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Total profit: $${state.totalProfit}  (${state.scheduledCount}/${state.n} jobs)`, cw / 2, timelineY + slotH + 36);
  }

  ctx.textAlign = 'left';
}

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;

  let label, color;
  if (ev.type === 'complete') {
    label = `Maximum Profit: $${ev.totalProfit}`;
    color = C.lineV;
  } else if (ev.type === 'sort') {
    label = 'Sorted jobs by profit (greedy criterion)';
    color = C.accent;
  } else if (ev.type === 'schedule') {
    label = `Scheduled J${ev.origIdx} ($${ev.profit}) in slot ${ev.slot}`;
    color = C.lineV;
  } else if (ev.type === 'skip') {
    label = `J${ev.origIdx} ($${ev.profit}): all slots before deadline ${ev.deadline} are full`;
    color = C.textDim;
  } else if (ev.type === 'init') {
    label = `${ev.n} jobs, max deadline ${ev.maxDeadline}`;
    color = C.accent;
  } else {
    return;
  }

  ctx.fillStyle = color;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cw / 2, 22);
  ctx.textAlign = 'left';
}

function renderPanel() {
  const container = document.getElementById('js-table-container');
  const countEl = document.getElementById('js-table-count');
  if (!container || !countEl) return;

  if (state.phase === 'input' || state.n === 0) {
    container.innerHTML = '<div class="ev-empty">Enter jobs and click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.scheduledCount}/${state.n}`;

  let html = '<table class="ot-dp-table"><thead><tr>';
  html += '<th>#</th><th>Profit</th><th>Deadline</th><th>Status</th>';
  html += '</tr></thead><tbody>';

  for (let si = 0; si < state.displayOrder.length; si++) {
    const job = state.displayOrder[si];
    const origIdx = job.origIdx;
    const isScheduled = state.schedule.some(s => s && s.origIdx === origIdx);
    const isCurrent = si === state.currentIdx;
    const isSkipped = !isScheduled && si < state.currentIdx && state.currentIdx >= 0;

    let cls = '';
    if (isCurrent) cls = 'js-row-current';
    else if (isScheduled) cls = 'js-row-scheduled';
    else if (isSkipped) cls = '';

    let statusStr = '';
    if (isScheduled) {
      const slot = state.schedule.findIndex(s => s && s.origIdx === origIdx);
      statusStr = `slot ${slot}`;
    } else if (isSkipped) {
      statusStr = 'skipped';
    }

    html += `<tr class="${cls}"><td>J${origIdx}</td><td>$${job.profit}</td><td>${job.deadline}</td><td>${statusStr}</td></tr>`;
  }
  html += '</tbody></table>';

  container.innerHTML = html;
}

function renderStepInspector() {
  const inspEl = document.getElementById('js-inspector');
  const stepEl = document.getElementById('js-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Scheduled</span><strong>${state.scheduledCount}/${state.n}</strong></div>`;
  h += `<div class="mp-kv"><span>Total Profit</span><strong>$${state.totalProfit}</strong></div>`;

  if (ev && (ev.type === 'schedule' || ev.type === 'skip')) {
    h += `<div class="mp-block"><div class="mp-label">Greedy Choice</div>`;
    h += `<div class="mp-kv"><span>Job</span><strong>J${ev.origIdx} (profit $${ev.profit})</strong></div>`;
    h += `<div class="mp-kv"><span>Deadline</span><strong>${ev.deadline}</strong></div>`;

    if (ev.type === 'schedule') {
      h += `<div class="mp-kv"><span>Slot search</span><strong>${ev.slotsChecked.map(s => `t${s.slot}${s.available ? '(free)' : '(taken)'}`).join(' → ')}</strong></div>`;
      h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.lineV}">Scheduled at t=${ev.slot}</strong></div>`;
    } else {
      h += `<div class="mp-kv"><span>Slot search</span><strong>${ev.slotsChecked.map(s => `t${s.slot}(taken)`).join(' → ')}</strong></div>`;
      h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.sweep}">Skipped (no free slot)</strong></div>`;
    }
    h += '</div>';
  }

  if (ev && ev.type === 'sort') {
    h += `<div class="mp-block"><div class="mp-label">Sort Order (by profit)</div>`;
    for (let i = 0; i < ev.sorted.length; i++) {
      const s = ev.sorted[i];
      h += `<div class="mp-kv"><span>${i + 1}.</span><strong>J${s.origIdx}  $${s.profit}  (d=${s.deadline})</strong></div>`;
    }
    h += '</div>';
  }

  if (state.phase === 'complete') {
    h += `<div class="mp-block"><div class="mp-label">Solution</div>`;
    for (let s = 1; s <= state.maxDeadline; s++) {
      const sched = state.schedule[s];
      if (sched) {
        h += `<div class="mp-kv"><span>Slot ${s}</span><strong>J${sched.origIdx} ($${sched.profit})</strong></div>`;
      } else {
        h += `<div class="mp-kv"><span>Slot ${s}</span><strong style="color:${C.textMuted}">empty</strong></div>`;
      }
    }
    h += `<div class="mp-kv" style="margin-top:6px"><span>Total</span><strong class="qs-answer-value">$${state.totalProfit}</strong></div>`;
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
  document.getElementById('m-jobs').textContent = state.n || '0';
  document.getElementById('m-slots').textContent = state.maxDeadline > 0 ? state.maxDeadline : '-';
  document.getElementById('m-sched').textContent = state.scheduledCount > 0 ? `${state.scheduledCount}/${state.n}` : '-';
  document.getElementById('m-profit').textContent = state.totalProfit > 0 ? `$${state.totalProfit}` : '-';
}
