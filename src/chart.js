'use strict';

// Small line charts drawn as SVG on the server. No chart library and no
// JavaScript needed. Each line also has its own dash pattern and marker
// shape, so the chart does not rely on colour alone. A data table is always
// shown next to the chart for screen readers.

const { bands } = require('./content');

const SERIES = [
  { key: 'overall', label: 'Whole day', color: '#028090', dash: '', marker: 'circle', width: 3.5 },
  { key: 'morning', label: 'Morning', color: '#B04A12', dash: '8 5', marker: 'square', width: 2 },
  { key: 'afternoon', label: 'Afternoon', color: '#6A3D9A', dash: '2 4', marker: 'triangle', width: 2 },
  { key: 'evening', label: 'Evening', color: '#3B6E22', dash: '12 4 3 4', marker: 'diamond', width: 2 },
];

const BAND_FILL = { mild: '#F3F7F2', moderate: '#FBF5E6', severe: '#FBEDEA' };

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function marker(shape, x, y, color) {
  const r = 5;
  switch (shape) {
    case 'square':
      return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${color}"/>`;
    case 'triangle':
      return `<polygon points="${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}" fill="${color}"/>`;
    case 'diamond':
      return `<polygon points="${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}" fill="${color}"/>`;
    default:
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
  }
}

// rows: [{ week, overall, morning, afternoon, evening }] with null for no data.
function lineChart(rows, { title, series = ['overall', 'morning', 'afternoon', 'evening'] } = {}) {
  const W = 480;
  const H = 300;
  const pad = { l: 44, r: 44, t: 16, b: 44 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (rows.length === 1 ? iw / 2 : (iw * i) / (rows.length - 1));
  const y = (v) => pad.t + ih - (ih * v) / 10;
  const parts = [];

  for (const b of bands) {
    const top = y(b.max + (b.max === 10 ? 0 : 0.5));
    const bottom = y(Math.max(0, b.min - 0.5));
    parts.push(`<rect x="${pad.l}" y="${top}" width="${iw}" height="${bottom - top}" fill="${BAND_FILL[b.key]}"/>`);
    parts.push(`<text x="${W - pad.r - 8}" y="${y((b.min + b.max) / 2) + 6}" text-anchor="end" class="chart-band">${esc(b.label)}</text>`);
  }
  for (let v = 0; v <= 10; v += 2) {
    parts.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#D8D8D8" stroke-width="1"/>`);
    parts.push(`<text x="${pad.l - 8}" y="${y(v) + 5}" text-anchor="end" class="chart-axis">${v}</text>`);
  }
  rows.forEach((r, i) => {
    parts.push(`<text x="${x(i)}" y="${H - 14}" text-anchor="middle" class="chart-axis">Week ${r.week}</text>`);
  });

  for (const s of SERIES.filter((s) => series.includes(s.key))) {
    let path = '';
    let pen = false;
    rows.forEach((r, i) => {
      const v = r[s.key];
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    if (path) {
      parts.push(`<path d="${path.trim()}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-dasharray="${s.dash}" stroke-linejoin="round"/>`);
    }
    rows.forEach((r, i) => {
      const v = r[s.key];
      if (v !== null && v !== undefined) parts.push(marker(s.marker, x(i), y(v), s.color));
    });
  }

  const legend = SERIES.filter((s) => series.includes(s.key))
    .map(
      (s) =>
        `<li><svg width="34" height="14" aria-hidden="true" focusable="false"><line x1="1" x2="33" y1="7" y2="7" stroke="${s.color}" stroke-width="${s.width}" stroke-dasharray="${s.dash}"/>${marker(s.marker, 17, 7, s.color)}</svg>${esc(s.label)}</li>`
    )
    .join('');

  return (
    `<figure class="chart">` +
    `<figcaption>${esc(title || '')}</figcaption>` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || 'Chart')}. The same numbers are in the table below." preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>` +
    `<ul class="chart-legend">${legend}</ul>` +
    `</figure>`
  );
}

module.exports = { lineChart, SERIES };
