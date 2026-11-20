// Vice Panel Studio — the cover renderer.
// renderCover draws one full cover onto a canvas of any size: panels with
// gradient-map grades, ink or polaroid frames, halftone title block,
// badge ribbon, heat stars, film grain and vignette. Everything is drawn
// with plain canvas 2D, no network, no libraries.

import { gradeById, buildGradeLookup, applyGradeMap } from './grades.js';
import { layoutById, panelRect, titleZoneRect } from './layouts.js';

const DARK = '#14091f';
const GOLD = '#ffd23f';
const PINK = '#ff2e88';

// Deterministic PRNG so the grain looks the same on every export.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGrainTile() {
  const tile = document.createElement('canvas');
  tile.width = 140;
  tile.height = 140;
  const tc = tile.getContext('2d');
  const img = tc.createImageData(140, 140);
  const rnd = mulberry32(20261120);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 30;
  }
  tc.putImageData(img, 0, 0);
  return tile;
}

let grainTile = null;
function grainPattern(ctx) {
  if (!grainTile) grainTile = makeGrainTile();
  return ctx.createPattern(grainTile, 'repeat');
}

// Default vertical anchor: the visible window sits V_ANCHOR of the vertical
// slack down from the photo's top, so faces (upper third of a portrait)
// survive cover-fit into wide panels. 0.5 would be dead centre; the kit
// samples' faces sit in the top ~10% of the frame, so 0.12 keeps them in
// view where centre-cropping cut them off at the chin.
const V_ANCHOR = 0.12;

// Draw an image cover-fitting a rect, with zoom and pan offsets (-1..1).
// Never draws a half-loaded image (that used to yield Infinity/NaN sizes),
// and clamps the result so the photo can never be dragged out of its panel.
function drawCoverFit(ctx, img, rect, zoom, ox, oy) {
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return;
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  let dx = rect.x + (rect.w - dw) / 2 + ox * rect.w;
  let dy = rect.y + (rect.h - dh) * V_ANCHOR + oy * rect.h;
  dx = Math.max(rect.x + rect.w - dw, Math.min(dx, rect.x));
  dy = Math.max(rect.y + rect.h - dh, Math.min(dy, rect.y));
  ctx.drawImage(img, dx, dy, dw, dh);
}

// One photo panel: graded photo, then its frame (ink border + accent band,
// polaroid white border, or none for full bleed). `ink` is the editor's
// "Ink panel borders" toggle: an ink frame is drawn only when the layout
// wants one AND the toggle is on.
function drawPhotoPanel(ctx, img, panel, rect, layout, grade, lookup, strength, scratch, ink) {
  const rot = (rect.rot * Math.PI) / 180;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.translate(-cx, -cy);

  let photoRect = rect;
  if (layout.frame === 'polaroid') {
    const border = Math.min(rect.w, rect.h) * 0.045;
    ctx.fillStyle = '#fdf8ef';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(8, rect.w * 0.02);
    ctx.shadowOffsetY = Math.max(4, rect.h * 0.012);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    photoRect = {
      x: rect.x + border,
      y: rect.y + border,
      w: rect.w - border * 2,
      h: rect.h - border * 2 - border * 1.6,
      rot: 0,
    };
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  ctx.clip();

  const ready = Boolean(img && img.complete && img.naturalWidth > 0);
  if (img === undefined || (img !== null && !ready)) {
    // Assigned but still loading: an honest loading state, never a blank
    // panel and never a NaN draw. `images` only gains an entry once a load
    // settles, so while a photo is in flight the lookup is undefined (a
    // failed load is null and shows ADD A PHOTO instead).
    const g = ctx.createLinearGradient(photoRect.x, photoRect.y, photoRect.x, photoRect.y + photoRect.h);
    g.addColorStop(0, '#3d2154');
    g.addColorStop(1, '#160a2e');
    ctx.fillStyle = g;
    ctx.fillRect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.max(14, photoRect.w * 0.05)}px 'Bebas Neue', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOADING…', photoRect.x + photoRect.w / 2, photoRect.y + photoRect.h / 2);
  } else if (!img) {
    const g = ctx.createLinearGradient(photoRect.x, photoRect.y, photoRect.x, photoRect.y + photoRect.h);
    g.addColorStop(0, '#3d2154');
    g.addColorStop(1, '#160a2e');
    ctx.fillStyle = g;
    ctx.fillRect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.max(14, photoRect.w * 0.05)}px 'Bebas Neue', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD A PHOTO', photoRect.x + photoRect.w / 2, photoRect.y + photoRect.h / 2);
  } else if (strength > 0.01) {
    const pw = Math.max(2, Math.round(photoRect.w));
    const ph = Math.max(2, Math.round(photoRect.h));
    scratch.width = pw;
    scratch.height = ph;
    const sc = scratch.getContext('2d');
    sc.clearRect(0, 0, pw, ph);
    drawCoverFit(sc, img, { x: 0, y: 0, w: pw, h: ph }, panel.zoom, panel.ox, panel.oy);
    const data = sc.getImageData(0, 0, pw, ph);
    applyGradeMap(data, lookup, strength);
    sc.putImageData(data, 0, 0);
    ctx.drawImage(scratch, photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  } else {
    drawCoverFit(ctx, img, photoRect, panel.zoom, panel.ox, panel.oy);
  }

  // Soft tint wash over the graded photo.
  if (strength > 0.01) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = grade.tintAlpha * strength;
    ctx.fillStyle = grade.tint;
    ctx.fillRect(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  if (layout.frame === 'ink' && ink) {
    ctx.lineWidth = Math.max(3, rect.w * 0.008);
    ctx.strokeStyle = DARK;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    // Accent band along the panel's bottom edge.
    const bandH = Math.max(3, rect.w * 0.006);
    ctx.fillStyle = grade.stops[2][1];
    ctx.fillRect(rect.x, rect.y + rect.h - bandH, rect.w, bandH);
  }
  ctx.restore();
}

// Dots that grow toward the bottom of the title zone, in the grade's
// highlight colour.
function drawHalftoneField(ctx, zone, grade) {
  const gap = Math.max(8, zone.w * 0.022);
  const maxR = Math.max(2, zone.w * 0.005);
  ctx.save();
  ctx.beginPath();
  ctx.rect(zone.x, zone.y, zone.w, zone.h);
  ctx.clip();
  ctx.fillStyle = grade.stops[3][1];
  for (let y = zone.y + gap / 2; y < zone.y + zone.h; y += gap) {
    const rowT = (y - zone.y) / zone.h;
    for (let x = zone.x + gap / 2; x < zone.x + zone.w; x += gap) {
      const r = maxR * (0.25 + rowT * 0.9);
      ctx.globalAlpha = 0.05 + rowT * 0.13;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawStar(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = DARK;
  ctx.stroke();
}

function drawHeatStars(ctx, state, W, H) {
  const r = Math.max(9, W * 0.011);
  const gap = r * 2.4;
  const y = H * 0.055;
  let x = W * 0.02 + r;
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, x + gap * i, y, r, i < state.heat ? GOLD : 'rgba(255,255,255,0.25)');
  }
}

function drawBadgeRibbon(ctx, state, W, H) {
  if (!state.badge || !state.badgeText.trim()) return;
  const rh = Math.max(20, H * 0.042);
  // Anchor on the top-right corner: the ribbon's centreline crosses the top
  // edge `a` px left of the corner and the right edge `a` px below it, so
  // the band enters through the top edge and exits through the right edge.
  // (The old ribbon was centred at 0.86W/0.06H with a fixed 0.30W length, so
  // its right end stopped at ~0.966W, hanging in mid-air.)
  const a = Math.min(W, H) * 0.28;
  const rw = a * 2; // long enough that both ends leave the canvas
  ctx.save();
  ctx.translate(W - a / 2, a / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = PINK;
  ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-rw / 2, -rh / 2, rw, 2);
  ctx.fillRect(-rw / 2, rh / 2 - 2, rw, 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(rh * 0.58)}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Never let the text run past the stretch visible between the two edges.
  ctx.fillText(state.badgeText.toUpperCase(), 0, 1, a * Math.SQRT2 * 0.92);
  ctx.restore();
}

// Size the title block and work out where it lands. Shared by the renderer
// and the editor's hit test so the two can never disagree again: the block
// may roam the whole canvas (clamped to it), and its centre is clamped so
// the widest of the three lines never runs off the canvas edge.
export function titleBlockRect(ctx, state, W, H) {
  const layout = layoutById(state.layout);
  const zone = titleZoneRect(layout, W, H);
  const title = state.title.trim() ? state.title.toUpperCase() : 'UNTITLED';
  const tagline = state.tagline.toUpperCase();
  const subtitle = state.subtitle;

  let tagSize = Math.max(12, zone.h * 0.11);
  let size = zone.h * 0.46 * (state.titleSize / 100);
  let subSize = Math.max(13, size * 0.30);

  // Measure all three lines (the tagline with its letter-spacing, as drawn)
  // and shrink the whole block until the widest fits the title zone.
  const measure = () => {
    ctx.font = `${size}px Anton, sans-serif`;
    const tw = ctx.measureText(title).width;
    ctx.font = `${tagSize}px 'Bebas Neue', sans-serif`;
    try { ctx.letterSpacing = `${Math.round(tagSize * 0.35)}px`; } catch (e) { /* older canvas */ }
    const gw = ctx.measureText(tagline).width;
    try { ctx.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
    ctx.font = `${subSize}px Pacifico, cursive`;
    const sw = ctx.measureText(subtitle).width;
    return Math.max(tw, gw, sw, 1);
  };
  let widest = measure();
  if (widest > zone.w) {
    const k = zone.w / widest;
    tagSize *= k;
    size *= k;
    subSize *= k;
    widest = measure();
  }

  // The block height must cover the real baselines: the subtitle sits at
  // tagSize*1.25 + size*1.10 from the top, plus its own 0.9em rise and a
  // 0.35em descender allowance — the old size*1.0 + subSize*1.55 booking
  // let Pacifico descenders poke out of the block's bottom.
  let blockH = tagSize * 1.25 + size * 1.10 + subSize * 1.25;
  const maxBlock = zone.h * 0.98;
  if (blockH > maxBlock) {
    const k = maxBlock / blockH;
    tagSize *= k;
    size *= k;
    subSize *= k;
    blockH = maxBlock;
    widest = measure();
  }

  const halfW = widest / 2;
  let cx = (state.titleX / 100) * W;
  cx = halfW >= W / 2 - 4 ? W / 2 : Math.max(halfW + 4, Math.min(cx, W - halfW - 4));
  const cy = (state.titleY / 100) * H;
  const top = Math.max(4, Math.min(cy - blockH / 2, H - blockH - 6));
  return {
    x: cx - halfW, y: top, w: halfW * 2, h: blockH,
    cx, top, blockH, tagSize, size, subSize, title, tagline, subtitle, zone,
  };
}

function drawTitleBlock(ctx, state, layout, grade, W, H) {
  const m = titleBlockRect(ctx, state, W, H);
  if (state.halftone) drawHalftoneField(ctx, m.zone, grade);

  const tagBaseline = m.top + m.tagSize;
  const titleBaseline = tagBaseline + m.tagSize * 0.25 + m.size * 0.85;
  const subBaseline = titleBaseline + m.size * 0.25 + m.subSize * 0.9;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `${m.tagSize}px 'Bebas Neue', sans-serif`;
  try { ctx.letterSpacing = `${Math.round(m.tagSize * 0.35)}px`; } catch (e) { /* older canvas */ }
  ctx.fillStyle = GOLD;
  ctx.fillText(m.tagline, m.cx, tagBaseline);
  try { ctx.letterSpacing = '0px'; } catch (e) { /* older canvas */ }

  ctx.font = `${m.size}px Anton, sans-serif`;
  ctx.lineJoin = 'round';
  if (state.titleShadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = m.size * 0.06;
    ctx.shadowOffsetY = m.size * 0.045;
  }
  ctx.lineWidth = Math.max(2, m.size * 0.085);
  ctx.strokeStyle = DARK;
  ctx.strokeText(m.title, m.cx, titleBaseline);
  ctx.fillStyle = state.titleColor;
  ctx.fillText(m.title, m.cx, titleBaseline);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.font = `${m.subSize}px Pacifico, cursive`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(m.subtitle, m.cx, subBaseline);
}

// Darken the corners so the lettering pops.
function drawVignette(ctx, W, H) {
  const g = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.42,
    W / 2, H / 2, Math.max(W, H) * 0.75,
  );
  g.addColorStop(0, 'rgba(10,4,18,0)');
  g.addColorStop(1, 'rgba(10,4,18,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// One lookup table per grade, built once and reused: renderCover runs on
// every keystroke and drag, and rebuilding the 256-entry table each time
// is pure waste.
const gradeLookupCache = new Map();
function lookupFor(grade) {
  let table = gradeLookupCache.get(grade.id);
  if (!table) {
    table = buildGradeLookup(grade);
    gradeLookupCache.set(grade.id, table);
  }
  return table;
}

// One scratch canvas, reused across renders (it is fully repainted per panel).
let scratchCanvas = null;
function getScratch() {
  if (!scratchCanvas) scratchCanvas = document.createElement('canvas');
  return scratchCanvas;
}

// The whole cover. `images` maps a photo id to its loaded HTMLImageElement.
// `opts.highlightPanel` (preview only) outlines the selected panel; exports
// never pass it, so it can never leak into a PNG.
export function renderCover(canvas, state, images, W, H, opts = {}) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const layout = layoutById(state.layout);
  const grade = gradeById(state.grade);
  const lookup = lookupFor(grade);
  const strength = state.gradeStrength / 100;
  const scratch = getScratch();

  ctx.fillStyle = grade.stops[0][1];
  ctx.fillRect(0, 0, W, H);

  layout.panels.forEach((_, i) => {
    const rect = panelRect(layout, i, W, H);
    const panel = state.panels[i];
    const photo = state.photos[panel.photo];
    // No `|| null`: an in-flight photo must stay `undefined` so the panel
    // shows LOADING…; only a settled failure is `null` (ADD A PHOTO).
    const img = photo ? images.get(photo.id) : null;
    drawPhotoPanel(ctx, img, panel, rect, layout, grade, lookup, strength, scratch, state.ink);
  });

  // A dark scrim under the title on the full-bleed layout.
  if (layout.scrim) {
    const zone = titleZoneRect(layout, W, H);
    const g = ctx.createLinearGradient(0, zone.y - zone.h * 0.4, 0, H);
    g.addColorStop(0, 'rgba(10,4,18,0)');
    g.addColorStop(1, 'rgba(10,4,18,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, zone.y - zone.h * 0.4, W, H - zone.y + zone.h * 0.4);
  }

  drawTitleBlock(ctx, state, layout, grade, W, H);
  drawBadgeRibbon(ctx, state, W, H);
  drawHeatStars(ctx, state, W, H);

  if (state.grain) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (state.vignette) drawVignette(ctx, W, H);

  // Editor-only: outline the selected panel and badge it with its number.
  // The outline and badge live in the panel's own rotated frame, so they
  // hug a tilted polaroid instead of its axis-aligned bounding box; the
  // badge sits at the panel's bottom-left so it never covers the heat
  // stars along the top edge.
  if (opts.highlightPanel != null && opts.highlightPanel < layout.panels.length) {
    const rect = panelRect(layout, opts.highlightPanel, W, H);
    const rot = (rect.rot * Math.PI) / 180;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);
    ctx.setLineDash([Math.max(6, W * 0.008), Math.max(6, W * 0.008)]);
    ctx.lineWidth = Math.max(2, W * 0.003);
    ctx.strokeStyle = '#2ee6ff';
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    const r = Math.max(12, W * 0.016);
    const bx = rect.x + r + 6;
    const by = rect.y + rect.h - r - 6;
    ctx.setLineDash([]);
    ctx.fillStyle = '#2ee6ff';
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DARK;
    ctx.font = `${Math.round(r * 1.1)}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.highlightPanel + 1), bx, by + 1);
    ctx.restore();
  }
}

// Render at export size and hand back a PNG blob.
export function exportCoverPNG(state, images, w, h) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    renderCover(canvas, state, images, w, h);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG export failed'));
    }, 'image/png');
  });
}

// Same render, as a data URL (used by the screenshot automation).
export function exportCoverDataURL(state, images, w, h) {
  const canvas = document.createElement('canvas');
  renderCover(canvas, state, images, w, h);
  return canvas.toDataURL('image/png');
}

export const EXPORT_SIZES = [
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Portrait', w: 1080, h: 1350 },
  { label: 'Wide', w: 1920, h: 1080 },
  { label: 'Story', w: 1080, h: 1920 },
];
