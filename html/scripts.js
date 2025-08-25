// ===== Elements =====
const baseEl = document.getElementById('baseRate'); // % e.g., 2.00
const incEl  = document.getElementById('increase'); // % e.g., 40.0
const maxNEl = document.getElementById('maxN');     // integer

const resetBtn = document.getElementById('resetBtn');
const pngBtn   = document.getElementById('pngBtn');
const svgBtn   = document.getElementById('svgBtn');
const csvBtn   = document.getElementById('csvBtn');

const chartDiv = document.getElementById('chart');

// NEW: series visibility checkboxes
const visThis = document.getElementById('vis-this');
const visAny  = document.getElementById('vis-any');
const visExp  = document.getElementById('vis-exp');

// Annotation controls
const annEnableEl = document.getElementById('ann-enable');
const annListEl   = document.getElementById('ann-list');

// Persisted annotation state
let annState = { enabled: false, list: [] }; // list: [{n: Number, name: String}]


// ===== State =====
let g;                    // single Dygraph instance
let lastData = [];        // rows for export
let seriesVisibility = [true, true, true]; // [this, any, expected]

// ===== Utils =====
function clamp01(x){ return Math.max(0, Math.min(0.999, x)); }

// ===== Data =====
// Single multiplicative model: p_n = base * (1 + inc)^n
function computeData() {
  const basePct = parseFloat(baseEl.value);   // e.g., 2.00
  const incPct  = parseFloat(incEl.value);    // e.g., 40.0  => OR = 1 + 0.40
  const N       = Math.max(0, Math.round(parseInt(maxNEl.value,10)));

  const p0    = basePct / 100.0;          // 0.02
  const OR    = 1 + (incPct / 100.0);     // 1.40
  const odds0 = p0 / (1 - p0);

  const rows = [];
  let cumNot = 1.0;
  let sumP   = 0.0;

  for (let n = 0; n <= N; n++) {
    const odds_n = odds0 * Math.pow(OR, n);
    let p = odds_n / (1 + odds_n);

    // cap defensively (shouldn’t hit 1.0 unless inputs extreme)
    p = Math.min(Math.max(p, 0), 0.999);

    sumP += p;
    cumNot *= (1 - p);
    const cum = 1 - cumNot;
    const expectedFrac = sumP / (n + 1);

    rows.push([ n, p * 100, cum * 100, expectedFrac * 100 ]);
  }
  return rows;
}

function parseAnnotationList(text) {
  const out = [];
  if (!text) return out;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf(',');
    if (idx === -1) continue;
    const nStr = t.slice(0, idx).trim();
    const label = t.slice(idx + 1).trim();
    if (!label) continue;
    const n = parseInt(nStr, 10);
    if (!Number.isFinite(n) || n < 0) continue;
    out.push({ n, name: label });
  }
  return out;
}

// ===== Render =====
function draw() {
  const data = computeData();
  lastData = data;

  const labels = [
    "Older brothers (n)",
    "P[this son is gay] %",
    "P[≥1 gay son up to n] %",
    "Expected fraction %"
  ];

  g = new Dygraph(chartDiv, data, {
    labels,
    xlabel: "Number of prior sons (n)",
    ylabel: "Probability (%)",
    legend: "always",
    labelsSeparateLines: true,
    includeZero: true,
    showRangeSelector: false,      // drag to zoom; shift-drag to pan
    strokeWidth: 2,
    highlightCircleSize: 3,
    gridLineColor: "rgba(0,0,0,0.08)",
    valueRange: [0, 105],
    // Extra room for labels (container CSS also provides padding)
    xLabelHeight: 18,
    yLabelWidth: 18,
    underlayCallback: function(ctx, area, gref) {
      drawAnnotationOverlay(ctx, gref);
    },
    labelsDiv: document.getElementById('legend'),
    axes: {
      y: {
        // Force ticks at 0, 20, 40, 60, 80, 100 (with % labels)
        ticker: function() {
          const ticks = [];
          for (let v = 0; v <= 100; v += 20) {
            ticks.push({ v: v, label: v + "%" });
          }
          return ticks;
        },
        valueFormatter: v => v.toFixed(0) + "%",
        axisLabelFormatter: v => v.toFixed(0) + "%"
      },
      x: {
        axisLabelFormatter: v => String(v)
      }
    }

  });

  // Reapply series visibility
  seriesVisibility.forEach((vis, idx) => g.setVisibility(idx, vis));

  const enabled = data.length > 0;
  pngBtn.disabled = !enabled;
  svgBtn.disabled = !enabled;
  csvBtn.disabled = !enabled;



}

function drawAnnotationOverlay(ctx, g) {
  if (!annState.enabled || !annState.list || !annState.list.length) return;
  if (!lastData.length) return;

  // quick index for lookup by n
  const rowByN = new Map(lastData.map(r => [r[0], r]));

  // if multiple labels share the same n, stagger them vertically
  const counts = new Map(); // n -> count so far

  ctx.save();
  const seriesColor = g.getColors()[0] || '#000';
  ctx.strokeStyle = seriesColor;
  ctx.fillStyle   = '#000';
  ctx.textAlign   = 'center';
  ctx.textBaseline= 'bottom';
  ctx.font        = '700 12px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');

  for (const { n, name } of annState.list) {
    const row = rowByN.get(n);
    if (!row) continue;
    const yPercent = row[1]; // P[this son is gay] %
    const [xpx, ypx] = g.toDomCoords(n, yPercent);

    // vertical staggering if multiple on same n
    const k = (counts.get(n) || 0);
    counts.set(n, k + 1);
    const bump = k * 14; // 14px spacing per stacked label

    // tick
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xpx, ypx - 8);
    ctx.lineTo(xpx, ypx + 8);
    ctx.stroke();

    // name (centered)
    ctx.fillText(name, xpx, ypx - 10 - bump);
  }

  ctx.restore();
}
// ===== Controls =====
function resetDefaults() {
  baseEl.value = 2.00;
  incEl.value  = 40.0;
  maxNEl.value = 10;
  draw();
}

// Hook inputs to redraw
[baseEl, incEl, maxNEl].forEach(el => el.addEventListener('input', draw));

// Wire series visibility checkboxes
function bindVisibility() {
  function attach(box, idx) {
    box.addEventListener('change', () => {
      seriesVisibility[idx] = box.checked;
      if (g) g.setVisibility(idx, box.checked);
    });
  }
  attach(visThis, 0);
  attach(visAny,  1);
  attach(visExp,  2);
}

// ===== Exports =====

// Build SVG (used by both SVG and PNG exports) – includes labels & legend
function buildSVG() {
  if (!lastData.length) return "";

  const W = 900, H = 560, padL = 70, padR = 20, padT = 20, padB = 90;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const xs  = lastData.map(r => r[0]);
  const ys1 = lastData.map(r => r[1]);
  const ys2 = lastData.map(r => r[2]);
  const ys3 = lastData.map(r => r[3]);

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMax = 100, yMin = 0;  // fixed 0–100%

  const xScale = x => padL + (plotW * (x - xMin)) / (xMax - xMin || 1);
  const yScale = y => padT + plotH - (plotH * (y - yMin)) / (yMax - yMin || 1);
  const poly = arr => arr.map(([x,y]) => `${xScale(x)},${yScale(y)}`).join(' ');

  // grid + ticks at 0,20,40,60,80,100
  const parts = [];
  for (let v = 0; v <= 100; v += 20){
    const y = yScale(v);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`);
    parts.push(`<text x="${padL-10}" y="${y+4}" text-anchor="end" font-size="12" fill="#000">${v}%</text>`);
  }
  for (let x=xMin; x<=xMax; x++){
    const xp = xScale(x);
    parts.push(`<line x1="${xp}" y1="${padT}" x2="${xp}" y2="${H-padB}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>`);
    parts.push(`<text x="${xp}" y="${H-padB+24}" text-anchor="middle" font-size="12" fill="#000">${x}</text>`);
  }

  const path1 = poly(lastData.map(r => [r[0], r[1]]));
  const path2 = poly(lastData.map(r => [r[0], r[2]]));
  const path3 = poly(lastData.map(r => [r[0], r[3]]));

  // Annotations in SVG export (ticks + names)
  let annotSVG = '';
  if (annState && annState.enabled && annState.list && annState.list.length) {
    // map rows by n
    const rowByN = new Map(lastData.map(r => [r[0], r]));
    const counts = new Map();

    for (const { n, name } of annState.list) {
      const row = rowByN.get(n);
      if (!row) continue;
      const x = xScale(n);
      const y = yScale(row[1]); // marginal line (col 1)

      const k = (counts.get(n) || 0);
      counts.set(n, k + 1);
      const bump = k * 14;

      annotSVG += `
        <line x1="${x}" y1="${y-8}" x2="${x}" y2="${y+8}" stroke="#4aa3ff" stroke-width="2"/>
        <text x="${x}" y="${y-10 - bump}" text-anchor="middle" font-size="12" font-weight="700" fill="#000">${name}</text>
      `;
    }
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${parts.join('\n')}
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="#000" stroke-width="1.5"/>
  <line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="#000" stroke-width="1.5"/>

  <polyline fill="none" stroke="#4aa3ff" stroke-width="2.2" points="${path1}"/>
  <polyline fill="none" stroke="#23c55e" stroke-width="2.2" points="${path2}"/>
  <polyline fill="none" stroke="#ff6b6b" stroke-width="2.2" points="${path3}"/>

  ${annotSVG}

  <text x="${W/2}" y="${H-18}" text-anchor="middle" font-size="12" fill="#000">Number of prior sons (n)</text>
  <text transform="translate(16, ${H/2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#000">Probability (%)</text>

  <!-- legend (simple, no box) -->
  <circle cx="${W-260}" cy="${padT+16}" r="5" fill="#4aa3ff"/>
  <text x="${W-248}" y="${padT+20}" font-size="12" fill="#000">P[this son is gay]</text>
  <circle cx="${W-260}" cy="${padT+36}" r="5" fill="#23c55e"/>
  <text x="${W-248}" y="${padT+40}" font-size="12" fill="#000">P[≥1 gay son up to n]</text>
  <circle cx="${W-260}" cy="${padT+56}" r="5" fill="#ff6b6b"/>
  <text x="${W-248}" y="${padT+60}" font-size="12" fill="#000">Expected fraction</text>
</svg>`;
}

function downloadSVG() {
  try {
    const svg = buildSVG();
    if (!svg) return;
    const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fboinator.svg'; a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('SVG export failed:', e);
  }
}

function downloadPNG() {
  try {
    const svg = buildSVG();
    if (!svg) return;
    const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const W = img.width, H = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,W,H);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = 'fboinator.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  } catch (e) {
    console.error('PNG export failed:', e);
  }
}

function downloadCSV() {
  const header = "n,P_this_son_percent,P_at_least_one_percent,Expected_fraction_percent\n";
  const body = lastData.map(r =>
    `${r[0]},${r[1].toFixed(6)},${r[2].toFixed(6)},${r[3].toFixed(6)}`
  ).join("\n");
  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'fboinator.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ===== Init =====
// keep bindVisibility at top-level (as defined earlier)
function bindVisibility() {
  function attach(box, idx) {
    box.addEventListener('change', () => {
      seriesVisibility[idx] = box.checked;
      if (g) g.setVisibility(idx, box.checked);
    });
  }
  attach(visThis, 0);
  attach(visAny,  1);
  attach(visExp,  2);
}

// One and only one init
// One and only one init
window.addEventListener('DOMContentLoaded', () => {
  // 1) Series toggles
  visThis.checked = seriesVisibility[0];
  visAny.checked  = seriesVisibility[1];
  visExp.checked  = seriesVisibility[2];
  bindVisibility();

  // 2) Annotation controls
  function updateAnnotationState() {
    annState.enabled = !!annEnableEl.checked;
    annState.list    = parseAnnotationList(annListEl.value);
    draw();
  }
  annEnableEl.addEventListener('change', updateAnnotationState);
  annListEl.addEventListener('input', updateAnnotationState);

  // Optional: preload some examples
  // annEnableEl.checked = true;
  // annListEl.value = "7,Uncle Bill\n12,Duggar\n30,Russian woman";

  // Initialize from current UI
  annState.enabled = !!annEnableEl.checked;
  annState.list    = parseAnnotationList(annListEl.value);

  // 3) Export buttons
  pngBtn.addEventListener('click', downloadPNG);
  svgBtn.addEventListener('click', downloadSVG);
  csvBtn.addEventListener('click', downloadCSV);

  // 4) Draw
  draw();
});