import { C } from '../theme.js';

export const id = 'rabin-karp';
export const title = 'Rabin-Karp String Matching';
export const categories = ['string'];
export const badge = 'String';

let els, canvas, ctx;
let cw, ch, dpr;
let state, listeners;
let delayTimer, delayResolve;

const PRIME = 101;
const BASE = 256;

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
    text: '',
    pattern: '',
    phase: 'input',

    trace: [],
    currentStep: -1,

    windowStart: -1,
    patternHash: 0,
    windowHash: 0,
    matches: [],
    spurious: [],
    hashMatches: 0,

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
  updateStatus('Enter text and pattern, then click Visualize.');
  updateMetrics();
  renderPanel();
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
      <label>Text</label>
      <input type="text" id="rk-text" value="" placeholder="AABAACAADAABAABA" style="width:180px">
    </div>
    <div class="input-group">
      <label>Pattern</label>
      <input type="text" id="rk-pattern" value="" placeholder="AABA" style="width:80px">
    </div>
    <button id="btn-example">Example</button>
    <button id="btn-example2">DNA</button>
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
    <div class="ds-section rk-section-hash">
      <div class="ds-header">
        <span>Hash Values</span>
        <span class="ds-count" id="rk-hash-count"></span>
      </div>
      <div id="rk-hash-container" class="ot-scroll">
        <div class="ev-empty">Enter text and pattern, then click Visualize</div>
      </div>
    </div>
    <div class="ds-section rk-section-inspector">
      <div class="ds-header">
        <span>Step Inspector</span>
        <span class="ds-count" id="rk-step-count"></span>
      </div>
      <div id="rk-inspector" class="mp-inspector">
        <div class="ev-empty">No active step yet</div>
      </div>
    </div>
  `;

  els.infoPanel.innerHTML = `
    <div id="info-status">
      <span class="phase drawing">Input</span>
      Enter text and pattern, then click Visualize
    </div>
    <div class="info-metrics">
      <div class="info-metric"><span class="label">Text</span><span class="value" id="m-text">0</span></div>
      <div class="info-metric"><span class="label">Pattern</span><span class="value" id="m-pat">0</span></div>
      <div class="info-metric"><span class="label">Matches</span><span class="value" id="m-matches">-</span></div>
      <div class="info-metric"><span class="label">Hash Hits</span><span class="value" id="m-comp">-</span></div>
    </div>
  `;

  els.emptyState.innerHTML = `
    <div class="es-title">Rabin-Karp String Matching</div>
    <div class="es-sub">Rolling hash for efficient pattern search with O(n+m) average time</div>
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
  on(document.getElementById('btn-example2'), 'click', loadDNA);
  on(document.getElementById('btn-random'), 'click', loadRandom);
  on(document.getElementById('btn-run'), 'click', startVisualization);
  on(document.getElementById('btn-step'), 'click', stepForward);
  on(document.getElementById('btn-play'), 'click', togglePlay);
  on(document.getElementById('btn-reset'), 'click', resetVisualization);
  on(document.getElementById('speed'), 'input', updateSpeed);
  on(document.getElementById('rk-text'), 'input', onInputChange);
  on(document.getElementById('rk-pattern'), 'input', onInputChange);
}

function handleResize() { setupCanvas(); render(); }
function onInputChange() { updateControls(); }

function parseInput() {
  const text = document.getElementById('rk-text').value;
  const pattern = document.getElementById('rk-pattern').value;
  return { text, pattern };
}

function inputValid() {
  const { text, pattern } = parseInput();
  return text.length >= 1 && pattern.length >= 1 &&
         pattern.length <= text.length && text.length <= 40;
}

function loadExample() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('rk-text').value = 'AABAACAADAABAABA';
  document.getElementById('rk-pattern').value = 'AABA';
  updateControls();
}

function loadDNA() {
  if (state.phase !== 'input') resetVisualization();
  document.getElementById('rk-text').value = 'ATCGATCGATCATCGA';
  document.getElementById('rk-pattern').value = 'ATCG';
  updateControls();
}

function loadRandom() {
  if (state.phase !== 'input') resetVisualization();
  const alpha = 'ABCD';
  const patLen = 3 + Math.floor(Math.random() * 3);
  let pattern = '';
  for (let i = 0; i < patLen; i++) pattern += alpha[Math.floor(Math.random() * alpha.length)];

  const textLen = 16 + Math.floor(Math.random() * 10);
  let text = '';
  for (let i = 0; i < textLen; i++) {
    if (i + patLen <= textLen && Math.random() < 0.15) {
      text += pattern;
      i += patLen - 1;
    } else {
      text += alpha[Math.floor(Math.random() * alpha.length)];
    }
  }

  document.getElementById('rk-text').value = text.slice(0, 40);
  document.getElementById('rk-pattern').value = pattern;
  updateControls();
}

function computeHash(str, len) {
  let hash = 0;
  for (let i = 0; i < len; i++) {
    hash = (hash * BASE + str.charCodeAt(i)) % PRIME;
  }
  return hash;
}

function rollingHash(oldHash, oldChar, newChar, h) {
  let hash = (BASE * (oldHash - oldChar.charCodeAt(0) * h) + newChar.charCodeAt(0)) % PRIME;
  if (hash < 0) hash += PRIME;
  return hash;
}

function buildTrace(text, pattern) {
  const n = text.length;
  const m = pattern.length;
  const trace = [];

  let h = 1;
  for (let i = 0; i < m - 1; i++) h = (h * BASE) % PRIME;

  const patHash = computeHash(pattern, m);
  let windowHash = computeHash(text, m);

  trace.push({ type: 'init', patHash, windowHash, h, n, m });

  for (let i = 0; i <= n - m; i++) {
    if (i > 0) {
      const oldHash = windowHash;
      windowHash = rollingHash(oldHash, text[i - 1], text[i + m - 1], h);
      trace.push({
        type: 'roll',
        pos: i,
        oldHash,
        newHash: windowHash,
        removedChar: text[i - 1],
        addedChar: text[i + m - 1],
      });
    }

    if (windowHash === patHash) {
      let match = true;
      const compared = [];
      for (let j = 0; j < m; j++) {
        const eq = text[i + j] === pattern[j];
        compared.push({ pos: j, textChar: text[i + j], patChar: pattern[j], equal: eq });
        if (!eq) { match = false; break; }
      }
      trace.push({
        type: 'hash-match',
        pos: i,
        hash: windowHash,
        verified: match,
        compared,
      });
    } else {
      trace.push({
        type: 'hash-mismatch',
        pos: i,
        windowHash,
        patHash,
      });
    }
  }

  trace.push({ type: 'complete' });
  return trace;
}

function startVisualization() {
  if (!inputValid()) return;
  const { text, pattern } = parseInput();

  state.text = text;
  state.pattern = pattern;
  state.phase = 'running';

  state.trace = buildTrace(text, pattern);
  state.currentStep = -1;
  state.windowStart = -1;
  state.patternHash = 0;
  state.windowHash = 0;
  state.matches = [];
  state.spurious = [];
  state.hashMatches = 0;

  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('rk-text').disabled = true;
  document.getElementById('rk-pattern').disabled = true;

  updateControls();
  updateEmptyState();
  updateStatus('Trace ready. Step through Rabin-Karp or press Play.');
  updateMetrics();
  renderPanel();
  renderStepInspector();
  render();
}

function applyEvent(ev) {
  switch (ev.type) {
    case 'init':
      state.patternHash = ev.patHash;
      state.windowHash = ev.windowHash;
      state.windowStart = 0;
      updateStatus(`Pattern hash = ${ev.patHash}, initial window hash = ${ev.windowHash} (mod ${PRIME})`);
      break;

    case 'roll':
      state.windowStart = ev.pos;
      state.windowHash = ev.newHash;
      updateStatus(`Roll: remove '${ev.removedChar}', add '${ev.addedChar}' → hash = ${ev.newHash}`);
      break;

    case 'hash-match':
      state.windowStart = ev.pos;
      state.hashMatches++;
      if (ev.verified) {
        state.matches.push(ev.pos);
        updateStatus(`Hash match at pos ${ev.pos}! Character verification: MATCH found!`);
      } else {
        state.spurious.push(ev.pos);
        updateStatus(`Hash match at pos ${ev.pos}, but character check failed (spurious hit).`);
      }
      break;

    case 'hash-mismatch':
      state.windowStart = ev.pos;
      state.windowHash = ev.windowHash;
      updateStatus(`Pos ${ev.pos}: hash ${ev.windowHash} ≠ ${ev.patHash}. Skip (no char comparison needed).`);
      break;

    case 'complete':
      state.windowStart = -1;
      updateStatus(`Done! Found ${state.matches.length} match${state.matches.length !== 1 ? 'es' : ''} at: [${state.matches.join(', ')}]`);
      break;
  }

  renderPanel();
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
  renderPanel();
  renderStepInspector();
  render();
}

function resetVisualization() {
  cancelDelay();
  state.phase = 'input';
  state.trace = [];
  state.currentStep = -1;
  state.text = '';
  state.pattern = '';
  state.windowStart = -1;
  state.patternHash = 0;
  state.windowHash = 0;
  state.matches = [];
  state.spurious = [];
  state.hashMatches = 0;
  state.isPlaying = false;
  state.isStepping = false;

  document.getElementById('rk-text').disabled = false;
  document.getElementById('rk-pattern').disabled = false;

  updateControls();
  updateEmptyState();
  updateStatus('Enter text and pattern, then click Visualize.');
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

function updateSpeed() {
  state.speed = parseInt(document.getElementById('speed').value, 10);
  state.animDelay = 1200 / state.speed;
}

function render() {
  ctx.clearRect(0, 0, cw, ch);
  drawGrid();
  if (state.phase === 'input') return;
  drawTextRow();
  drawPatternRow();
  drawHashInfo();
  drawMatchMarkers();
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

function charLayout() {
  const n = state.text.length;
  const maxCharW = 30;
  const padding = 40;
  const available = cw - padding * 2;
  const charW = Math.min(maxCharW, available / n);
  const totalW = n * charW;
  const startX = (cw - totalW) / 2;
  return { charW, startX, n };
}

function drawTextRow() {
  const { charW, startX, n } = charLayout();
  const textY = ch * 0.28;
  const cellH = 36;
  const m = state.pattern.length;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  for (let i = 0; i < n; i++) {
    const x = startX + i * charW;
    const isInWindow = state.windowStart >= 0 && i >= state.windowStart && i < state.windowStart + m;

    let bgColor = 'rgba(255,255,255,0.02)';
    let borderColor = 'rgba(200,200,208,0.08)';

    if (isInWindow) {
      if (ev && ev.type === 'hash-match') {
        const charIdx = i - state.windowStart;
        const comp = ev.compared.find(c => c.pos === charIdx);
        if (comp) {
          if (comp.equal) {
            bgColor = 'rgba(102,187,106,0.15)';
            borderColor = C.lineV;
          } else {
            bgColor = 'rgba(239,83,80,0.15)';
            borderColor = '#ef5350';
          }
        } else {
          bgColor = 'rgba(255,202,40,0.08)';
          borderColor = C.intersection;
        }
      } else {
        bgColor = 'rgba(255,202,40,0.08)';
        borderColor = C.intersection;
      }
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(x + 0.5, textY, charW - 1, cellH);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isInWindow ? 1.5 : 0.5;
    ctx.strokeRect(x + 0.5, textY, charW - 1, cellH);

    ctx.fillStyle = isInWindow ? C.intersection : C.text;
    ctx.font = 'bold 14px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.text[i], x + charW / 2, textY + cellH / 2);

    ctx.fillStyle = C.textMuted;
    ctx.font = '8px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.fillText(String(i), x + charW / 2, textY + cellH + 12);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawPatternRow() {
  const { charW, startX } = charLayout();
  const patY = ch * 0.50;
  const cellH = 36;
  const m = state.pattern.length;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  const isFinal = state.phase === 'complete';

  const patStartX = state.windowStart >= 0 ? startX + state.windowStart * charW : startX;

  for (let j = 0; j < m; j++) {
    const x = patStartX + j * charW;

    let bgColor = 'rgba(124,77,255,0.08)';
    let borderColor = '#7c4dff';
    let textColor = '#b39ddb';

    if (ev && ev.type === 'hash-match') {
      const comp = ev.compared.find(c => c.pos === j);
      if (comp) {
        if (comp.equal) {
          bgColor = 'rgba(102,187,106,0.15)';
          borderColor = C.lineV;
          textColor = C.lineV;
        } else {
          bgColor = 'rgba(239,83,80,0.15)';
          borderColor = '#ef5350';
          textColor = '#ef5350';
        }
      }
    } else if (isFinal) {
      bgColor = 'rgba(102,187,106,0.1)';
      borderColor = C.lineV;
      textColor = C.lineV;
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(x + 0.5, patY, charW - 1, cellH);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 0.5, patY, charW - 1, cellH);

    ctx.fillStyle = textColor;
    ctx.font = 'bold 14px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.pattern[j], x + charW / 2, patY + cellH / 2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  if (state.windowStart >= 0 && state.phase === 'running') {
    const midX = patStartX + m * charW / 2;
    const midY = ch * 0.39 + 18;
    const hashEq = state.windowHash === state.patternHash;

    ctx.fillStyle = hashEq ? C.lineV : C.textDim;
    ctx.font = 'bold 10px JetBrains Mono, Fira Code, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(hashEq ? `hash ${state.windowHash} = ${state.patternHash} ✓` : `hash ${state.windowHash} ≠ ${state.patternHash}`,
      midX, midY);
    ctx.textAlign = 'left';
  }
}

function drawHashInfo() {
  const infoY = ch * 0.72;
  const isFinal = state.phase === 'complete';

  ctx.fillStyle = C.textDim;
  ctx.font = '10px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';

  if (!isFinal && state.windowStart >= 0) {
    ctx.fillText(`base=${BASE}  prime=${PRIME}  pattern_hash=${state.patternHash}  window_hash=${state.windowHash}`,
      cw / 2, infoY);
  }

  if (!isFinal && state.currentStep >= 0) {
    const ev = state.trace[state.currentStep];
    if (ev && ev.type === 'roll') {
      ctx.fillStyle = C.accent;
      ctx.fillText(`new_hash = (${BASE} × (${ev.oldHash} - ord('${ev.removedChar}')×h) + ord('${ev.addedChar}')) mod ${PRIME} = ${ev.newHash}`,
        cw / 2, infoY + 18);
    }
  }
  ctx.textAlign = 'left';
}

function drawMatchMarkers() {
  const { charW, startX } = charLayout();
  const markerY = ch * 0.28 - 16;

  for (const pos of state.matches) {
    const cx = startX + pos * charW + charW / 2;

    ctx.save();
    ctx.fillStyle = C.lineV;
    ctx.shadowColor = C.lineV;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(cx, markerY + 8);
    ctx.lineTo(cx - 5, markerY);
    ctx.lineTo(cx + 5, markerY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const pos of state.spurious) {
    const cx = startX + pos * charW + charW / 2;

    ctx.strokeStyle = '#ef5350';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 4, markerY - 2);
    ctx.lineTo(cx + 4, markerY + 6);
    ctx.moveTo(cx + 4, markerY - 2);
    ctx.lineTo(cx - 4, markerY + 6);
    ctx.stroke();
  }
}

function drawTitle() {
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;
  if (!ev) return;

  let label, color;
  if (ev.type === 'complete') {
    label = `Found ${state.matches.length} match${state.matches.length !== 1 ? 'es' : ''}`;
    color = C.lineV;
  } else if (ev.type === 'hash-match') {
    label = ev.verified ? `Match confirmed at position ${ev.pos}!` : `Spurious hit at position ${ev.pos}`;
    color = ev.verified ? C.lineV : '#ef5350';
  } else if (ev.type === 'hash-mismatch') {
    label = `Position ${ev.pos}: hash mismatch, skip`;
    color = C.textDim;
  } else if (ev.type === 'roll') {
    label = `Rolling hash to position ${ev.pos}`;
    color = C.accent;
  } else if (ev.type === 'init') {
    label = `Pattern hash = ${ev.patHash}, window hash = ${ev.windowHash}`;
    color = C.accent;
  } else {
    return;
  }

  ctx.fillStyle = color;
  ctx.font = 'bold 12px JetBrains Mono, Fira Code, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, cw / 2, 20);
  ctx.textAlign = 'left';
}

function renderPanel() {
  const container = document.getElementById('rk-hash-container');
  const countEl = document.getElementById('rk-hash-count');
  if (!container || !countEl) return;

  if (state.phase === 'input') {
    container.innerHTML = '<div class="ev-empty">Enter text and pattern, then click Visualize</div>';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${state.matches.length} match${state.matches.length !== 1 ? 'es' : ''}`;

  let html = '<table class="ot-dp-table"><thead><tr>';
  html += '<th>Pos</th><th>Window</th><th>Hash</th><th>Result</th>';
  html += '</tr></thead><tbody>';

  const m = state.pattern.length;
  for (let i = 0; i <= state.currentStep; i++) {
    const ev = state.trace[i];
    if (ev.type === 'hash-mismatch') {
      const window = state.text.slice(ev.pos, ev.pos + m);
      html += `<tr><td>${ev.pos}</td><td>${window}</td><td>${ev.windowHash}</td><td style="color:${C.textMuted}">skip</td></tr>`;
    } else if (ev.type === 'hash-match') {
      const window = state.text.slice(ev.pos, ev.pos + m);
      if (ev.verified) {
        html += `<tr class="rk-row-match"><td>${ev.pos}</td><td>${window}</td><td>${ev.hash}</td><td style="color:${C.lineV}">MATCH</td></tr>`;
      } else {
        html += `<tr class="rk-row-spurious"><td>${ev.pos}</td><td>${window}</td><td>${ev.hash}</td><td style="color:#ef5350">spurious</td></tr>`;
      }
    }
  }
  html += '</tbody></table>';

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

function renderStepInspector() {
  const inspEl = document.getElementById('rk-inspector');
  const stepEl = document.getElementById('rk-step-count');
  if (!inspEl || !stepEl) return;

  if (state.phase === 'input' || state.trace.length === 0) {
    stepEl.textContent = '';
    inspEl.innerHTML = '<div class="ev-empty">No active step yet</div>';
    return;
  }

  stepEl.textContent = `${Math.max(0, state.currentStep + 1)}/${state.trace.length}`;
  const ev = state.currentStep >= 0 ? state.trace[state.currentStep] : null;

  let h = '';
  h += `<div class="mp-kv"><span>Pattern Hash</span><strong>${state.patternHash}</strong></div>`;
  h += `<div class="mp-kv"><span>Window Hash</span><strong>${state.windowHash}</strong></div>`;
  h += `<div class="mp-kv"><span>Window Pos</span><strong>${state.windowStart >= 0 ? state.windowStart : '-'}</strong></div>`;
  h += `<div class="mp-kv"><span>Matches Found</span><strong>${state.matches.length}</strong></div>`;

  if (ev && ev.type === 'hash-match') {
    h += `<div class="mp-block"><div class="mp-label">Character Verification</div>`;
    for (const c of ev.compared) {
      const sym = c.equal ? '=' : '≠';
      const color = c.equal ? C.lineV : '#ef5350';
      h += `<div class="mp-kv"><span>pos ${c.pos}: '${c.textChar}' ${sym} '${c.patChar}'</span><strong style="color:${color}">${c.equal ? 'match' : 'FAIL'}</strong></div>`;
    }
    h += `<div class="mp-kv"><span>Result</span><strong style="color:${ev.verified ? C.lineV : '#ef5350'}">${ev.verified ? 'Confirmed Match' : 'Spurious Hit'}</strong></div>`;
    h += '</div>';
  }

  if (ev && ev.type === 'roll') {
    h += `<div class="mp-block"><div class="mp-label">Rolling Hash</div>`;
    h += `<div class="mp-kv"><span>Remove</span><strong>'${ev.removedChar}' (left)</strong></div>`;
    h += `<div class="mp-kv"><span>Add</span><strong>'${ev.addedChar}' (right)</strong></div>`;
    h += `<div class="mp-kv"><span>Old hash</span><strong>${ev.oldHash}</strong></div>`;
    h += `<div class="mp-kv"><span>New hash</span><strong>${ev.newHash}</strong></div>`;
    h += '</div>';
  }

  if (ev && ev.type === 'hash-mismatch') {
    h += `<div class="mp-block"><div class="mp-label">Hash Check</div>`;
    h += `<div class="mp-kv"><span>Window hash</span><strong>${ev.windowHash}</strong></div>`;
    h += `<div class="mp-kv"><span>Pattern hash</span><strong>${ev.patHash}</strong></div>`;
    h += `<div class="mp-kv"><span>Result</span><strong style="color:${C.textMuted}">Mismatch → skip</strong></div>`;
    h += '</div>';
  }

  if (state.phase === 'complete') {
    h += `<div class="mp-block"><div class="mp-label">Summary</div>`;
    h += `<div class="mp-kv"><span>Matches</span><strong class="qs-answer-value">${state.matches.length} at [${state.matches.join(', ')}]</strong></div>`;
    h += `<div class="mp-kv"><span>Hash hits</span><strong>${state.hashMatches}</strong></div>`;
    h += `<div class="mp-kv"><span>Spurious</span><strong>${state.spurious.length}</strong></div>`;
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
  const example2 = document.getElementById('btn-example2');
  const random = document.getElementById('btn-random');

  const isInput = state.phase === 'input';
  const running = state.phase === 'running';

  run.disabled = !isInput || !inputValid();
  step.disabled = !running || state.isPlaying || state.isStepping;
  play.disabled = !running || state.isStepping;
  play.textContent = state.isPlaying ? 'Pause' : 'Play';
  reset.disabled = isInput;
  example.disabled = !isInput;
  example2.disabled = !isInput;
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
  document.getElementById('m-text').textContent = state.text.length || '0';
  document.getElementById('m-pat').textContent = state.pattern.length || '0';
  document.getElementById('m-matches').textContent = state.matches.length > 0 ? state.matches.length : '-';
  document.getElementById('m-comp').textContent = state.hashMatches > 0 ? state.hashMatches : '-';
}
