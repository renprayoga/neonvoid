// NEONVOID hand-in for best-game-01 (Node 22, standard library only).
//
// The game lives in game/ beside this file: plain static files a desktop
// browser loads offline (game/index.html plus its ES modules, no libraries,
// no network requests). This program stages a copy of game/ and of
// screenshots/ into the grader's output directory and writes
// /output/dossier.json there, the summary the judge reads, using the
// vendored make.fun library (vendor/makefun-game.ts).
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// or serve the game itself with `node serve.ts` and open http://localhost:8080.
// Without MAKEFUN_OUTPUT_DIR the grader's /output is used.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps for this bounty (from reference/gate.json). Only
// text_max_bytes shapes the dossier bytes; the rest make this program
// refuse an entry the scorer would refuse anyway: at most 4 screenshots,
// each at most 256 KiB; at most 993 entries in game/ (the grader caps
// /output itself at 1000 entries, and game/ counts beside screenshots/
// and dossier.json), at most 48 MiB of game files, and no game path
// longer than 1000 bytes.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

/** True when `bytes` opens with the PNG or the JPEG magic. */
function looksLikeImage(bytes: Buffer): boolean {
  const startsWith = (magic: number[]): boolean =>
    bytes.length >= magic.length && magic.every((byte, i) => bytes[i] === byte);
  return startsWith(PNG_MAGIC) || startsWith(JPEG_MAGIC);
}

/** The image files (by name, sorted) inside a screenshots directory. */
function imageNames(shotsDir: string): string[] {
  return readdirSync(shotsDir)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => statSync(join(shotsDir, name)).isFile())
    .sort();
}

/**
 * Refuse early, with a plain message, when the entry on disk cannot be
 * handed in. buildDossier would refuse most of these itself, but naming
 * the problem before anything is copied keeps a broken local run from
 * leaving a half-staged output directory behind.
 */
function preflight(rootDir: string): string[] {
  const gameDir = join(rootDir, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html is missing: a game needs its page at game/index.html');
  }
  const shotsDir = join(rootDir, 'screenshots');
  if (!existsSync(shotsDir)) {
    throw new Error('screenshots/ is missing: hand in 3 or 4 PNG or JPEG renders of the game');
  }
  const shots = imageNames(shotsDir);
  if (shots.length < 3 || shots.length > DOSSIER_CAPS.screenshots.max) {
    throw new Error(
      `screenshots/ holds ${shots.length} images, need 3 to ${DOSSIER_CAPS.screenshots.max}`,
    );
  }
  for (const name of shots) {
    const path = join(shotsDir, name);
    const bytes = readFileSync(path);
    if (bytes.length > DOSSIER_CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name} is ${bytes.length} bytes, over the 262144 allowed`);
    }
    if (!looksLikeImage(bytes)) {
      throw new Error(`screenshots/${name} is neither PNG nor JPEG`);
    }
  }
  return shots;
}

function main(): void {
  const rootDir = fileURLToPath(new URL('.', import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  const shots = preflight(rootDir);

  mkdirSync(outDir, { recursive: true });
  cpSync(join(rootDir, 'game'), join(outDir, 'game'), { recursive: true });
  cpSync(join(rootDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const gameFiles = readdirSync(join(outDir, 'game'), { recursive: true }).length;
  console.log(`NEONVOID hand-in written to ${outDir}`);
  console.log(`  game files staged: ${gameFiles}`);
  console.log(`  screenshots: ${shots.length} (cover: ${shots[0]})`);
  console.log(`  dossier.json: ${dossier.length} bytes`);
}

main();
