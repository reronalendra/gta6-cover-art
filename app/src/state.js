// Vice Panel Studio — editor state and undo/redo history.
// A state snapshot is plain JSON, so history is just a stack of strings.
// Binary photo payloads never live in the state: the photo store below maps
// a photo id to its source (a short relative path for the kit samples, an
// object URL for a user upload), so state.photos — and every undo snapshot
// of it — stays tiny metadata (id + name). Uploads used to be stored as
// base64 data URLs inside state.photos, so each of the 60 undo snapshots
// copied megabytes of image data.

export const SAMPLE_PIER = 'samples/pier.jpg';
export const SAMPLE_BOULEVARD = 'samples/boulevard.jpg';

export const photoStore = new Map([
  ['pier', SAMPLE_PIER],
  ['boulevard', SAMPLE_BOULEVARD],
]);

let nextUploadId = 0;
export function newPhotoId() {
  return `upload-${++nextUploadId}`;
}

export function emptyPanel(photo, i = 0) {
  // Vary the default crop a little per panel so the same two samples do not
  // read as exact duplicates across a cover.
  const zoom = [1, 1.08, 1.15, 1.04, 1.12, 1, 1.08, 1.15, 1.04][i % 9];
  const oy = [0, 0.06, -0.05, 0.03, -0.03, 0.06, 0, -0.05, 0.03][i % 9];
  return { photo, zoom, ox: 0, oy };
}

export function defaultState() {
  return {
    layout: 'grid4',
    grade: 'vice',
    gradeStrength: 100,
    title: 'NEON SHORE',
    subtitle: 'a vice city story',
    tagline: 'OUT NOW \u00B7 2026',
    titleSize: 100,
    titleColor: '#ffffff',
    titleX: 50,
    titleY: 86,
    halftone: true,
    titleShadow: true,
    grain: true,
    vignette: true,
    ink: true,
    badge: true,
    badgeText: 'HOT',
    heat: 4,
    previewSize: '1920x1080',
    photos: [
      { id: 'pier', name: 'Pier' },
      { id: 'boulevard', name: 'Boulevard' },
    ],
    // Nine slots; each layout uses the first N it needs.
    panels: [0, 1, 0, 1, 0, 1, 0, 1, 0].map((photo, i) => emptyPanel(photo, i)),
    selectedPanel: 0,
    selectedPhoto: 0,
  };
}

// A bounded undo stack: push a snapshot before a change, undo/redo walk it.
export function createHistory(limit) {
  const past = [];
  const future = [];
  return {
    push(snapshot) {
      past.push(snapshot);
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current) {
      if (past.length === 0) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      if (future.length === 0) return null;
      past.push(current);
      return future.pop();
    },
    canUndo() { return past.length > 0; },
    canRedo() { return future.length > 0; },
  };
}
