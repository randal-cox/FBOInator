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
  const incPct  = parseFloat(incEl.value);    // e.g., 40.0
  const N       = Math.max(0, Math.round(parseInt(maxNEl.value,10)));

  const base = basePct / 100.0; // 0.02
  const inc  = incPct  / 100.0; // 0.40

  const rows = [];
  let cumNot = 1.0;
  let sumP   = 0.0;

  for (let n = 0; n <= N; n++) {
    let p = base * Math.pow(1 + inc, n);
    p = clamp01(p);

    sumP += p;
    cumNot *= (1 - p);
    const cum = clamp01(1 - cumNot);
    const expectedFrac = sumP / (n + 1);

    rows.push([
      n,
      p * 100,            // P[this son is gay] %
      cum * 100,          // P[≥1 gay son up to n] %
      expectedFrac * 100  // Expected fraction %
    ]);
  }
  return rows;
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
    valueRange: [0, 101],
    // Extra room for labels (container CSS also provides padding)
    xLabelHeight: 18,
    yLabelWidth: 18,

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

  // Reapply series visibility after (re)draw
  seriesVisibility.forEach((vis, idx) => g.setVisibility(idx, vis));

  const enabled = data.length > 0;
  pngBtn.disabled = !enabled;
  svgBtn.disabled = !enabled;
  csvBtn.disabled = !enabled;
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
  const yMax = Math.max(100, Math.ceil(Math.max(...ys1, ...ys2, ...ys3)));
  const yMin = 0;

  const xScale = x => padL + (plotW * (x - xMin)) / (xMax - xMin || 1);
  const yScale = y => padT + plotH - (plotH * (y - yMin)) / (yMax - yMin || 1);
  const poly = arr => arr.map(([x,y]) => `${xScale(x)},${yScale(y)}`).join(' ');

  // grid + tick labels
  const parts = [];
  const yTicks = 5;
  for (let i=0;i<=yTicks;i++){
    const y = yMin + (i*(yMax - yMin)/yTicks);
    const yPix = yScale(y);
    parts.push(`<line x1="${padL}" y1="${yPix}" x2="${W-padR}" y2="${yPix}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>`);
    parts.push(`<text x="${padL-10}" y="${yPix+4}" text-anchor="end" font-size="12" fill="#000">${Math.round(y)}%</text>`);
  }
  for (let x=xMin; x<=xMax; x++){
    const xPix = xScale(x);
    parts.push(`<line x1="${xPix}" y1="${padT}" x2="${xPix}" y2="${H-padB}" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>`);
    parts.push(`<text x="${xPix}" y="${H-padB+24}" text-anchor="middle" font-size="12" fill="#000">${x}</text>`);
  }

  const path1 = poly(lastData.map(r => [r[0], r[1]]));
  const path2 = poly(lastData.map(r => [r[0], r[2]]));
  const path3 = poly(lastData.map(r => [r[0], r[3]]));

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${parts.join('\n')}
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="#000" stroke-width="1.5"/>
  <line x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="#000" stroke-width="1.5"/>

  <polyline fill="none" stroke="#4aa3ff" stroke-width="2.2" points="${path1}"/>
  <polyline fill="none" stroke="#23c55e" stroke-width="2.2" points="${path2}"/>
  <polyline fill="none" stroke="#ff6b6b" stroke-width="2.2" points="${path3}"/>

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
  const svg = buildSVG();
  if (!svg) return;
  const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'fboinator.svg'; a.click();
  URL.revokeObjectURL(url);
}

function downloadPNG() {
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
window.addEventListener('DOMContentLoaded', () => {
  // initialize checkbox UI to current state
  visThis.checked = seriesVisibility[0];
  visAny.checked  = seriesVisibility[1];
  visExp.checked  = seriesVisibility[2];

  // bind checkbox handlers
  (function bindVisibility(){
    function attach(box, idx) {
      box.addEventListener('change', () => {
        seriesVisibility[idx] = box.checked;
        if (g) g.setVisibility(idx, box.checked);
      });
    }
    attach(visThis, 0);
    attach(visAny,  1);
    attach(visExp,  2);
  })();

  // draw first chart
  draw();
});