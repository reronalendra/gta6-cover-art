// Vice Panel Studio — editor wiring: controls, canvas dragging, uploads,
// undo/redo, exports and shareable presets. The artwork itself lives in
// cover.js; this file only moves state around and calls renderCover.

import { defaultState, createHistory, photoStore, newPhotoId } from './state.js';
import { GRADES, gradeById } from './grades.js';
import { LAYOUTS, layoutById, panelRect, titleZoneRect } from './layouts.js';
import { renderCover, exportCoverPNG, exportCoverDataURL, EXPORT_SIZES, titleBlockRect } from './cover.js';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const history = createHistory(60);
let state = defaultState();
const images = new Map(); // photo id -> loaded HTMLImageElement (or null)
let renderQueued = false;
let drag = null; // {kind:'photo'|'title', panel, startX, startY, snapshot, ox, oy, tx, ty}

const PREVIEW_DIMS = {
  '1920x1080': [960, 540],
  '1080x1080': [720, 720],
  '1080x1350': [640, 800],
  '1080x1920': [540, 960],
};

// ---------- image loading ----------
// `images` maps a photo id to its loaded HTMLImageElement (or null on error).
// A photo is only registered once its load has settled: while it is in
// flight it lives in `photoPromises` and renders as a loading state, never
// as a half-loaded image with naturalWidth 0 (that used to yield
// Infinity/NaN sizes in the cover math).
const photoPromises = new Map(); // photo id -> Promise (settles on load or error)

function photoSrc(photo) {
  return photoStore.get(photo.id);
}

function loadPhoto(photo) {
  const id = photo.id;
  if (images.has(id) || photoPromises.has(id)) return photoPromises.get(id);
  const src = photoSrc(photo);
  if (!src) {
    images.set(id, null);
    return Promise.resolve();
  }
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { images.set(id, img); scheduleRender(); resolve(); };
    img.onerror = () => { images.set(id, null); scheduleRender(); resolve(); };
    img.src = src;
  });
  photoPromises.set(id, p);
  return p;
}

function loadAllPhotos() {
  state.photos.forEach((p) => loadPhoto(p));
}

// Wait until every photo actually used by a panel has settled (loaded or
// failed), so an export right after an upload renders the photo instead of
// an empty panel. Times out rather than hanging on a broken file.
function waitForPhotos(timeoutMs = 8000) {
  const ids = [...new Set(state.panels.map((p) => state.photos[p.photo]?.id).filter(Boolean))];
  const ps = ids.map((id) => photoPromises.get(id)).filter(Boolean);
  if (ps.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(ps),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

// ---------- rendering ----------

function previewDims() {
  return PREVIEW_DIMS[state.previewSize] || PREVIEW_DIMS['1920x1080'];
}

function renderNow() {
  const [w, h] = previewDims();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  renderCover(canvas, state, images, w, h, { highlightPanel: state.selectedPanel });
  syncUndoButtons();
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderNow();
  });
}

// ---------- history ----------

// Push the state as it is now, for changes that happen in one step
// (button clicks, toggles, layout picks): the snapshot IS the pre-change
// state, so undo returns to it.
function commitBeforeChange() {
  history.push(JSON.stringify(state));
  // A one-step commit invalidates any snapshot a control was holding from
  // an unfinished edit: without this, a later endEdit() would push that
  // stale snapshot and undo would jump over the actions in between.
  pendingEditSnapshot = null;
}

// Snapshot-before-edit for text/range controls: the snapshot is taken when
// the user starts editing (focus / first input) and pushed when the edit is
// committed (change), so undo returns the state BEFORE the edit. The old
// code pushed on change instead, which stored the NEW state — undo then
// "restored" exactly what was already on screen.
let pendingEditSnapshot = null;
function beginEdit() {
  if (pendingEditSnapshot === null) pendingEditSnapshot = JSON.stringify(state);
}
function endEdit() {
  if (pendingEditSnapshot !== null && pendingEditSnapshot !== JSON.stringify(state)) {
    history.push(pendingEditSnapshot);
    syncUndoButtons();
  }
  pendingEditSnapshot = null;
}

function applySnapshot(json) {
  state = JSON.parse(json);
  // A snapshot from an edit that predates this undo/redo is meaningless
  // once the state has been replaced: drop it.
  pendingEditSnapshot = null;
  syncAllControls();
  loadAllPhotos();
  scheduleRender();
}

function undo() {
  const snap = history.undo(JSON.stringify(state));
  if (snap !== null) applySnapshot(snap);
}

function redo() {
  const snap = history.redo(JSON.stringify(state));
  if (snap !== null) applySnapshot(snap);
}

function syncUndoButtons() {
  $('undoBtn').disabled = !history.canUndo();
  $('redoBtn').disabled = !history.canRedo();
}

// ---------- controls ----------

function buildChoices() {
  const layoutBox = $('layoutChoices');
  LAYOUTS.forEach((layout) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.dataset.layout = layout.id;
    const mini = document.createElement('span');
    mini.className = 'mini-layout';
    mini.style.cssText = layout.mini;
    layout.panels.forEach((_, i) => {
      const cell = document.createElement('i');
      if (i === 0 && layout.miniFirst) cell.style.cssText = layout.miniFirst;
      if (i === layout.panels.length - 1 && layout.miniLast) cell.style.cssText = layout.miniLast;
      mini.appendChild(cell);
    });
    btn.appendChild(mini);
    const nameEl = document.createElement('span');
    nameEl.className = 'choice-name';
    nameEl.textContent = layout.name;
    btn.appendChild(nameEl);
    btn.addEventListener('click', () => {
      commitBeforeChange();
      state.layout = layout.id;
      state.selectedPanel = 0;
      const zone = titleZoneRect(layout, 100, 100);
      state.titleX = Math.round(zone.x + zone.w / 2);
      state.titleY = Math.round(zone.y + zone.h * 0.55);
      syncAllControls();
      scheduleRender();
    });
    layoutBox.appendChild(btn);
  });

  const gradeBox = $('gradeChoices');
  GRADES.forEach((grade) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.dataset.grade = grade.id;
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = grade.swatch;
    const name = document.createElement('span');
    name.className = 'choice-name';
    name.textContent = grade.name;
    btn.appendChild(swatch);
    btn.appendChild(name);
    btn.addEventListener('click', () => {
      commitBeforeChange();
      state.grade = grade.id;
      syncAllControls();
      scheduleRender();
    });
    gradeBox.appendChild(btn);
  });

  const stars = $('heatStars');
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '\u2605';
    b.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
    b.addEventListener('click', () => {
      commitBeforeChange();
      state.heat = i;
      syncAllControls();
      scheduleRender();
    });
    stars.appendChild(b);
  }
}

function syncAllControls() {
  document.querySelectorAll('#layoutChoices .choice').forEach((el) => {
    el.classList.toggle('selected', el.dataset.layout === state.layout);
  });
  document.querySelectorAll('#gradeChoices .choice').forEach((el) => {
    el.classList.toggle('selected', el.dataset.grade === state.grade);
  });
  document.querySelectorAll('#heatStars button').forEach((el, i) => {
    el.classList.toggle('lit', i < state.heat);
  });
  $('titleInput').value = state.title;
  $('subtitleInput').value = state.subtitle;
  $('taglineInput').value = state.tagline;
  $('titleSize').value = state.titleSize;
  $('titleSizeVal').textContent = `${state.titleSize}%`;
  $('titleColor').value = state.titleColor;
  $('titleX').value = state.titleX;
  $('titleY').value = state.titleY;
  $('halftoneToggle').checked = state.halftone;
  $('shadowToggle').checked = state.titleShadow;
  $('grainToggle').checked = state.grain;
  $('vignetteToggle').checked = state.vignette;
  $('inkToggle').checked = state.ink;
  $('badgeToggle').checked = state.badge;
  $('badgeInput').value = state.badgeText;
  $('gradeStrength').value = state.gradeStrength;
  $('gradeStrengthVal').textContent = `${state.gradeStrength}%`;
  $('previewSize').value = state.previewSize;
  syncThumbs();
  syncPanelControls();
  syncUndoButtons();
}

function syncThumbs() {
  const box = $('thumbs');
  box.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const img = document.createElement('img');
    img.src = photoStore.get(photo.id) || '';
    img.alt = photo.name;
    img.title = photo.name;
    img.classList.toggle('selected', state.panels[state.selectedPanel].photo === i);
    img.addEventListener('click', () => {
      commitBeforeChange();
      state.selectedPhoto = i;
      state.panels[state.selectedPanel].photo = i;
      syncAllControls();
      scheduleRender();
    });
    box.appendChild(img);
  });
}

function syncPanelControls() {
  const layout = layoutById(state.layout);
  const panel = state.panels[state.selectedPanel];
  $('panelName').textContent = String(state.selectedPanel + 1);
  const sel = $('panelPhoto');
  sel.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = photo.name;
    sel.appendChild(opt);
  });
  sel.value = String(panel.photo);
  $('panelZoom').value = String(panel.zoom);
  $('zoomVal').textContent = `${panel.zoom.toFixed(2)}\u00D7`;
  // Hide panel controls the layout cannot use.
  document.querySelector('.panel-box').style.display = layout.panels.length > 0 ? '' : 'none';
}

// ---------- canvas dragging ----------

function canvasPoint(evt) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - r.left) / r.width) * canvas.width,
    y: ((evt.clientY - r.top) / r.height) * canvas.height,
  };
}

function hitPanel(x, y) {
  const layout = layoutById(state.layout);
  for (let i = layout.panels.length - 1; i >= 0; i--) {
    const rect = panelRect(layout, i, canvas.width, canvas.height);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const rot = (-rect.rot * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    const lx = dx * Math.cos(rot) - dy * Math.sin(rot) + cx;
    const ly = dx * Math.sin(rot) + dy * Math.cos(rot) + cy;
    if (lx >= rect.x && lx <= rect.x + rect.w && ly >= rect.y && ly <= rect.y + rect.h) return i;
  }
  return -1;
}

function hitTitle(x, y) {
  // Same rectangle the renderer draws (titleBlockRect), plus a little
  // padding — the hit area can never drift away from the visible block.
  const rect = titleBlockRect(canvas.getContext('2d'), state, canvas.width, canvas.height);
  const pad = 8;
  return x >= rect.x - pad && x <= rect.x + rect.w + pad
    && y >= rect.y - pad && y <= rect.y + rect.h + pad;
}

canvas.addEventListener('pointerdown', (evt) => {
  const p = canvasPoint(evt);
  canvas.setPointerCapture(evt.pointerId);
  const snapshot = JSON.stringify(state);
  if (hitTitle(p.x, p.y)) {
    drag = { kind: 'title', startX: p.x, startY: p.y, snapshot, tx: state.titleX, ty: state.titleY };
    return;
  }
  const panel = hitPanel(p.x, p.y);
  if (panel >= 0) {
    state.selectedPanel = panel;
    state.selectedPhoto = state.panels[panel].photo;
    syncAllControls();
    const rect = panelRect(layoutById(state.layout), panel, canvas.width, canvas.height);
    drag = {
      kind: 'photo', panel, startX: p.x, startY: p.y, snapshot,
      ox: state.panels[panel].ox, oy: state.panels[panel].oy, rect,
    };
  }
});

canvas.addEventListener('pointermove', (evt) => {
  if (!drag) return;
  const p = canvasPoint(evt);
  if (drag.kind === 'photo') {
    const panel = state.panels[drag.panel];
    panel.ox = Math.max(-0.6, Math.min(0.6, drag.ox + (p.x - drag.startX) / drag.rect.w));
    panel.oy = Math.max(-0.6, Math.min(0.6, drag.oy + (p.y - drag.startY) / drag.rect.h));
  } else {
    state.titleX = Math.max(2, Math.min(98, drag.tx + ((p.x - drag.startX) / canvas.width) * 100));
    state.titleY = Math.max(2, Math.min(98, drag.ty + ((p.y - drag.startY) / canvas.height) * 100));
    $('titleX').value = Math.round(state.titleX);
    $('titleY').value = Math.round(state.titleY);
  }
  scheduleRender();
});

function endDrag() {
  if (!drag) return;
  // Only record the drag if the dragged coordinates actually moved.
  // Clicking another panel changes state.selectedPanel, but that is
  // transient UI state and must never cost an undo step: the old
  // whole-state comparison pushed a snapshot on every panel switch.
  const moved = drag.kind === 'photo'
    ? (state.panels[drag.panel].ox !== drag.ox || state.panels[drag.panel].oy !== drag.oy)
    : (state.titleX !== drag.tx || state.titleY !== drag.ty);
  if (moved) history.push(drag.snapshot);
  drag = null;
  syncUndoButtons();
  scheduleRender();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------- photo uploads ----------

function addPhotoFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (imgs.length === 0) return;
  commitBeforeChange();
  // Object URLs, not FileReader data URLs: the bytes never enter the
  // undoable state, so snapshots stay tiny no matter how big the photos are.
  imgs.forEach((file) => {
    const id = newPhotoId();
    photoStore.set(id, URL.createObjectURL(file));
    state.photos.push({ id, name: file.name.replace(/\.[^.]+$/, '') });
    loadPhoto(state.photos[state.photos.length - 1]);
    state.selectedPhoto = state.photos.length - 1;
    state.panels[state.selectedPanel].photo = state.selectedPhoto;
  });
  syncAllControls();
  scheduleRender();
}

$('photoInput').addEventListener('change', (evt) => {
  addPhotoFiles(evt.target.files);
  evt.target.value = '';
});

function addSample(id, name) {
  const idx = state.photos.findIndex((p) => p.id === id);
  commitBeforeChange();
  if (idx === -1) {
    state.photos.push({ id, name });
    loadPhoto(state.photos[state.photos.length - 1]);
    state.selectedPhoto = state.photos.length - 1;
  } else {
    state.selectedPhoto = idx;
  }
  state.panels[state.selectedPanel].photo = state.selectedPhoto;
  syncAllControls();
  scheduleRender();
}
$('samplePierBtn').addEventListener('click', () => addSample('pier', 'Pier'));
$('sampleBlvdBtn').addEventListener('click', () => addSample('boulevard', 'Boulevard'));

$('removePhotoBtn').addEventListener('click', () => {
  if (state.photos.length <= 1) return;
  commitBeforeChange();
  const idx = state.panels[state.selectedPanel].photo;
  state.photos.splice(idx, 1);
  // Deliberately do NOT revoke the object URL, and do NOT drop the
  // photoStore / images / photoPromises entries: they are a session cache.
  // Undo restores state.photos by id, and re-adding a sample re-uses its
  // id, so deleting the cache here made undo show a broken thumbnail with
  // a permanent "ADD A PHOTO" panel, and made a removed sample unloadable
  // until refresh. Blob URLs of removed uploads simply live until the
  // page closes.
  state.panels.forEach((p) => {
    if (p.photo > idx) p.photo -= 1;
    else if (p.photo === idx) p.photo = 0;
  });
  state.selectedPhoto = state.panels[state.selectedPanel].photo;
  syncAllControls();
  scheduleRender();
});

$('resetCropBtn').addEventListener('click', () => {
  commitBeforeChange();
  const panel = state.panels[state.selectedPanel];
  panel.zoom = 1;
  panel.ox = 0;
  panel.oy = 0;
  syncAllControls();
  scheduleRender();
});

$('fillAllBtn').addEventListener('click', () => {
  commitBeforeChange();
  const photo = state.panels[state.selectedPanel].photo;
  state.panels.forEach((p) => { p.photo = photo; });
  scheduleRender();
});

window.addEventListener('dragover', (evt) => evt.preventDefault());
window.addEventListener('drop', (evt) => {
  evt.preventDefault();
  if (evt.dataTransfer && evt.dataTransfer.files) addPhotoFiles(evt.dataTransfer.files);
});

// ---------- control events ----------

function bindText(id, key) {
  $(id).addEventListener('focus', beginEdit);
  $(id).addEventListener('input', (evt) => {
    beginEdit();
    state[key] = evt.target.value;
    scheduleRender();
  });
  $(id).addEventListener('change', endEdit);
  // Focused, edited nothing, clicked away: drop the stale snapshot.
  $(id).addEventListener('blur', () => { pendingEditSnapshot = null; });
}
bindText('titleInput', 'title');
bindText('subtitleInput', 'subtitle');
bindText('taglineInput', 'tagline');
bindText('badgeInput', 'badgeText');

function bindRange(id, apply, label) {
  $(id).addEventListener('focus', beginEdit);
  $(id).addEventListener('pointerdown', beginEdit);
  $(id).addEventListener('input', (evt) => {
    beginEdit();
    apply(Number(evt.target.value));
    if (label) label();
    scheduleRender();
  });
  $(id).addEventListener('change', endEdit);
  // Focused (or pointerdown) without moving it, then clicked away: drop
  // the stale snapshot, or a later edit would push it and undo would skip
  // the actions in between. endEdit (not a plain null) so a keyboard-driven
  // change whose `change` fires after `blur` still records its snapshot.
  $(id).addEventListener('blur', endEdit);
}
bindRange('titleSize', (v) => { state.titleSize = v; }, () => { $('titleSizeVal').textContent = `${state.titleSize}%`; });
bindRange('gradeStrength', (v) => { state.gradeStrength = v; }, () => { $('gradeStrengthVal').textContent = `${state.gradeStrength}%`; });
bindRange('titleX', (v) => { state.titleX = v; });
bindRange('titleY', (v) => { state.titleY = v; });
bindRange('panelZoom', (v) => {
  state.panels[state.selectedPanel].zoom = v;
  $('zoomVal').textContent = `${v.toFixed(2)}\u00D7`;
});

function bindCheck(id, key) {
  $(id).addEventListener('change', (evt) => {
    commitBeforeChange();
    state[key] = evt.target.checked;
    scheduleRender();
  });
}
bindCheck('halftoneToggle', 'halftone');
bindCheck('shadowToggle', 'titleShadow');
bindCheck('grainToggle', 'grain');
bindCheck('vignetteToggle', 'vignette');
bindCheck('inkToggle', 'ink');
bindCheck('badgeToggle', 'badge');

$('titleColor').addEventListener('change', (evt) => {
  commitBeforeChange();
  state.titleColor = evt.target.value;
  scheduleRender();
});
$('panelPhoto').addEventListener('change', (evt) => {
  commitBeforeChange();
  state.panels[state.selectedPanel].photo = Number(evt.target.value);
  state.selectedPhoto = Number(evt.target.value);
  syncAllControls();
  scheduleRender();
});
$('previewSize').addEventListener('change', (evt) => {
  commitBeforeChange();
  state.previewSize = evt.target.value;
  scheduleRender();
});

$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
// Input types with a text caret (the browser's own text undo must win
// there). Range, checkbox, button and file inputs have no text undo, so
// app undo stays live right after dragging a slider or toggling a box.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', 'email', 'number', 'date', 'time', 'datetime-local', 'month', 'week', '']);
window.addEventListener('keydown', (evt) => {
  // Never hijack Ctrl+Z / Ctrl+Y while the user is typing in a field:
  // the browser's own text undo must win there.
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.isContentEditable
    || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has(el.type)))) return;
  if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z') {
    evt.preventDefault();
    if (evt.shiftKey) redo();
    else undo();
  } else if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'y') {
    evt.preventDefault();
    redo();
  }
});

// ---------- exports ----------

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportOne(size) {
  $('exportStatus').textContent = `Exporting ${size.label} ${size.w}\u00D7${size.h}\u2026`;
  // Wait for any in-flight photo first: exporting the instant after an
  // upload used to render empty panels.
  await waitForPhotos();
  const blob = await exportCoverPNG(state, images, size.w, size.h);
  downloadBlob(blob, `vice-panel-${size.label.toLowerCase()}-${size.w}x${size.h}.png`);
  $('exportStatus').textContent = `Saved vice-panel-${size.label.toLowerCase()}-${size.w}x${size.h}.png (${Math.round(blob.size / 1024)} KiB).`;
  return blob;
}

EXPORT_SIZES.forEach((size) => {
  const btn = $(`export${size.label}Btn`);
  if (btn) btn.addEventListener('click', () => exportOne(size).catch((err) => {
    $('exportStatus').textContent = `Export failed: ${err.message}`;
  }));
});
$('exportAllBtn').addEventListener('click', async () => {
  try {
    for (const size of EXPORT_SIZES) {
      await exportOne(size);
      await new Promise((r) => setTimeout(r, 150));
    }
    $('exportStatus').textContent = 'All four sizes exported.';
  } catch (err) {
    $('exportStatus').textContent = `Export failed: ${err.message}`;
  }
});
$('exportCurrentBtn').addEventListener('click', () => {
  const size = EXPORT_SIZES.find((s) => `${s.w}x${s.h}` === state.previewSize) || EXPORT_SIZES[2];
  exportOne(size).catch((err) => {
    $('exportStatus').textContent = `Export failed: ${err.message}`;
  });
});

// ---------- presets from the URL (?shot=editor&layout=tilted&grade=neon) ----------

function applyPresets() {
  const q = new URLSearchParams(window.location.search);
  const layout = q.get('layout');
  if (layout && layoutById(layout).id === layout) {
    state.layout = layout;
    const zone = titleZoneRect(layoutById(layout), 100, 100);
    state.titleX = Math.round(zone.x + zone.w / 2);
    state.titleY = Math.round(zone.y + zone.h * 0.55);
  }
  const grade = q.get('grade');
  if (grade && gradeById(grade).id === grade) state.grade = grade;
  if (q.get('title')) state.title = q.get('title');
  if (q.get('subtitle')) state.subtitle = q.get('subtitle');
  if (q.get('tagline')) state.tagline = q.get('tagline');
  if (q.get('badge')) state.badgeText = q.get('badge');
  if (q.get('size') && PREVIEW_DIMS[q.get('size')]) state.previewSize = q.get('size');
  const heat = Number(q.get('heat'));
  if (heat >= 1 && heat <= 5) state.heat = heat;
}

// ---------- automation hook (used by the screenshot driver) ----------

window.__vicePanel = {
  get state() { return state; },
  setState(patch) {
    commitBeforeChange();
    Object.assign(state, patch);
    syncAllControls();
    scheduleRender();
  },
  loadSample(name) { addSample(name === 'boulevard' ? 'boulevard' : 'pier', name); },
  renderNow,
  waitForPhotos,
  titleRect() {
    return titleBlockRect(canvas.getContext('2d'), state, canvas.width, canvas.height);
  },
  exportDataURL(w, h) { return exportCoverDataURL(state, images, w, h); },
};

// ---------- boot ----------

buildChoices();
applyPresets();
syncAllControls();
loadAllPhotos();
Promise.all([
  document.fonts.load('16px Anton'),
  document.fonts.load('16px "Bebas Neue"'),
  document.fonts.load('16px Pacifico'),
]).catch(() => {}).finally(() => {
  scheduleRender();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => scheduleRender());
});
scheduleRender();
