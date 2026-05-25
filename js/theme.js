function cssVar(name, fallback) {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export const C = Object.freeze({
  accent: cssVar('--accent', '#7c4dff'),
  accentLight: cssVar('--accent-light', '#a48fff'),
  accentDim: cssVar('--accent-dim', 'rgba(124,77,255,0.15)'),
  lineH: cssVar('--line-h', '#4fc3f7'),
  lineV: cssVar('--line-v', '#66bb6a'),
  sweep: cssVar('--sweep', '#ef5350'),
  intersection: cssVar('--intersection', '#ffca28'),
  activeLine: cssVar('--active-line', '#ce93d8'),
  text: cssVar('--text', '#c8c8d0'),
  textDim: cssVar('--text-dim', '#666680'),
  textMuted: cssVar('--text-muted', '#44445a'),
  bgCanvas: cssVar('--bg-canvas', '#0d1117'),
});
