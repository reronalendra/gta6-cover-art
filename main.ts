// Vice Panel Studio — the entry program for make.fun's gta6-cover-art-01.
// It runs on Node 22 with only the standard library. Its job is small and
// boring on purpose: take this repository's app/ and screenshots/ folders,
// lay them out under the output directory, and write dossier.json there
// with the vendored make.fun library so the judge can read the entry.
//
// The grader runs this program twice and demands byte-identical output, so
// nothing here depends on the clock, on randomness, or on the machine: the
// copy is a plain recursive copy and the dossier is a pure function of the
// files it reads. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for
// /output — for example:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The folder this file lives in, and where the entry goes.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR?.trim() || '/output';

// OS/editor junk must never ride along into the output (it would be read
// by buildDossier and could break the byte-identical guarantee). Matched on
// the exact basename, case-insensitively: a file merely ending in
// ".DS_Store" (e.g. "x.DS_Store") is not OS junk.
const noJunk = (src: string) => {
  const base = basename(src).toLowerCase();
  return base !== '.ds_store' && base !== 'thumbs.db';
};

// Never let the output directory be the repo root itself: the rmSync calls
// below would delete this entry's own app/ and screenshots/ folders.
if (resolve(outputDir) === resolve(repoRoot)) {
  throw new Error('MAKEFUN_OUTPUT_DIR must not be the repository root');
}

// Lay out the entry: the whole app, then the screenshots beside it.
// Clear the two output subfolders first so a stale file from an earlier run
// can never survive into a new build.
mkdirSync(outputDir, { recursive: true });
rmSync(join(outputDir, 'app'), { recursive: true, force: true });
rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true, filter: noJunk });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true, filter: noJunk });
}

// Write the dossier the judge reads, under the same caps the gate enforces:
// at most 160 KiB of source text, 4 screenshots of at most 256 KiB each,
// app/ at most 993 files and 48 MiB in total, no path over 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
