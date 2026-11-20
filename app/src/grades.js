// Vice Panel Studio — colour grades.
// Each grade is a gradient map: luminance 0..1 runs through four colour
// stops (shadow, low-mid, high-mid, highlight), plus a soft tint overlay.
// buildGradeLookup turns the stops into a 256-entry RGB table that
// applyGradeMap stamps over a panel's pixels.

export const GRADES = [
  {
    id: 'vice',
    name: 'Vice Sunset',
    stops: [[0, '#160a2e'], [0.35, '#7b1e5b'], [0.7, '#ff5e3a'], [1, '#ffd23f']],
    tint: '#ff2e88',
    tintAlpha: 0.10,
    swatch: 'linear-gradient(135deg,#160a2e 0%,#7b1e5b 45%,#ff5e3a 75%,#ffd23f 100%)',
  },
  {
    id: 'neon',
    name: 'Neon Night',
    stops: [[0, '#04041a'], [0.35, '#1b2a6b'], [0.7, '#00c2ff'], [1, '#ff2fb3']],
    tint: '#2ee6ff',
    tintAlpha: 0.12,
    swatch: 'linear-gradient(135deg,#04041a 0%,#1b2a6b 45%,#00c2ff 75%,#ff2fb3 100%)',
  },
  {
    id: 'teal',
    name: 'Teal Pink',
    stops: [[0, '#04201f'], [0.35, '#0f766e'], [0.7, '#ff7ab8'], [1, '#ffe9f3']],
    tint: '#14b8a6',
    tintAlpha: 0.10,
    swatch: 'linear-gradient(135deg,#04201f 0%,#0f766e 45%,#ff7ab8 75%,#ffe9f3 100%)',
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    stops: [[0, '#1c1005'], [0.35, '#7a3b12'], [0.7, '#ff9a3c'], [1, '#fff3b0']],
    tint: '#ffb347',
    tintAlpha: 0.10,
    swatch: 'linear-gradient(135deg,#1c1005 0%,#7a3b12 45%,#ff9a3c 75%,#fff3b0 100%)',
  },
  {
    id: 'noir',
    name: 'Mono Noir',
    stops: [[0, '#000000'], [0.35, '#3a3a3a'], [0.7, '#9a9a9a'], [1, '#ffffff']],
    tint: '#888888',
    tintAlpha: 0.06,
    swatch: 'linear-gradient(135deg,#000 0%,#3a3a3a 45%,#9a9a9a 75%,#fff 100%)',
  },
  {
    id: 'haze',
    name: 'Purple Haze',
    stops: [[0, '#12051f'], [0.35, '#4c1d95'], [0.7, '#c026d3'], [1, '#fde68a']],
    tint: '#a855f7',
    tintAlpha: 0.12,
    swatch: 'linear-gradient(135deg,#12051f 0%,#4c1d95 45%,#c026d3 75%,#fde68a 100%)',
  },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) || GRADES[0];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Build the 256-entry lookup table for one grade.
export function buildGradeLookup(grade) {
  const stops = grade.stops.map(([t, hex]) => [t, hexToRgb(hex)]);
  const table = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const [t0, c0] = stops[s];
    const [t1, c1] = stops[s + 1];
    const f = t1 === t0 ? 0 : Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const [r, g, b] = mixRgb(c0, c1, f);
    table[i * 3] = r;
    table[i * 3 + 1] = g;
    table[i * 3 + 2] = b;
  }
  return table;
}

// Remap one panel's pixels through the grade table, blended by strength
// (0 = original photo, 1 = full gradient map).
export function applyGradeMap(imageData, lookup, strength) {
  const d = imageData.data;
  const s = Math.max(0, Math.min(1, strength));
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    const j = lum * 3;
    d[i] = Math.round(d[i] + (lookup[j] - d[i]) * s);
    d[i + 1] = Math.round(d[i + 1] + (lookup[j + 1] - d[i + 1]) * s);
    d[i + 2] = Math.round(d[i + 2] + (lookup[j + 2] - d[i + 2]) * s);
  }
  return imageData;
}
