import * as sweepLineIntersections from './algorithms/sweep-line-intersections.js';
import * as maximalPointsDivideConquer from './algorithms/maximal-points-divide-conquer.js';

const algorithms = [
  sweepLineIntersections,
  maximalPointsDivideConquer,
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
  dsPanel: document.getElementById('ds-panel'),
  infoPanel: document.getElementById('info-panel'),
  emptyState: document.getElementById('empty-state'),
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
    html += `<div class="nav-cat-header" data-cat="${catId}"><span class="arrow">&#9662;</span> ${catName}</div>`;
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

buildSidebar();

const initialId = location.hash.slice(1) || (algorithms[0] && algorithms[0].id);
if (initialId) {
  location.hash = initialId;
  navigate(initialId);
}
