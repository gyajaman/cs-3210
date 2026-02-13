import * as sweepLineIntersections from './algorithms/sweep-line-intersections.js';
import * as maximalPointsDivideConquer from './algorithms/maximal-points-divide-conquer.js';
import * as maximalPointsSweepLine from './algorithms/maximal-points-sweep-line.js';
import * as karatsubaMultiplication from './algorithms/karatsuba-multiplication.js';
import * as quickselect from './algorithms/quickselect.js';

const algorithms = [
  sweepLineIntersections,
  maximalPointsSweepLine,
  maximalPointsDivideConquer,
  karatsubaMultiplication,
  quickselect,
];

const categoryNames = {
  'sweep-line': 'Sweep Line',
  'divide-conquer': 'Divide & Conquer',
  'dynamic-programming': 'Dynamic Programming',
  'graph': 'Graph Algorithms',
  'geometry': 'Computational Geometry',
};

const categoryOrder = Object.keys(categoryNames);

let currentAlgo = null;

const els = {
  sidebarNav: document.getElementById('sidebar-nav'),
  algoTitle: document.getElementById('algo-title'),
  algoBadge: document.getElementById('algo-badge'),
  toolbarControls: document.getElementById('toolbar-controls'),
  canvas: document.getElementById('canvas'),
  canvasContainer: document.getElementById('canvas-container'),
  dsPanel: document.getElementById('ds-panel-content'),
  dsPanelContainer: document.getElementById('ds-panel'),
  infoPanel: document.getElementById('info-panel'),
  emptyState: document.getElementById('empty-state'),
  sidebar: document.getElementById('sidebar'),
  app: document.getElementById('app'),
};

function buildSidebar() {
  const grouped = {};
  for (const algo of algorithms) {
    if (!grouped[algo.category]) grouped[algo.category] = [];
    grouped[algo.category].push(algo);
  }

  let html = '';
  for (const catId of categoryOrder) {
    if (!grouped[catId]) continue;
    const catName = categoryNames[catId];
    html += `<div class="nav-category">`;
    html += `<div class="nav-cat-header" data-cat="${catId}"><span class="arrow">&#9662;</span><span class="nav-cat-title">${catName}</span></div>`;
    html += `<div class="nav-items" data-cat-items="${catId}">`;
    for (const algo of grouped[catId]) {
      html += `<a class="nav-item" data-algo="${algo.id}" href="#${algo.id}">${algo.title}</a>`;
    }
    html += `</div></div>`;
  }

  els.sidebarNav.innerHTML = html;

  els.sidebarNav.querySelectorAll('.nav-cat-header').forEach(header => {
    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      const items = header.nextElementSibling;
      if (items.classList.contains('collapsed')) {
        items.classList.remove('collapsed');
        items.style.maxHeight = items.scrollHeight + 'px';
      } else {
        items.style.maxHeight = items.scrollHeight + 'px';
        requestAnimationFrame(() => items.classList.add('collapsed'));
      }
    });
  });

  els.sidebarNav.querySelectorAll('.nav-items').forEach(el => {
    el.style.maxHeight = el.scrollHeight + 'px';
  });
}

function updateSidebarActive(algoId) {
  els.sidebarNav.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.algo === algoId);
  });
}

function navigate(algoId) {
  if (currentAlgo) {
    currentAlgo.destroy();
    currentAlgo = null;
  }

  els.toolbarControls.innerHTML = '';
  els.dsPanel.innerHTML = '';
  els.infoPanel.innerHTML = '';
  els.emptyState.innerHTML = '';
  els.emptyState.className = '';

  const algo = algorithms.find(a => a.id === algoId);
  if (!algo) {
    if (algorithms.length > 0) {
      location.hash = algorithms[0].id;
    }
    return;
  }

  els.algoTitle.textContent = algo.title;
  els.algoBadge.textContent = algo.badge;
  document.title = `${algo.title} - Algorithm Visualizer`;

  algo.init({
    canvas: els.canvas,
    canvasContainer: els.canvasContainer,
    dsPanel: els.dsPanel,
    toolbarControls: els.toolbarControls,
    infoPanel: els.infoPanel,
    emptyState: els.emptyState,
  });

  currentAlgo = algo;
  updateSidebarActive(algoId);
}

window.addEventListener('hashchange', () => {
  navigate(location.hash.slice(1));
});

function setupResizablePanel(panel, property, minWidth = 150, maxWidth = 600) {
  const handle = document.createElement('div');
  handle.className = `resize-handle ${property === '--sidebar-width' ? 'resize-handle-left' : 'resize-handle-right'}`;
  panel.appendChild(handle);

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  // Load saved width from localStorage
  const savedWidth = localStorage.getItem(property);
  if (savedWidth) {
    document.documentElement.style.setProperty(property, savedWidth);
  }

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    const currentWidth = getComputedStyle(document.documentElement).getPropertyValue(property);
    startWidth = parseInt(currentWidth) || (property === '--sidebar-width' ? 250 : 250);
    handle.classList.add('resizing');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const delta = property === '--sidebar-width' ? (e.clientX - startX) : (startX - e.clientX);
    let newWidth = startWidth + delta;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    document.documentElement.style.setProperty(property, `${newWidth}px`);
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save width to localStorage
      const currentWidth = getComputedStyle(document.documentElement).getPropertyValue(property);
      localStorage.setItem(property, currentWidth);
    }
  });
}

buildSidebar();
setupResizablePanel(els.sidebar, '--sidebar-width', 150, 600);
setupResizablePanel(els.dsPanelContainer, '--ds-panel-width', 200, 600);

const initialId = location.hash.slice(1) || (algorithms[0] && algorithms[0].id);
if (initialId) {
  location.hash = initialId;
  navigate(initialId);
}
