// Vice Panel Studio — cover layouts.
// Every rect is a fraction of the cover (x, y, width, height, rotation in
// degrees). The title zone is where the big lettering lives; the renderer
// centres the title inside it unless the user drags it elsewhere.

export const LAYOUTS = [
  {
    id: 'grid4',
    name: 'Poster Grid',
    panels: [
      [0.015, 0.02, 0.48, 0.335, 0],
      [0.505, 0.02, 0.48, 0.335, 0],
      [0.015, 0.365, 0.48, 0.335, 0],
      [0.505, 0.365, 0.48, 0.335, 0],
    ],
    titleZone: [0.03, 0.72, 0.94, 0.26],
    frame: 'ink',
    mini: 'grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr',
  },
  {
    id: 'hero3',
    name: 'Hero + Three',
    panels: [
      [0.015, 0.02, 0.60, 0.68, 0],
      [0.625, 0.02, 0.36, 0.22, 0],
      [0.625, 0.25, 0.36, 0.22, 0],
      [0.625, 0.48, 0.36, 0.22, 0],
    ],
    titleZone: [0.03, 0.72, 0.94, 0.26],
    frame: 'ink',
    mini: 'grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr 1fr',
    miniFirst: 'grid-row:1 / -1',
  },
  {
    id: 'fullbleed',
    name: 'Full Bleed',
    panels: [[0, 0, 1, 1, 0]],
    titleZone: [0.04, 0.66, 0.92, 0.30],
    frame: 'none',
    scrim: true,
    mini: 'grid-template-columns:1fr;grid-template-rows:1fr',
  },
  {
    id: 'tilted',
    name: 'Tilted Snapshots',
    panels: [
      [0.05, 0.235, 0.44, 0.44, -6],
      [0.52, 0.215, 0.44, 0.46, 4],
      [0.27, 0.635, 0.46, 0.34, -2],
    ],
    // A taller title zone (was 0.12): the three-line block no longer has to
    // shrink to under half the size of the other layouts, and the polaroids
    // sit lower so the script subtitle cannot touch their frames.
    titleZone: [0.04, 0.01, 0.92, 0.17],
    frame: 'polaroid',
    mini: 'grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr',
    miniLast: 'grid-column:1 / -1',
  },
  {
    id: 'nine',
    name: 'Nine Panel',
    panels: [
      [0.015, 0.02, 0.32, 0.22, 0],
      [0.345, 0.02, 0.32, 0.22, 0],
      [0.675, 0.02, 0.32, 0.22, 0],
      [0.015, 0.25, 0.32, 0.22, 0],
      [0.345, 0.25, 0.32, 0.22, 0],
      [0.675, 0.25, 0.32, 0.22, 0],
      [0.015, 0.48, 0.32, 0.22, 0],
      [0.345, 0.48, 0.32, 0.22, 0],
      [0.675, 0.48, 0.32, 0.22, 0],
    ],
    titleZone: [0.03, 0.72, 0.94, 0.26],
    frame: 'ink',
    mini: 'grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr',
  },
  {
    id: 'story',
    name: 'Story Stack',
    panels: [
      [0.015, 0.02, 0.97, 0.26, 0],
      [0.015, 0.29, 0.97, 0.26, 0],
      [0.015, 0.56, 0.97, 0.26, 0],
    ],
    titleZone: [0.04, 0.845, 0.92, 0.135],
    frame: 'ink',
    mini: 'grid-template-columns:1fr;grid-template-rows:1fr 1fr 1fr',
  },
];

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

// Pixel rect of a panel on a cover of W x H, with the layout's gap applied
// by the fractions themselves.
export function panelRect(layout, index, W, H) {
  const p = layout.panels[index];
  return { x: p[0] * W, y: p[1] * H, w: p[2] * W, h: p[3] * H, rot: p[4] || 0 };
}

export function titleZoneRect(layout, W, H) {
  const z = layout.titleZone;
  return { x: z[0] * W, y: z[1] * H, w: z[2] * W, h: z[3] * H };
}
