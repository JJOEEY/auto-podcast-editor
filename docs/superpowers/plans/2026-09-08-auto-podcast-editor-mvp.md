# Auto Podcast Editor (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working MVP: import a talking-head video, transcribe locally with whisper.cpp, auto-propose silence/filler cuts, edit on a basic timeline with undo, auto-generate safezone captions, render MP4 via Remotion + FFmpeg.

**Architecture:** Electron Main owns files, whisper.cpp sidecar, FFmpeg and a sequential job queue; React renderer owns timeline UI and Remotion Player preview; `core/` holds pure, fully unit-tested logic (cut detection, captions, safezone, waveform, atomic file writes). Deterministic pipeline: same project JSON renders identical output.

**Tech Stack:** Electron + React 18 + TypeScript 5 + Vite (electron-vite) + Vitest + Remotion 4 + whisper.cpp sidecar + system FFmpeg.

**Scope note:** This plan covers MVP only (spec §9). P1 (auto SFX/transition, progressive chunk reveal) and P2 (beat-cut, face tracking) are separate follow-up plans. Each task below produces working, tested software.

**Spec:** `docs/superpowers/specs/2026-09-08-auto-podcast-editor-design.md`

---

## File Structure (created by this plan)

```
package.json                      # scripts: dev, typecheck, test, dist
tsconfig.json                     # base TS config
electron.vite.config.ts           # electron-vite build config
vitest.config.ts                  # test config (node env default)
core/types.ts                     # Project, Clip, CutProposal, Word, Settings types
core/projectFile.ts               # atomic save/load (temp-then-rename)
core/waveform.ts                  # computePeaks, downsamplePeaks
core/cutDetection.ts              # proposeCuts (silence/filler/low-audio)
core/caption.ts                   # chunkCaption (5-7 words/line)
core/safezone.ts                  # isInsideSafezone, clampToSafezone
core/exportText.ts                # buildSrt, buildCaptionTxt
core/defaults.ts                  # DEFAULT_SETTINGS (spec §10)
electron/jobs.ts                  # sequential JobQueue (concurrency 1)
electron/media.ts                 # ffmpeg arg builders + injectable runners
electron/whisper.ts               # whisper arg builder + progress parser + runner
electron/main.ts                  # window, IPC wiring (thin, manual-verified)
electron/preload.ts               # contextBridge window.api
src/main.tsx, src/App.tsx         # renderer entry + shell layout
src/state/reducer.ts              # project reducer + undo stack (pure, tested)
src/components/Timeline.tsx       # basic timeline (split/delete/select)
src/components/WaveformView.tsx   # peaks canvas (manual-verified)
src/components/CutProposals.tsx   # proposal list (manual-verified)
src/components/Preview.tsx        # Remotion Player + preset switch (manual-verified)
src/components/SettingsPanel.tsx  # thresholds + model select (manual-verified)
src/remotion/Root.tsx             # Remotion composition registration
src/remotion/PodcastComposition.tsx # renders segments + captions (preview + render)
tests/*.test.ts                   # one test file per core module + reducer + jobs
```

---

### Task 1: Scaffold repo, configs, install

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "auto-podcast-editor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dist": "electron-vite build"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.0",
    "remotion": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "@remotion/player": "^4.0.0",
    "@remotion/renderer": "^4.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

NOTE (verified Task 1): `electron-vite` 2.x stops at `2.3.0` (`2.5.0` does not exist); `@vitejs/plugin-react` is required by the renderer config.

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "out",
    "types": ["node"]
  },
  "include": ["core", "electron", "src", "tests", "electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Write electron.vite.config.ts**

```ts
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react()] },
});
```

- [ ] **Step 4: Write vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
});
```

- [ ] **Step 5: Install and typecheck**

Run: `npm install`
Expected: completes with no ERESOLVE errors.

Run: `npm run typecheck`
Expected: passes (no source files yet, config valid).

- [ ] **Step 6: Init git and commit**

```bash
git init
git add package.json tsconfig.json electron.vite.config.ts vitest.config.ts
git commit -m "chore: scaffold auto-podcast-editor (electron-vite + vitest)"
```

---

### Task 2: Core types + atomic project file

**Files:**
- Create: `core/types.ts`
- Create: `core/projectFile.ts`
- Test: `tests/projectFile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProject, loadProject } from '../core/projectFile.js';
import type { Project } from '../core/types.js';

const project: Project = {
  version: 1,
  name: 'demo',
  sourcePath: 'C:/vids/ep1.mp4',
  durationSec: 120,
  clips: [],
  proposals: [],
  captions: [],
  preset: 'vertical',
  settings: { silenceSec: 0.6, fillerMaxSec: 1.0, lowAudioDb: -40, topicPauseSec: 2.0, model: 'base' },
};

describe('projectFile', () => {
  it('round-trips a project through save/load', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ape-'));
    const file = join(dir, 'ep1.ape.json');
    await saveProject(file, project);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(project);
    expect(await loadProject(file)).toEqual(project);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/projectFile.test.ts`
Expected: FAIL with "Failed to resolve import ../core/projectFile.js".

- [ ] **Step 3: Write minimal implementation (types + atomic write)**

```ts
export type Preset = 'vertical' | 'horizontal';

export interface Word { text: string; start: number; end: number; }

export interface Clip { id: string; track: 'V1' | 'A1' | 'A2' | 'CC'; start: number; end: number; label: string; }

export type ProposalKind = 'silence' | 'filler' | 'low-audio';

export interface CutProposal { id: string; start: number; end: number; kind: ProposalKind; reason: string; confidence: number; }

export interface CaptionLine { id: string; start: number; end: number; text: string; }

export interface Settings { silenceSec: number; fillerMaxSec: number; lowAudioDb: number; topicPauseSec: number; model: 'tiny' | 'base' | 'small'; }

export interface Project {
  version: 1;
  name: string;
  sourcePath: string;
  durationSec: number;
  clips: Clip[];
  proposals: CutProposal[];
  captions: CaptionLine[];
  preset: Preset;
  settings: Settings;
}
```

```ts
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { Project } from './types.js';

export async function saveProject(filePath: string, project: Project): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(project, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}

export async function loadProject(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Project;
  if (parsed.version !== 1) throw new Error(`unsupported project version: ${String(parsed.version)}`);
  return parsed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/projectFile.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add core/types.ts core/projectFile.ts tests/projectFile.test.ts
git commit -m "feat: project model with atomic temp-then-rename save"
```

---

### Task 3: Waveform peaks (pure)

**Files:**
- Create: `core/waveform.ts`
- Test: `tests/waveform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { computePeaks, downsamplePeaks } from '../core/waveform.js';

describe('computePeaks', () => {
  it('returns one RMS value per window', () => {
    const samples = new Int16Array([0, 32767, 0, -32768, 0, 0, 0, 0]);
    const peaks = computePeaks(samples, 8, 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeGreaterThan(peaks[1]);
    expect(peaks[1]).toBe(0);
  });
});

describe('downsamplePeaks', () => {
  it('averages buckets to target length', () => {
    expect(downsamplePeaks([0.2, 0.4, 0.6, 0.8], 2)).toEqual([0.3, 0.7]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/waveform.test.ts`
Expected: FAIL with "Failed to resolve import ../core/waveform.js".

- [ ] **Step 3: Write minimal implementation**

```ts
export function computePeaks(samples: Int16Array, sampleRate: number, peaksPerSecond: number): number[] {
  const windowSize = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
  const peaks: number[] = [];
  for (let i = 0; i < samples.length; i += windowSize) {
    let sum = 0;
    const end = Math.min(i + windowSize, samples.length);
    for (let j = i; j < end; j++) {
      const v = samples[j] / 32768;
      sum += v * v;
    }
    peaks.push(Number(Math.sqrt(sum / (end - i)).toFixed(4)));
  }
  return peaks;
}

export function downsamplePeaks(peaks: number[], targetLength: number): number[] {
  if (targetLength <= 0) throw new Error('targetLength must be positive');
  if (peaks.length <= targetLength) return [...peaks];
  const out: number[] = [];
  const bucket = peaks.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.floor((i + 1) * bucket);
    const slice = peaks.slice(start, Math.max(end, start + 1));
    out.push(Number((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(4)));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/waveform.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add core/waveform.ts tests/waveform.test.ts
git commit -m "feat: waveform RMS peaks with downsampling"
```

---

### Task 4: Cut detection (pure)

**Files:**
- Create: `core/cutDetection.ts`
- Test: `tests/cutDetection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { proposeCuts } from '../core/cutDetection.js';
import type { Settings } from '../core/types.js';

const settings: Settings = { silenceSec: 0.6, fillerMaxSec: 1.0, lowAudioDb: -40, topicPauseSec: 2.0, model: 'base' };

describe('proposeCuts', () => {
  it('flags silence gaps between words longer than threshold', () => {
    const words = [
      { text: 'xin', start: 0.0, end: 0.3 },
      { text: 'chào', start: 1.5, end: 1.8 },
    ];
    const out = proposeCuts(words, [], settings);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('silence');
    expect(out[0].start).toBeCloseTo(0.3);
    expect(out[0].end).toBeCloseTo(1.5);
  });

  it('flags filler words shorter than fillerMaxSec', () => {
    const words = [
      { text: 'hôm', start: 0.0, end: 0.3 },
      { text: 'ừm', start: 0.4, end: 0.8 },
      { text: 'nay', start: 0.9, end: 1.2 },
    ];
    const out = proposeCuts(words, [], settings);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('filler');
  });

  it('ignores gaps shorter than threshold', () => {
    const words = [
      { text: 'a', start: 0.0, end: 0.3 },
      { text: 'b', start: 0.6, end: 0.9 },
    ];
    expect(proposeCuts(words, [], settings)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cutDetection.test.ts`
Expected: FAIL with "Failed to resolve import ../core/cutDetection.js".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CutProposal, Settings, Word } from './types.js';

const FILLER_LEXICON = new Set(['ừm', 'ừ', 'à', 'ờ', 'ơ', 'nhỉ', 'ừm...', 'à...']);

export function proposeCuts(words: Word[], _peaks: number[], settings: Settings): CutProposal[] {
  const out: CutProposal[] = [];
  for (const w of words) {
    const text = w.text.trim().toLowerCase();
    if (FILLER_LEXICON.has(text) && w.end - w.start <= settings.fillerMaxSec) {
      out.push({
        id: `filler-${w.start.toFixed(2)}`,
        start: w.start,
        end: w.end,
        kind: 'filler',
        reason: `filler word "${w.text}"`,
        confidence: 0.85,
      });
    }
  }
  for (let i = 0; i + 1 < words.length; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    if (gapEnd - gapStart >= settings.silenceSec) {
      out.push({
        id: `silence-${gapStart.toFixed(2)}`,
        start: gapStart,
        end: gapEnd,
        kind: 'silence',
        reason: `silence ${(gapEnd - gapStart).toFixed(2)}s`,
        confidence: gapEnd - gapStart >= 2 * settings.silenceSec ? 0.95 : 0.75,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cutDetection.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add core/cutDetection.ts tests/cutDetection.test.ts
git commit -m "feat: silence and filler cut proposals from transcript"
```

---

### Task 4b: Harden proposal IDs + filler normalization (follow-up from Task 4 review)

**Files:**
- Modify: `core/cutDetection.ts`
- Modify: `tests/cutDetection.test.ts`

- [ ] **Step 1: Extend tests (keep the existing 3 untouched)**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeFiller, proposeCuts } from '../core/cutDetection.js';
import type { Settings } from '../core/types.js';

const settings: Settings = { silenceSec: 0.6, fillerMaxSec: 1.0, lowAudioDb: -40, topicPauseSec: 2.0, model: 'base' };

describe('normalizeFiller', () => {
  it('strips punctuation and case', () => {
    expect(normalizeFiller('ừm,')).toBe('ừm');
    expect(normalizeFiller('À.')).toBe('à');
    expect(normalizeFiller('...')).toBe('');
  });
});

describe('hardened proposals', () => {
  it('gives distinct ids to close starts (ms precision + end)', () => {
    const words = [
      { text: 'ừm', start: 10.001, end: 10.05 },
      { text: 'ừm', start: 10.06, end: 10.1 },
      { text: 'rồi', start: 12.0, end: 12.3 },
    ];
    const out = proposeCuts(words, [], settings);
    const ids = out.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('merges a repeated filler run into one proposal', () => {
    const words = [
      { text: 'ừm,', start: 1.0, end: 1.3 },
      { text: 'ừm', start: 1.4, end: 1.7 },
      { text: 'vâng', start: 3.0, end: 3.3 },
    ];
    const fillers = proposeCuts(words, [], settings).filter((p) => p.kind === 'filler');
    expect(fillers).toHaveLength(1);
    expect(fillers[0].start).toBeCloseTo(1.0);
    expect(fillers[0].end).toBeCloseTo(1.7);
  });

  it('matches expanded lexicon', () => {
    const words = [
      { text: 'uh', start: 0.0, end: 0.3 },
      { text: 'xong', start: 1.5, end: 1.8 },
    ];
    expect(proposeCuts(words, [], settings).some((p) => p.kind === 'filler')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/cutDetection.test.ts`
Expected: FAIL (normalizeFiller not exported, old cs-precision ids collide).

- [ ] **Step 3: Implement normalizer, ms-precision ids, run merging**

```ts
import type { CutProposal, Settings, Word } from './types.js';

const FILLER_LEXICON = new Set(['ừm', 'ừ', 'à', 'ờ', 'ơ', 'nhỉ', 'um', 'uh', 'ờm']);

const FILLER_MERGE_GAP_SEC = 0.5;

export function normalizeFiller(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
}

function proposalId(kind: string, start: number, end: number): string {
  return `${kind}-${Math.round(start * 1000)}-${Math.round(end * 1000)}`;
}

export function proposeCuts(words: Word[], _peaks: number[], settings: Settings): CutProposal[] {
  // _peaks reserved for low-audio detection (ProposalKind 'low-audio') — do not remove.
  const out: CutProposal[] = [];
  let run: Word[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    const start = run[0].start;
    const end = run[run.length - 1].end;
    out.push({
      id: proposalId('filler', start, end),
      start,
      end,
      kind: 'filler',
      reason: run.length === 1 ? `filler word "${run[0].text}"` : `filler run x${run.length}`,
      confidence: 0.85,
    });
    run = [];
  };
  for (const w of words) {
    const isFiller = FILLER_LEXICON.has(normalizeFiller(w.text)) && w.end - w.start <= settings.fillerMaxSec;
    if (!isFiller) {
      flushRun();
      continue;
    }
    if (run.length > 0 && w.start - run[run.length - 1].end >= FILLER_MERGE_GAP_SEC) flushRun();
    run.push(w);
  }
  flushRun();
  for (let i = 0; i + 1 < words.length; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    if (gapEnd - gapStart >= settings.silenceSec) {
      out.push({
        id: proposalId('silence', gapStart, gapEnd),
        start: gapStart,
        end: gapEnd,
        kind: 'silence',
        reason: `silence ${(gapEnd - gapStart).toFixed(2)}s`,
        confidence: gapEnd - gapStart >= 2 * settings.silenceSec ? 0.95 : 0.75,
      });
    }
  }
  // NOTE: a filler flanked by pauses yields touching proposals (silence+filler+silence);
  // downstream treats them as one cut range (merge at apply time, P1).
  return out.sort((a, b) => a.start - b.start);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/cutDetection.test.ts`
Expected: PASS (7 tests: 3 old + 4 new).

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add core/cutDetection.ts tests/cutDetection.test.ts
git commit -m "feat: ms-precision proposal ids and filler normalization"
```

---

### Task 4c: Fix quality-review findings on cutDetection (follow-up)

**Files:**
- Modify: `core/cutDetection.ts`
- Modify: `tests/cutDetection.test.ts` (rewrite the vacuous distinct-ids test, add boundary/NFD/dedupe tests; keep all other tests green)

- [ ] **Step 1: Rewrite weak test + add new tests**

Replace the `hardened proposals` > `gives distinct ids to close starts` test with one that actually forces two proposals (gap 0.55s ≥ merge threshold):

```ts
it('keeps distinct ids for two close filler runs', () => {
  const words = [
    { text: 'ừm', start: 10.001, end: 10.05 },
    { text: 'ừm', start: 10.6, end: 10.65 },
    { text: 'rồi', start: 12.0, end: 12.3 },
  ];
  const fillers = proposeCuts(words, [], settings).filter((p) => p.kind === 'filler');
  expect(fillers).toHaveLength(2);
  expect(fillers[0].id).not.toBe(fillers[1].id);
});
```

Append:

```ts
describe('filler run boundary', () => {
  const mk = (gap: number) => ([
    { text: 'ừm', start: 1.0, end: 2.0 },
    { text: 'ừm', start: 2.0 + gap, end: 2.2 + gap },
    { text: 'xong', start: 5.0, end: 5.3 },
  ]);

  it('splits runs at exactly 0.5s gap', () => {
    expect(proposeCuts(mk(0.5), [], settings).filter((p) => p.kind === 'filler')).toHaveLength(2);
  });

  it('merges runs below 0.5s gap', () => {
    expect(proposeCuts(mk(0.49), [], settings).filter((p) => p.kind === 'filler')).toHaveLength(1);
  });
});

describe('normalizeFiller unicode', () => {
  it('handles NFD input', () => {
    expect(normalizeFiller('ừm'.normalize('NFD'))).toBe('ừm');
  });
});

describe('dedupeIds', () => {
  it('suffixes collisions deterministically', () => {
    expect(dedupeIds(['a', 'a', 'b', 'a'])).toEqual(['a', 'a-2', 'b', 'a-3']);
  });
});
```

- [ ] **Step 2: Run tests to verify new/rewritten ones fail**

Run: `npx vitest run tests/cutDetection.test.ts`
Expected: FAIL (no NFC handling, no dedupeIds export, boundary unpinned).

- [ ] **Step 3: Implement fixes in `core/cutDetection.ts`**

1. Normalizer NFC-first and keep marks: `text.normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{M}]/gu, '')`.
2. Single-word reason via `JSON.stringify(run[0].text)` (no raw interpolation).
3. Export `dedupeIds(ids: string[]): string[]` (suffix `-2`, `-3`… on repeats, first keeps base).
4. Apply `dedupeIds` to proposal ids after sorting (deterministic: same input → same output).

Reference for the changed parts:

```ts
export function normalizeFiller(text: string): string {
  return text.normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{M}]/gu, '');
}

export function dedupeIds(ids: string[]): string[] {
  const seen = new Map<string, number>();
  return ids.map((id) => {
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return n === 1 ? id : `${id}-${n}`;
  });
}
```

And at the end of `proposeCuts`, before `return`:

```ts
const sorted = out.sort((a, b) => a.start - b.start);
const ids = dedupeIds(sorted.map((p) => p.id));
return sorted.map((p, i) => ({ ...p, id: ids[i] }));
```

- [ ] **Step 4: Run tests + typecheck + full suite**

Run: `npx vitest run tests/cutDetection.test.ts` → PASS (11 tests). `npm run typecheck` → passes. `npx vitest run` → no regressions.

- [ ] **Step 5: Commit**

```bash
git add core/cutDetection.ts tests/cutDetection.test.ts
git commit -m "fix: unique proposal ids, NFC filler matching, boundary tests"
```

Deferred to P1 (documented, not this task): total-run duration cap for merged filler runs; merging touching silence+filler+silence into one range at apply time.

---

### Task 5: Caption chunking (pure)

**Files:**
- Create: `core/caption.ts`
- Test: `tests/caption.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { chunkCaption } from '../core/caption.js';

describe('chunkCaption', () => {
  it('packs 5-7 words per line and breaks at sentence end', () => {
    const words = 'một hai ba bốn năm sáu. bảy tám chín mười mười một mười hai mười ba'.split(' ')
      .map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3 }));
    const lines = chunkCaption(words);
    expect(lines[0].text).toBe('một hai ba bốn năm sáu.');
    expect(lines[1].text.split(' ').length).toBeLessThanOrEqual(7);
    expect(lines[0].start).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/caption.test.ts`
Expected: FAIL with "Failed to resolve import ../core/caption.js".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CaptionLine, Word } from './types.js';

const MAX_WORDS = 7;
const MIN_WORDS = 5;

export function chunkCaption(words: Word[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      id: `cc-${current[0].start.toFixed(2)}`,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(' '),
    });
    current = [];
  };
  for (const w of words) {
    current.push(w);
    const endsSentence = /[.!?…:]$/.test(w.text);
    if (current.length >= MAX_WORDS || (endsSentence && current.length >= MIN_WORDS)) flush();
  }
  flush();
  return lines;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/caption.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add core/caption.ts tests/caption.test.ts
git commit -m "feat: caption chunking 5-7 words per line"
```

---

### Task 5b: Harden caption ids + coverage (follow-up from Task 5 review)

**Files:**
- Modify: `core/caption.ts`
- Modify: `tests/caption.test.ts` (keep existing test green)

- [ ] **Step 1: Add tests**

```ts
describe('chunkCaption edge cases', () => {
  const w = (n: number, startAt = 0) =>
    Array.from({ length: n }, (_, i) => ({ text: `w${i}`, start: startAt + i * 0.4, end: startAt + i * 0.4 + 0.3 }));

  it('returns [] for empty input', () => {
    expect(chunkCaption([])).toEqual([]);
  });

  it('flushes at 7 words without punctuation (orphan documented: 7+1)', () => {
    const lines = chunkCaption(w(8));
    expect(lines.map((l) => l.text.split(' ').length)).toEqual([7, 1]);
  });

  it('emits trailing partial line', () => {
    const lines = chunkCaption(w(3));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('w0 w1 w2');
  });

  it('breaks on …? and trailing closers once 5+ words', () => {
    const words = [...w(5), { text: 'thật…?', start: 2.0, end: 2.3 }, ...w(2, 2.4)];
    const lines = chunkCaption(words);
    expect(lines[0].text.endsWith('thật…?')).toBe(true);
    // trailing words force the break: old regex leaves 'rồi."' mid-line
    const words2 = [...w(5), { text: 'rồi."', start: 2.0, end: 2.3 }, ...w(3, 2.4)];
    const lines2 = chunkCaption(words2);
    expect(lines2[0].text.endsWith('rồi."')).toBe(true);
    expect(lines2).toHaveLength(2);
  });

  it('emits unique ids, suffixed on ms collision', () => {
    const lines = chunkCaption(w(20));
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^cc-\d+(-\d+)?$/);
    const dupes = Array.from({ length: 8 }, (_, i) => ({ text: `k${i}`, start: 1.0004, end: 1.0004 + 0.1 }));
    const dlines = chunkCaption(dupes);
    expect(dlines).toHaveLength(2);
    expect(dlines[0].id).toBe('cc-1000');
    expect(dlines[1].id).toBe('cc-1000-2');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/caption.test.ts`
Expected: FAIL (old cs-precision ids, closers not matched).

- [ ] **Step 3: Implement**

In `core/caption.ts`:
1. Import: `import { dedupeIds } from './cutDetection.js';`
2. Sentence-end regex → `/[.!?…:]["'”’)\]}]*$/` (`:` breaks before lists/quotes — intentional, keep).
3. Line id → `` `cc-${Math.round(current[0].start * 1000)}` ``.
4. Before `return lines;`, dedupe: `const ids = dedupeIds(lines.map((l) => l.id)); return lines.map((l, i) => ({ ...l, id: ids[i] }));`

- [ ] **Step 4: Run tests + typecheck + suite**

`npx vitest run tests/caption.test.ts` → PASS (6 tests). `npm run typecheck` → passes. Full suite → no regressions.

- [ ] **Step 5: Commit**

```bash
git add core/caption.ts tests/caption.test.ts
git commit -m "fix: ms-precision caption ids, closer-aware breaks, edge tests"
```

Deferred (not this task): orphan-line rebalancing (7+1 → 4+4), char/duration overflow guard for vertical safe area (P1 with safezone render).

---

### Task 6: Safezone helpers (pure)

**Files:**
- Create: `core/safezone.ts`
- Test: `tests/safezone.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { clampToSafezone, isInsideSafezone } from '../core/safezone.js';

const canvas = { w: 1080, h: 1920 };
const insets = { top: 160, bottom: 420, left: 48, right: 48 };

describe('safezone', () => {
  it('accepts rects inside the safe area', () => {
    expect(isInsideSafezone({ x: 100, y: 900, w: 880, h: 120 }, canvas, insets)).toBe(true);
  });

  it('rejects rects overlapping the TikTok action bar', () => {
    expect(isInsideSafezone({ x: 900, y: 1500, w: 150, h: 120 }, canvas, insets)).toBe(false);
  });

  it('clamps a rect back inside', () => {
    const out = clampToSafezone({ x: 0, y: 0, w: 200, h: 100 }, canvas, insets);
    expect(out.x).toBe(48);
    expect(out.y).toBe(160);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/safezone.test.ts`
Expected: FAIL with "Failed to resolve import ../core/safezone.js".

- [ ] **Step 3: Write minimal implementation**

```ts
export interface Rect { x: number; y: number; w: number; h: number; }
export interface Insets { top: number; bottom: number; left: number; right: number; }

export const VERTICAL_INSETS: Insets = { top: 160, bottom: 420, left: 48, right: 48 };

export function safeArea(canvas: { w: number; h: number }, insets: Insets): Rect {
  return { x: insets.left, y: insets.top, w: canvas.w - insets.left - insets.right, h: canvas.h - insets.top - insets.bottom };
}

export function isInsideSafezone(rect: Rect, canvas: { w: number; h: number }, insets: Insets): boolean {
  const area = safeArea(canvas, insets);
  return rect.x >= area.x && rect.y >= area.y && rect.x + rect.w <= area.x + area.w && rect.y + rect.h <= area.y + area.h;
}

export function clampToSafezone(rect: Rect, canvas: { w: number; h: number }, insets: Insets): Rect {
  const area = safeArea(canvas, insets);
  const w = Math.min(rect.w, area.w);
  const h = Math.min(rect.h, area.h);
  return {
    x: Math.min(Math.max(rect.x, area.x), area.x + area.w - w),
    y: Math.min(Math.max(rect.y, area.y), area.y + area.h - h),
    w,
    h,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/safezone.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add core/safezone.ts tests/safezone.test.ts
git commit -m "feat: vertical video safezone helpers"
```

---

### Task 6b: Harden safeArea degenerate inputs (follow-up from Task 6 review)

**Files:**
- Modify: `core/safezone.ts`
- Modify: `tests/safezone.test.ts`

- [ ] **Step 1: Add tests (import VERTICAL_INSETS instead of redefining)**

```ts
import { describe, expect, it } from 'vitest';
import { clampToSafezone, isInsideSafezone, safeArea, VERTICAL_INSETS } from '../core/safezone.js';

const canvas = { w: 1080, h: 1920 };

describe('safeArea', () => {
  it('computes the 1080x1920 safe rect', () => {
    expect(safeArea(canvas, VERTICAL_INSETS)).toEqual({ x: 48, y: 160, w: 984, h: 1340 });
  });

  it('never returns negative size for insets larger than canvas', () => {
    const area = safeArea({ w: 100, h: 100 }, VERTICAL_INSETS);
    expect(area.w).toBeGreaterThanOrEqual(0);
    expect(area.h).toBeGreaterThanOrEqual(0);
  });
});

describe('clamp edge cases', () => {
  it('shrinks oversized rects and pins them inside', () => {
    const out = clampToSafezone({ x: 0, y: 0, w: 2000, h: 3000 }, canvas, VERTICAL_INSETS);
    expect(isInsideSafezone(out, canvas, VERTICAL_INSETS)).toBe(true);
    expect(out.w).toBe(984);
  });

  it('treats exact edges as inside (inclusive)', () => {
    expect(isInsideSafezone({ x: 48, y: 160, w: 984, h: 1340 }, canvas, VERTICAL_INSETS)).toBe(true);
  });
});
```

Keep the 3 existing tests, but change line 4 to import `VERTICAL_INSETS` and use it in place of the local `insets` const.

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/safezone.test.ts`
Expected: FAIL (negative sizes, no clamp guarantee asserted).

- [ ] **Step 3: Implement**

In `safeArea`, clamp sizes at zero:

```ts
export function safeArea(canvas: { w: number; h: number }, insets: Insets): Rect {
  return {
    x: insets.left,
    y: insets.top,
    w: Math.max(0, canvas.w - insets.left - insets.right),
    h: Math.max(0, canvas.h - insets.top - insets.bottom),
  };
}
```

Add doc comments (inclusive edges; clamp shrinks oversized rects and pins to safe-area origin):

```ts
/** Edges inclusive: a rect exactly filling the safe area counts as inside. */
export function isInsideSafezone( ...
/** Shrinks rects larger than the safe area, then pins to the safe-area origin (top-left). */
export function clampToSafezone( ...
```

Change nothing else.

- [ ] **Step 4: Verify** — safezone tests PASS (7), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add core/safezone.ts tests/safezone.test.ts
git commit -m "fix: non-negative safe area, edge-case tests"
```

Deferred (not this task): moving Rect/Insets to core/types.ts, HORIZONTAL_INSETS preset switch, caption text-to-Rect bridge (caption-render task).

---

### Task 7: Export text builders (SRT + caption.txt)

**Files:**
- Create: `core/exportText.ts`
- Test: `tests/exportText.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildCaptionTxt, buildSrt } from '../core/exportText.js';

describe('buildSrt', () => {
  it('formats lines with SRT timestamps', () => {
    const srt = buildSrt([{ id: 'cc-0', start: 61.5, end: 63.25, text: 'xin chào' }]);
    expect(srt).toContain('00:01:01,500 --> 00:01:03,250');
    expect(srt).toContain('xin chào');
  });
});

describe('buildCaptionTxt', () => {
  it('appends exactly 4 hashtags', () => {
    const out = buildCaptionTxt('Tập 1 podcast', ['#podcast', '#vietnam', '#tips', '#xuhuong']);
    expect(out).toContain('Tập 1 podcast');
    expect(out.match(/#/g)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/exportText.test.ts`
Expected: FAIL with "Failed to resolve import ../core/exportText.js".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CaptionLine } from './types.js';

function stamp(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  const r = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${r}`;
}

export function buildSrt(lines: CaptionLine[]): string {
  return lines.map((l, i) => `${i + 1}\n${stamp(l.start)} --> ${stamp(l.end)}\n${l.text}\n`).join('\n');
}

export function buildCaptionTxt(title: string, hashtags: string[]): string {
  if (hashtags.length !== 4) throw new Error('caption requires exactly 4 hashtags');
  return `${title}\n\n${hashtags.join(' ')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/exportText.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add core/exportText.ts tests/exportText.test.ts
git commit -m "feat: SRT and TikTok caption builders"
```

---

### Task 7b: Harden export builders (follow-up from Task 7 review)

**Files:**
- Modify: `core/exportText.ts`
- Modify: `tests/exportText.test.ts` (keep 2 existing tests green)

- [ ] **Step 1: Add tests**

```ts
describe('buildSrt edges', () => {
  it('carries rounding into minutes', () => {
    const srt = buildSrt([{ id: 'cc-1', start: 59.9999, end: 60.5, text: 'x' }]);
    expect(srt).toContain('00:01:00,000 --> 00:01:00,500');
  });

  it('separates cues with blank lines and terminates the file', () => {
    const srt = buildSrt([
      { id: 'cc-1', start: 0, end: 1, text: 'one' },
      { id: 'cc-2', start: 2, end: 3, text: 'two' },
    ]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:01,000\none\n\n2\n00:00:02,000 --> 00:00:03,000\ntwo\n\n');
  });

  it('returns empty string for no lines', () => {
    expect(buildSrt([])).toBe('');
  });

  it('rejects invalid timestamps', () => {
    expect(() => buildSrt([{ id: 'cc-x', start: 5, end: 3, text: 'bad' }])).toThrow(RangeError);
    expect(() => buildSrt([{ id: 'cc-x', start: NaN, end: 3, text: 'bad' }])).toThrow(RangeError);
  });
});

describe('buildCaptionTxt edges', () => {
  it('rejects wrong hashtag count and malformed tags', () => {
    expect(() => buildCaptionTxt('t', ['#a', '#b'])).toThrow();
    expect(() => buildCaptionTxt('t', ['podcast', '#b', '#c', '#d'])).toThrow();
    expect(() => buildCaptionTxt('t', ['#', '#b', '#c', '#d'])).toThrow();
    expect(() => buildCaptionTxt('t', ['#a b', '#b', '#c', '#d'])).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/exportText.test.ts`
Expected: FAIL (no guards, no final newline, length-only hashtag check).

- [ ] **Step 3: Implement**

In `core/exportText.ts`:
1. `stamp` guards: `if (!Number.isFinite(sec) || sec < 0) throw new RangeError('invalid timestamp');`
2. `buildSrt`: `if (lines.length === 0) return '';` per-line `if (!(l.start <= l.end)) throw new RangeError('cue start after end');` (also rejects NaN), return `...join('\n') + '\n'`.
3. `buildCaptionTxt`: keep count check, add `for (const h of hashtags) if (!/^#[^\s#]+$/.test(h)) throw new Error('malformed hashtag');`

Reference:

```ts
function stamp(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) throw new RangeError('invalid timestamp');
  ...
}

export function buildSrt(lines: CaptionLine[]): string {
  if (lines.length === 0) return '';
  return (
    lines
      .map((l, i) => {
        if (!(l.start <= l.end)) throw new RangeError('cue start after end');
        return `${i + 1}\n${stamp(l.start)} --> ${stamp(l.end)}\n${l.text}\n`;
      })
      .join('\n') + '\n'
  );
}

export function buildCaptionTxt(title: string, hashtags: string[]): string {
  if (hashtags.length !== 4) throw new Error('caption requires exactly 4 hashtags');
  for (const h of hashtags) if (!/^#[^\s#]+$/.test(h)) throw new Error('malformed hashtag');
  return `${title}\n\n${hashtags.join(' ')}`;
}
```

- [ ] **Step 4: Verify** — exportText tests PASS (7), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add core/exportText.ts tests/exportText.test.ts
git commit -m "fix: validate export inputs, terminate SRT file"
```

Deferred (not this task): `\r\n` line endings, cue-text sanitization (blank lines/`-->` inside text) — only if a strict player complains. Filed from 7b quality review (non-blocking, P1): title/text validation (empty title, non-string/multiline text), Array.isArray guard, extra reject cases (Infinity/-1/NaN end), unicode-space hashtag test, caption error-message pinning, hashtag charset/duplicates policy, zero-duration cue policy.

---

### Task 8: Defaults module

**Files:**
- Create: `core/defaults.ts`
- Test: `tests/defaults.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../core/defaults.js';

describe('DEFAULT_SETTINGS', () => {
  it('matches approved spec section 10', () => {
    expect(DEFAULT_SETTINGS.silenceSec).toBe(0.6);
    expect(DEFAULT_SETTINGS.fillerMaxSec).toBe(1.0);
    expect(DEFAULT_SETTINGS.lowAudioDb).toBe(-40);
    expect(DEFAULT_SETTINGS.topicPauseSec).toBe(2.0);
    expect(DEFAULT_SETTINGS.model).toBe('base');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/defaults.test.ts`
Expected: FAIL with "Failed to resolve import ../core/defaults.js".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Settings } from './types.js';

export const DEFAULT_SETTINGS: Settings = {
  silenceSec: 0.6,
  fillerMaxSec: 1.0,
  lowAudioDb: -40,
  topicPauseSec: 2.0,
  model: 'base',
};

export const SETTINGS_RANGES = {
  silenceSec: { min: 0.3, max: 1.5 },
  fillerMaxSec: { min: 0.5, max: 2.0 },
  topicPauseSec: { min: 1.0, max: 4.0 },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/defaults.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add core/defaults.ts tests/defaults.test.ts
git commit -m "feat: approved default settings and ranges"
```

---

### Task 8b: Freeze defaults + relational range test (follow-up from Task 8 review)

**Files:**
- Modify: `core/defaults.ts`
- Modify: `tests/defaults.test.ts` (keep existing test green)

- [ ] **Step 1: Add tests**

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultSettings, DEFAULT_SETTINGS, SETTINGS_RANGES } from '../core/defaults.js';

describe('settings ranges', () => {
  it('keeps every default inside its range', () => {
    expect(DEFAULT_SETTINGS.silenceSec).toBeGreaterThanOrEqual(SETTINGS_RANGES.silenceSec.min);
    expect(DEFAULT_SETTINGS.silenceSec).toBeLessThanOrEqual(SETTINGS_RANGES.silenceSec.max);
    expect(DEFAULT_SETTINGS.fillerMaxSec).toBeGreaterThanOrEqual(SETTINGS_RANGES.fillerMaxSec.min);
    expect(DEFAULT_SETTINGS.fillerMaxSec).toBeLessThanOrEqual(SETTINGS_RANGES.fillerMaxSec.max);
    expect(DEFAULT_SETTINGS.topicPauseSec).toBeGreaterThanOrEqual(SETTINGS_RANGES.topicPauseSec.min);
    expect(DEFAULT_SETTINGS.topicPauseSec).toBeLessThanOrEqual(SETTINGS_RANGES.topicPauseSec.max);
  });
});

describe('createDefaultSettings', () => {
  it('returns independent copies', () => {
    const a = createDefaultSettings();
    a.silenceSec = 9;
    expect(createDefaultSettings().silenceSec).toBe(DEFAULT_SETTINGS.silenceSec);
  });

  it('leaves the shared default frozen', () => {
    expect(() => {
      (DEFAULT_SETTINGS as { silenceSec: number }).silenceSec = 9;
    }).toThrow(TypeError);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/defaults.test.ts`
Expected: FAIL (no createDefaultSettings export, default not frozen).

- [ ] **Step 3: Implement** — in `core/defaults.ts`, freeze the literal and add factory:

```ts
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  silenceSec: 0.6,
  fillerMaxSec: 1.0,
  lowAudioDb: -40,
  topicPauseSec: 2.0,
  model: 'base',
});

export function createDefaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}
```

Keep `SETTINGS_RANGES` unchanged. Values unchanged.

- [ ] **Step 4: Verify** — defaults tests PASS (4), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add core/defaults.ts tests/defaults.test.ts
git commit -m "fix: freeze shared defaults, add settings factory"
```

Note for Task 15: App shell must init state with `createDefaultSettings()`, never `DEFAULT_SETTINGS` by reference.

Filed from 8b quality review (non-blocking, P1): retype `DEFAULT_SETTINGS` as `Readonly<Settings>` so the factory rule is compiler-enforced; assert `Object.isFrozen` instead of relying on strict-mode throw; comment that shallow copy suffices (all fields primitive).

---

### Task 9: Sequential job queue (Electron, pure)

**Files:**
- Create: `electron/jobs.ts`
- Test: `tests/jobs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { JobQueue } from '../electron/jobs.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('JobQueue', () => {
  it('runs only one heavy job at a time, in order', async () => {
    const order: string[] = [];
    const q = new JobQueue();
    const a = q.enqueue('transcribe', async () => { order.push('a-start'); await tick(); order.push('a-end'); });
    const b = q.enqueue('render', async () => { order.push('b-start'); await tick(); order.push('b-end'); });
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('reports queue position for waiting jobs', async () => {
    const q = new JobQueue();
    q.enqueue('transcribe', async () => { await tick(); });
    const events: string[] = [];
    q.onEvent((e) => events.push(`${e.type}:${e.name}`));
    q.enqueue('render', async () => { await tick(); });
    expect(events).toContain('queued:render');
  });

  it('cancel keeps finished work and stops the rest', async () => {
    const q = new JobQueue();
    const ran: string[] = [];
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 30)); ran.push('slow'); });
    const p2 = q.enqueue('render', async () => { ran.push('never'); });
    q.cancelAll();
    await expect(p2).rejects.toThrow('cancelled');
    await slow;
    expect(ran).toEqual(['slow']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/jobs.test.ts`
Expected: FAIL with "Failed to resolve import ../electron/jobs.js".

- [ ] **Step 3: Write minimal implementation**

```ts
export type JobEvent = { type: 'started' | 'queued' | 'done' | 'failed' | 'cancelled'; name: string };

export class JobQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private cancelled = false;
  private listeners: Array<(e: JobEvent) => void> = [];

  onEvent(fn: (e: JobEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: JobEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  enqueue<T>(name: string, job: () => Promise<T>): Promise<T> {
    if (this.cancelled) return Promise.reject(new Error('cancelled'));
    // Captured at enqueue: the head job counts as current work and is allowed
    // to finish after cancelAll(); only jobs that waited behind it are stopped.
    // (Must be captured here — the chained callback runs on a later microtask,
    // so by the time it runs a synchronous cancelAll() has already set the flag.)
    const wasQueued = this.pending > 0;
    if (wasQueued) this.emit({ type: 'queued', name });
    this.pending += 1;
    const run = this.tail.then(async () => {
      if (this.cancelled && wasQueued) {
        this.pending -= 1;
        throw new Error('cancelled');
      }
      this.emit({ type: 'started', name });
      try {
        const result = await job();
        this.emit({ type: 'done', name });
        return result;
      } catch (err) {
        this.emit({ type: 'failed', name });
        throw err;
      } finally {
        this.pending -= 1;
      }
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  cancelAll(): void {
    this.cancelled = true;
    this.emit({ type: 'cancelled', name: 'all' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/jobs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/jobs.ts tests/jobs.test.ts
git commit -m "feat: sequential heavy-job queue with cancel"
```

---

### Task 9b: Harden job queue lifecycle + listeners (follow-up from Task 9 review)

**Files:**
- Modify: `electron/jobs.ts`
- Modify: `tests/jobs.test.ts` (keep 3 existing tests green)

- [ ] **Step 1: Add tests**

```ts
describe('JobQueue lifecycle', () => {
  it('accepts new jobs after reset following a cancel', async () => {
    const q = new JobQueue();
    const ran: string[] = [];
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 20)); ran.push('slow'); });
    const dropped = q.enqueue('render', async () => { ran.push('never'); });
    q.cancelAll();
    await expect(dropped).rejects.toThrow('cancelled');
    await slow;
    q.reset();
    await q.enqueue('render2', async () => { ran.push('render2'); });
    expect(ran).toEqual(['slow', 'render2']);
  });

  it('isolates throwing listeners and supports unsubscribe', async () => {
    const q = new JobQueue();
    const seen: string[] = [];
    q.onEvent(() => { throw new Error('boom'); });
    const off = q.onEvent((e) => { seen.push(`${e.type}:${e.name}`); });
    off();
    const seen2: string[] = [];
    q.onEvent((e) => { seen2.push(`${e.type}:${e.name}`); });
    await q.enqueue('job', async () => 'ok');
    expect(seen).toEqual([]);
    expect(seen2).toContain('done:job');
  });

  it('emits cancelled per dropped job', async () => {
    const q = new JobQueue();
    const events: string[] = [];
    q.onEvent((e) => { events.push(`${e.type}:${e.name}`); });
    const slow = q.enqueue('transcribe', async () => { await new Promise((r) => setTimeout(r, 20)); });
    const dropped = q.enqueue('render', async () => undefined);
    q.cancelAll();
    await expect(dropped).rejects.toThrow('cancelled');
    await slow;
    expect(events).toContain('cancelled:render');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/jobs.test.ts`
Expected: FAIL (no reset export, listener throw breaks flow, no per-job cancelled event).

- [ ] **Step 3: Implement** — in `electron/jobs.ts`:
1. `onEvent` returns unsubscribe: push, return `() => { this.listeners = this.listeners.filter((l) => l !== fn); }`.
2. `emit` iterates a snapshot with try/catch: `for (const fn of [...this.listeners]) { try { fn(e); } catch { /* listener errors must not break job flow */ } }`.
3. Cancel-drop path emits `{ type: 'cancelled', name }` before throwing.
4. Add `reset()`: `if (this.pending > 0) throw new Error('reset while jobs running'); this.cancelled = false;`

Reference for changed members (rest of class unchanged):

```ts
onEvent(fn: (e: JobEvent) => void): () => void {
  this.listeners.push(fn);
  return () => {
    this.listeners = this.listeners.filter((l) => l !== fn);
  };
}

private emit(e: JobEvent): void {
  for (const fn of [...this.listeners]) {
    try {
      fn(e);
    } catch {
      /* listener errors must not break job flow */
    }
  }
}

reset(): void {
  if (this.pending > 0) throw new Error('reset while jobs running');
  this.cancelled = false;
}
```

And in the cancel-drop branch: `this.emit({ type: 'cancelled', name });` before `throw new Error('cancelled');`.

- [ ] **Step 4: Verify** — jobs tests PASS (6), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add electron/jobs.ts tests/jobs.test.ts
git commit -m "fix: queue reset, listener isolation, per-job cancelled event"
```

Note for Tasks 15/16: main must call `queue.reset()` when starting a new auto-run after a cancel (queue drains first — reset throws while busy, so await settle first). `cancelled` with `name==='all'` is a global sentinel, not a per-job event — UI counters must ignore it in per-job counts.

Filed from 9b quality review (non-blocking): reset-while-busy throw test, idle-cancel-bricks-until-reset test, one-line snapshot-semantics comment.

---

### Task 10: FFmpeg arg builders + runners (injectable spawn)

**Files:**
- Create: `electron/media.ts`
- Test: `tests/media.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildAudioExtractArgs, buildPeaksArgs, buildProbeArgs, runFfprobe } from '../electron/media.js';

describe('media arg builders', () => {
  it('builds a probe command', () => {
    expect(buildProbeArgs('C:/vids/ep1.mp4')).toEqual([
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', 'C:/vids/ep1.mp4',
    ]);
  });

  it('builds 16kHz mono extract args', () => {
    expect(buildAudioExtractArgs('in.mp4', 'out.wav')).toEqual(['-y', '-i', 'in.mp4', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', 'out.wav']);
  });

  it('builds raw peaks pipe args', () => {
    expect(buildPeaksArgs('in.mp4')).toEqual(['-v', 'error', '-i', 'in.mp4', '-ar', '8000', '-ac', '1', '-f', 's16le', '-']);
  });
});

describe('runFfprobe', () => {
  it('parses duration from stdout', async () => {
    const spawn = vi.fn().mockReturnValue({ stdout: 'duration=120.5\n' });
    expect(await runFfprobe('x.mp4', spawn)).toBeCloseTo(120.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media.test.ts`
Expected: FAIL with "Failed to resolve import ../electron/media.js".

- [ ] **Step 3: Write minimal implementation**

```ts
export type SpawnFn = (cmd: string, args: string[]) => { stdout: string };

export function buildProbeArgs(input: string): string[] {
  return ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', input];
}

export function buildAudioExtractArgs(input: string, outputWav: string): string[] {
  return ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputWav];
}

export function buildPeaksArgs(input: string): string[] {
  return ['-v', 'error', '-i', input, '-ar', '8000', '-ac', '1', '-f', 's16le', '-'];
}

export async function runFfprobe(input: string, spawn: SpawnFn): Promise<number> {
  const { stdout } = spawn('ffprobe', buildProbeArgs(input));
  const match = stdout.match(/duration=([\d.]+)/);
  if (!match) throw new Error('ffprobe: duration not found');
  return Number(match[1]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/media.ts tests/media.test.ts
git commit -m "feat: ffmpeg arg builders with injectable runner"
```

---

### Task 10b: Harden media runners (follow-up from Task 10 review)

**Files:**
- Modify: `electron/media.ts`
- Modify: `tests/media.test.ts` (keep green; update extract-args expectation with `-vn`, tighten `toBe`)

- [ ] **Step 1: Add/adjust tests**

Change `toBeCloseTo(120.5)` → `toBe(120.5)`, add `'-vn'` to the extract-args expectation (after `'-y', '-i', 'in.mp4'`), and append:

```ts
describe('runFfprobe edges', () => {
  it('forwards cmd and builder args to spawn', async () => {
    const spawn = vi.fn().mockReturnValue({ stdout: 'duration=10.5\n' });
    await runFfprobe('x.mp4', spawn);
    expect(spawn).toHaveBeenCalledWith('ffprobe', buildProbeArgs('x.mp4'));
  });

  it('rejects missing, N/A, and malformed durations', async () => {
    const bad = (stdout: string) => vi.fn().mockReturnValue({ stdout });
    await expect(runFfprobe('x.mp4', bad(''))).rejects.toThrow('duration not found');
    await expect(runFfprobe('x.mp4', bad('duration=N/A\n'))).rejects.toThrow('invalid duration');
    await expect(runFfprobe('x.mp4', bad('duration=1.2.3\n'))).rejects.toThrow('invalid duration');
  });
});

describe('runPeaks', () => {
  it('decodes s16le bytes and drops a trailing odd byte', () => {
    const spawn = vi.fn().mockReturnValue(new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80, 0x01]));
    const samples = runPeaks('in.mp4', spawn);
    expect(spawn).toHaveBeenCalledWith('ffmpeg', buildPeaksArgs('in.mp4'));
    expect(Array.from(samples)).toEqual([0, 32767, -32768]);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/media.test.ts`
Expected: FAIL (no binary runner, weak guards, missing -vn).

- [ ] **Step 3: Implement** in `electron/media.ts`:
1. `buildAudioExtractArgs`: insert `'-vn'` after the input (`['-y', '-i', input, '-vn', ...]`).
2. Anchored finite-checked probe parse:

```ts
export async function runFfprobe(input: string, spawn: SpawnFn): Promise<number> {
  const { stdout } = spawn('ffprobe', buildProbeArgs(input));
  const match = stdout.match(/^duration=(.+)$/m);
  if (!match) throw new Error('ffprobe: duration not found');
  const value = Number(match[1].trim());
  if (!Number.isFinite(value)) throw new Error(`ffprobe: invalid duration: ${match[1].trim()}`);
  return value;
}
```

3. Binary peaks runner (string stdout would corrupt s16le bytes):

```ts
export type SpawnBinaryFn = (cmd: string, args: string[]) => Uint8Array;

export function runPeaks(input: string, spawn: SpawnBinaryFn): Int16Array {
  const raw = spawn('ffmpeg', buildPeaksArgs(input));
  const usable = raw.byteLength - (raw.byteLength % 2);
  const copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + usable);
  return new Int16Array(copy);
}
```

- [ ] **Step 4: Verify** — media tests PASS (7: 4 existing + 3 new), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add electron/media.ts tests/media.test.ts
git commit -m "fix: binary peaks runner, strict probe parsing"
```

---

### Task 11: Whisper runner (arg builder + progress parser)

**Files:**
- Create: `electron/whisper.ts`
- Test: `tests/whisper.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildWhisperArgs, parseProgressLine } from '../electron/whisper.js';

describe('buildWhisperArgs', () => {
  it('forces Vietnamese with word timestamps as JSON', () => {
    expect(buildWhisperArgs('model.bin', 'audio.wav', 'out.json')).toEqual([
      '-m', 'model.bin', '-l', 'vi', '-f', 'audio.wav', '--output-json', '--max-len', '1', '-oj', 'out.json',
    ]);
  });
});

describe('parseProgressLine', () => {
  it('reads percent from whisper progress output', () => {
    expect(parseProgressLine('whisper_print_progress_callback: progress = 42%')).toBe(42);
    expect(parseProgressLine('some other log line')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/whisper.test.ts`
Expected: FAIL with "Failed to resolve import ../electron/whisper.js".

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildWhisperArgs(modelPath: string, audioWav: string, outJson: string): string[] {
  return ['-m', modelPath, '-l', 'vi', '-f', audioWav, '--output-json', '--max-len', '1', '-oj', outJson];
}

export function parseProgressLine(line: string): number | null {
  const match = line.match(/progress\s*=\s*(\d{1,3})%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/whisper.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/whisper.ts tests/whisper.test.ts
git commit -m "feat: whisper sidecar args and progress parser"
```

---

### Task 11b: Fix whisper-cli flags to match real CLI (follow-up from Task 11 review)

Verified against whisper.cpp `examples/cli` README: `-ojson/--output-json` is a BOOLEAN flag (not a path); output path comes from `-of/--output-file` (basename WITHOUT extension, `.json` appended automatically); word-level timestamps come from `-ml 1/--max-len 1`; progress lines require `-pp/--print-progress`. The Task 11 builder (`-oj <path>`, no `-pp`) would pass the path as a stray input file and emit no progress.

**Files:**
- Modify: `electron/whisper.ts`
- Modify: `tests/whisper.test.ts` (update args expectation, add coverage)

- [ ] **Step 1: Rewrite tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildWhisperArgs, parseProgressLine, whisperJsonPath } from '../electron/whisper.js';

describe('buildWhisperArgs', () => {
  it('forces Vietnamese with word timestamps as JSON to a basename', () => {
    expect(buildWhisperArgs('model.bin', 'audio.wav', 'out/transcript')).toEqual([
      '-m', 'model.bin', '-l', 'vi', '-f', 'audio.wav',
      '--max-len', '1', '--print-progress', '--output-json', '--output-file', 'out/transcript',
    ]);
  });
});

describe('whisperJsonPath', () => {
  it('appends .json to the basename', () => {
    expect(whisperJsonPath('out/transcript')).toBe('out/transcript.json');
  });
});

describe('parseProgressLine', () => {
  it('reads percent from whisper progress output', () => {
    expect(parseProgressLine('whisper_print_progress_callback: progress = 42%')).toBe(42);
    expect(parseProgressLine('some other log line')).toBeNull();
  });

  it('handles boundaries and spacing variants', () => {
    expect(parseProgressLine('progress = 0%')).toBe(0);
    expect(parseProgressLine('progress =  100%')).toBe(100);
    expect(parseProgressLine('progress = 101%')).toBeNull();
    expect(parseProgressLine('progress=5%')).toBe(5);
    expect(parseProgressLine('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/whisper.test.ts`
Expected: FAIL (wrong flags, no whisperJsonPath export).

- [ ] **Step 3: Implement**

```ts
export function buildWhisperArgs(modelPath: string, audioWav: string, outBase: string): string[] {
  return [
    '-m', modelPath, '-l', 'vi', '-f', audioWav,
    '--max-len', '1', '--print-progress', '--output-json', '--output-file', outBase,
  ];
}

export function whisperJsonPath(outBase: string): string {
  return `${outBase}.json`;
}

export function parseProgressLine(line: string): number | null {
  const match = line.match(/progress\s*=\s*(\d{1,3})%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}
```

`parseProgressLine` unchanged.

- [ ] **Step 4: Update Task 16 snippet** — in the `ai:transcribe` handler, replace `outJson` with basename flow:

```ts
import { buildWhisperArgs, whisperJsonPath } from './whisper.js';
...
    const outBase = `${workDir}/transcript`;
    spawnSync('whisper-cli', buildWhisperArgs(modelPath, wav, outBase), { stdio: 'ignore' });
    return whisperJsonPath(outBase);
```

- [ ] **Step 5: Verify** — whisper tests PASS (4), `npm run typecheck` passes, full suite no regressions. Also run a real end-to-end flag check IF `whisper-cli` exists on the machine (`Get-Command whisper-cli`): `whisper-cli --help` must list `--output-file` and `--print-progress`; otherwise note as Task 16 wiring-time verification.

- [ ] **Step 6: Commit**

```bash
git add electron/whisper.ts tests/whisper.test.ts docs/superpowers/plans/2026-09-08-auto-podcast-editor-mvp.md
git commit -m "fix: correct whisper-cli flags (-of basename, -pp progress)"
```

---

### Task 11c: Guard whisperJsonPath + fix plan flag typo (follow-up from 11b review)

**Files:**
- Modify: `electron/whisper.ts`
- Modify: `tests/whisper.test.ts`
- Modify: `docs/superpowers/plans/2026-09-08-auto-podcast-editor-mvp.md` (this section's intro: `-oj/--output-json` → `-ojson/--output-json`)

- [ ] **Step 1: Add test**

```ts
it('does not double-append .json', () => {
  expect(whisperJsonPath('out/transcript.json')).toBe('out/transcript.json');
});
```

(Append inside the existing `whisperJsonPath` describe.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/whisper.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `electron/whisper.ts`:

```ts
export function whisperJsonPath(outBase: string): string {
  return outBase.endsWith('.json') ? outBase : `${outBase}.json`;
}
```

Fix the intro line of Task 11b in the plan file: `-oj/--output-json` → `-ojson/--output-json` (correct short forms: `-ojson`, `-of`, `-pp`).

- [ ] **Step 4: Verify** — whisper tests PASS (5), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add electron/whisper.ts tests/whisper.test.ts docs/superpowers/plans/2026-09-08-auto-podcast-editor-mvp.md
git commit -m "fix: idempotent whisperJsonPath, correct flag shorts in plan"
```

---

### Task 12: Project reducer with undo (pure)

**Files:**
- Create: `src/state/reducer.ts`
- Test: `tests/reducer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createState, reduce } from '../src/state/reducer.js';
import { DEFAULT_SETTINGS } from '../core/defaults.js';

describe('reducer undo', () => {
  it('applies a cut and undoes the whole auto batch at once', () => {
    let s = createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, {
      type: 'apply-auto-cuts',
      clips: [
        { id: 'k1', track: 'V1', start: 0, end: 10, label: 'keep 1' },
        { id: 'k2', track: 'V1', start: 20, end: 100, label: 'keep 2' },
      ],
    });
    expect(s.present.clips).toHaveLength(2);
    s = reduce(s, { type: 'undo' });
    expect(s.present.clips).toHaveLength(0);
  });

  it('splits a clip at a frame boundary', () => {
    let s = createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });
    s = reduce(s, { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'keep' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    expect(s.present.clips.map((c) => [c.start, c.end])).toEqual([[0, 4], [4, 10]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reducer.test.ts`
Expected: FAIL with "Failed to resolve import ../src/state/reducer.js".

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Clip, Preset, Project, Settings } from '../../core/types.js';

export interface Init {
  name: string;
  sourcePath: string;
  durationSec: number;
  preset: Preset;
  settings: Settings;
}

export type Action =
  | { type: 'apply-auto-cuts'; clips: Clip[] }
  | { type: 'split-clip'; id: string; at: number }
  | { type: 'delete-clip'; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

export interface State { past: Project[]; present: Project; future: Project[]; }

export function createState(init: Init): State {
  const present: Project = { version: 1, ...init, clips: [], proposals: [], captions: [] };
  return { past: [], present, future: [] };
}

function push(state: State, present: Project): State {
  return { past: [...state.past, state.present], present, future: [] };
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'apply-auto-cuts':
      return push(state, { ...state.present, clips: action.clips });
    case 'split-clip': {
      const clips: Clip[] = [];
      for (const c of state.present.clips) {
        if (c.id !== action.id || action.at <= c.start || action.at >= c.end) {
          clips.push(c);
          continue;
        }
        clips.push({ ...c, end: action.at });
        clips.push({ ...c, id: `${c.id}-b`, start: action.at });
      }
      return push(state, { ...state.present, clips });
    }
    case 'delete-clip':
      return push(state, { ...state.present, clips: state.present.clips.filter((c) => c.id !== action.id) });
    case 'undo': {
      if (state.past.length === 0) return state;
      const present = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present, future: [state.present, ...state.future] };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [present, ...future] = state.future;
      return { past: [...state.past, state.present], present, future };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reducer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/state/reducer.ts tests/reducer.test.ts
git commit -m "feat: timeline reducer with batch undo"
```

---

### Task 12b: Fix split-id collisions + no-op history (follow-up from Task 12 review)

**Files:**
- Modify: `src/state/reducer.ts`
- Modify: `tests/reducer.test.ts` (keep 2 existing tests green)

- [ ] **Step 1: Add tests**

```ts
describe('reducer robustness', () => {
  const init = () => createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });

  it('keeps ids unique across double splits', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 2 });
    const ids = s.present.clips.map((c) => c.id);
    expect(s.present.clips).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    const after = reduce(s, { type: 'delete-clip', id: ids[1] });
    expect(after.present.clips).toHaveLength(2);
  });

  it('redo round-trips an undone split', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    s = reduce(s, { type: 'undo' });
    expect(s.present.clips).toHaveLength(1);
    s = reduce(s, { type: 'redo' });
    expect(s.present.clips.map((c) => [c.start, c.end])).toEqual([[0, 4], [4, 10]]);
  });

  it('treats no-op delete/split as identity (same reference, redo kept)', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    expect(reduce(s, { type: 'delete-clip', id: 'missing' })).toBe(s);
    expect(reduce(s, { type: 'split-clip', id: 'missing', at: 4 })).toBe(s);
    expect(reduce(s, { type: 'split-clip', id: 'k1', at: 0 })).toBe(s);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/reducer.test.ts`
Expected: FAIL (duplicate `k1-b` ids, no-op pushes, no redo coverage).

- [ ] **Step 3: Implement** — in `src/state/reducer.ts`:
1. Split id → `` `${c.id}@${action.at}` `` (unique per source clip + cut point).
2. `split-clip`: track `didSplit` flag; `return didSplit ? push(...) : state`.
3. `delete-clip`: `if (!state.present.clips.some((c) => c.id === action.id)) return state;`.
4. `apply-auto-cuts`: copy array — `clips: [...action.clips]`.
5. Add `default: return state;` to the switch.

Reference for the changed cases (rest unchanged):

```ts
    case 'apply-auto-cuts':
      return push(state, { ...state.present, clips: [...action.clips] });
    case 'split-clip': {
      const clips: Clip[] = [];
      let didSplit = false;
      for (const c of state.present.clips) {
        if (c.id !== action.id || action.at <= c.start || action.at >= c.end) {
          clips.push(c);
          continue;
        }
        didSplit = true;
        clips.push({ ...c, end: action.at });
        clips.push({ ...c, id: `${c.id}@${action.at}`, start: action.at });
      }
      if (!didSplit) return state;
      return push(state, { ...state.present, clips });
    }
    case 'delete-clip':
      if (!state.present.clips.some((c) => c.id === action.id)) return state;
      return push(state, { ...state.present, clips: state.present.clips.filter((c) => c.id !== action.id) });
```

plus `default: return state;` before the switch close.

- [ ] **Step 4: Verify** — reducer tests PASS (5), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/state/reducer.ts tests/reducer.test.ts
git commit -m "fix: unique split ids, no-op history guards"
```

Deferred (not this task): history cap (~50-100), float-to-frame quantization at callers.

---

### Task 12c: Harden reducer inputs + pin history tests (follow-up from 12b review)

**Files:**
- Modify: `src/state/reducer.ts`
- Modify: `tests/reducer.test.ts`

- [ ] **Step 1: Strengthen tests**

In the double-split test, replace the length/Set assertions with exact expectations:

```ts
    expect(s.present.clips.map((c) => c.id)).toEqual(['k1', 'k1@2', 'k1@4']);
    expect(s.present.clips.map((c) => [c.start, c.end])).toEqual([[0, 2], [2, 4], [4, 10]]);
```

Append:

```ts
describe('reducer input hardening', () => {
  const init = () => createState({ name: 'ep1', sourcePath: 'x.mp4', durationSec: 100, preset: 'vertical', settings: DEFAULT_SETTINGS });

  it('rejects non-finite split points', () => {
    const s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    expect(reduce(s, { type: 'split-clip', id: 'k1', at: NaN })).toBe(s);
  });

  it('deep-copies clips on apply (caller mutation cannot leak)', () => {
    const clips = [{ id: 'k1', track: 'V1' as const, start: 0, end: 10, label: 'k' }];
    const s = reduce(init(), { type: 'apply-auto-cuts', clips });
    clips[0].end = 99;
    clips.push({ id: 'k2', track: 'V1' as const, start: 20, end: 30, label: 'x' });
    expect(s.present.clips).toHaveLength(1);
    expect(s.present.clips[0].end).toBe(10);
  });

  it('preserves the redo stack across no-ops', () => {
    let s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    s = reduce(s, { type: 'split-clip', id: 'k1', at: 4 });
    s = reduce(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = reduce(s, { type: 'delete-clip', id: 'missing' });
    expect(s.future).toHaveLength(1);
    s = reduce(s, { type: 'redo' });
    expect(s.present.clips).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/reducer.test.ts`
Expected: FAIL (NaN slips through, shallow alias, weaker assertions).

- [ ] **Step 3: Implement** — in `src/state/reducer.ts`:
1. `apply-auto-cuts`: `clips: action.clips.map((c) => ({ ...c }))`.
2. `split-clip`: first line of the case block: `if (!Number.isFinite(action.at)) return state;`

Change nothing else.

- [ ] **Step 4: Verify** — reducer tests PASS (8), `npm run typecheck` passes, full suite no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/state/reducer.ts tests/reducer.test.ts
git commit -m "fix: reject NaN splits, deep-copy applied clips"
```

---

### Task 13: Timeline component + component test

**Files:**
- Create: `src/components/Timeline.tsx`
- Test: `tests/Timeline.test.tsx`
- Modify: `src/state/reducer.ts` + `tests/reducer.test.ts` (Step 0 only)

- [ ] **Step 0: Isolate init.settings (follow-up from 12c review — commit separately first)**

Test additions in `tests/reducer.test.ts`:

```ts
  it('rejects infinite split points too', () => {
    const s = reduce(init(), { type: 'apply-auto-cuts', clips: [{ id: 'k1', track: 'V1', start: 0, end: 10, label: 'k' }] });
    expect(reduce(s, { type: 'split-clip', id: 'k1', at: Infinity })).toBe(s);
  });
```

(Append inside the `reducer input hardening` describe; `init` helper already exists there.)

```ts
  it('isolates init.settings (caller mutation cannot leak)', () => {
    const settings = createDefaultSettings();
    const s = createState({ name: 'e', sourcePath: 'x', durationSec: 1, preset: 'vertical', settings });
    settings.silenceSec = 9;
    expect(s.present.settings.silenceSec).toBe(0.6);
  });
```

(Add `createDefaultSettings` to the `../core/defaults.js` import — note the current test file imports `DEFAULT_SETTINGS`; extend it.)

Impl in `src/state/reducer.ts` `createState`:

```ts
const present: Project = { version: 1, ...init, settings: { ...init.settings }, clips: [], proposals: [], captions: [] };
```

Verify: new tests fail first (Infinity splits, settings leak), then pass; commit alone:

```bash
git add src/state/reducer.ts tests/reducer.test.ts
git commit -m "fix: isolate init.settings, cover infinite splits"
```

Then proceed to Step 1 below.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from '../src/components/Timeline.js';
import type { Clip } from '../core/types.js';

const clips: Clip[] = [
  { id: 'k1', track: 'V1', start: 0, end: 10, label: 'keep 1' },
  { id: 'k2', track: 'V1', start: 20, end: 30, label: 'keep 2' },
];

describe('Timeline', () => {
  it('renders one block per clip and splits on button click', async () => {
    const onSplit = vi.fn();
    const { container } = render(<Timeline clips={clips} onSplit={onSplit} onDelete={() => undefined} />);
    expect(container.querySelectorAll('[data-clip]').length).toBe(2);
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByTestId('split-k1'));
    expect(onSplit).toHaveBeenCalledWith('k1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Timeline.test.tsx`
Expected: FAIL with "Failed to resolve import ../src/components/Timeline.js".

- [ ] **Step 3: Write minimal implementation**

```tsx
import type { Clip } from '../../core/types.js';

interface Props {
  clips: Clip[];
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Timeline({ clips, onSplit, onDelete }: Props): JSX.Element {
  return (
    <div data-timeline>
      {clips.map((c) => (
        <div key={c.id} data-clip={c.id} data-track={c.track}>
          <span>{c.label} ({c.start}s–{c.end}s)</span>
          <button data-testid={`split-${c.id}`} onClick={() => onSplit(c.id)}>Split</button>
          <button data-testid={`delete-${c.id}`} onClick={() => onDelete(c.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Timeline.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/Timeline.tsx tests/Timeline.test.tsx
git commit -m "feat: basic timeline component with split/delete"
```

---

### Task 14: Remotion composition (preview + render share one component)

**Files:**
- Create: `src/remotion/PodcastComposition.tsx`
- Create: `src/remotion/Root.tsx`

- [ ] **Step 1: Write the composition (no test — verified visually via Player in Task 15)**

```tsx
import { AbsoluteFill, OffthreadVideo, Sequence } from 'remotion';
import type { CaptionLine, Clip } from '../../core/types.js';

export interface PodcastProps {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
}

export function PodcastComposition({ sourcePath, clips, captions }: PodcastProps): JSX.Element {
  const video = clips.filter((c) => c.track === 'V1');
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {video.map((c) => (
        <Sequence key={c.id} from={Math.round(c.start * 30)} durationInFrames={Math.round((c.end - c.start) * 30)}>
          <OffthreadVideo src={sourcePath} trimBefore={Math.round(c.start * 30)} trimAfter={Math.round(c.end * 30)} />
        </Sequence>
      ))}
      {captions.map((l) => (
        <Sequence key={l.id} from={Math.round(l.start * 30)} durationInFrames={Math.max(1, Math.round((l.end - l.start) * 30))}>
          <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 460 }}>
            <div style={{ color: '#fff', fontSize: 64, fontWeight: 800, textAlign: 'center', padding: '0 48px' }}>{l.text}</div>
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
```

```tsx
import { Composition } from 'remotion';
import { PodcastComposition } from './PodcastComposition.js';

export function RemotionRoot(): JSX.Element {
  return (
    <Composition
      id="PodcastVertical"
      component={PodcastComposition}
      durationInFrames={1800}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ sourcePath: '', clips: [], captions: [] }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes. If `OffthreadVideo` trim props mismatch the installed Remotion version, fix prop names to match installed types (typecheck is the gate).

- [ ] **Step 3: Commit**

```bash
git add src/remotion/PodcastComposition.tsx src/remotion/Root.tsx
git commit -m "feat: remotion composition for segments and captions"
```

---

### Task 15: App shell wiring + full suite green

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `electron/preload.ts`
- Create: `electron/main.ts`

Wiring notes from Task 10b review (must follow): run `runPeaks`/transcode OFF the Electron main thread (sync spawn of ~57MB pipe freezes UI — use worker or async chunked spawn); decide the empty-peaks error contract (throw in caller if `samples.length === 0`); `runPeaks` LE-reinterpret is correct on all target hosts (do not "fix" with per-sample DataView).

- [ ] **Step 1: Write renderer entry and shell**

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(<App />);
```

```tsx
import { useReducer } from 'react';
import { createDefaultSettings } from '../core/defaults.js';
import { createState, reduce } from './state/reducer.js';
import { Timeline } from './components/Timeline.js';

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(
    reduce,
    createState({ name: 'untitled', sourcePath: '', durationSec: 0, preset: 'vertical', settings: createDefaultSettings() }),
  );
  return (
    <div>
      <h1>Auto Podcast Editor (MVP)</h1>
      <Timeline
        clips={state.present.clips}
        onSplit={(id) => dispatch({ type: 'split-clip', id, at: state.present.clips.find((c) => c.id === id)!.start + 1 })}
        onDelete={(id) => dispatch({ type: 'delete-clip', id })}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write preload and main (thin, manual-verified via dev run)**

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  probe: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
  transcribe: (filePath: string) => ipcRenderer.invoke('ai:transcribe', filePath),
  render: (projectPath: string) => ipcRenderer.invoke('job:render', projectPath),
});
```

```ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { JobQueue } from './jobs.js';
import { runFfprobe } from './media.js';
import { spawnSync } from 'node:child_process';

const queue = new JobQueue();

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({ width: 1400, height: 900, webPreferences: { preload: join(__dirname, 'preload.js') } });
  if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
}

ipcMain.handle('media:probe', (_e, filePath: string) =>
  queue.enqueue('probe', async () =>
    runFfprobe(filePath, (cmd, args) => ({ stdout: spawnSync(cmd, args, { encoding: 'utf8' }).stdout as string })),
  ),
);

void app.whenReady().then(createWindow);
```

- [ ] **Step 3: Run full suite + typecheck**

Run: `npm run typecheck`
Expected: passes.

Run: `npm test`
Expected: all suites pass (projectFile, waveform, cutDetection, caption, safezone, exportText, defaults, jobs, media, whisper, reducer, Timeline = 12 files).

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx src/App.tsx electron/preload.ts electron/main.ts
git commit -m "feat: app shell with timeline wired to reducer"
```

---

### Task 16: Render outputs + transcribe/render IPC wiring + sample pipeline test

**Files:**
- Create: `electron/render.ts`
- Modify: `electron/main.ts`
- Test: `tests/render.test.ts`
- Test: `tests/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildRemotionRenderArgs, buildRenderOutputs } from '../electron/render.js';

describe('buildRenderOutputs', () => {
  it('derives output paths from project path and preset', () => {
    const out = buildRenderOutputs('C:/work/ep1.ape.json', 'vertical');
    expect(out.mp4).toContain('vertical.mp4');
    expect(out.srt.endsWith('captions.srt')).toBe(true);
    expect(out.captionTxt.endsWith('caption.txt')).toBe(true);
    expect(out.thumb.endsWith('thumb.png')).toBe(true);
  });
});

describe('buildRemotionRenderArgs', () => {
  it('renders the vertical composition with a props file', () => {
    expect(buildRemotionRenderArgs('PodcastVertical', 'C:/work/ep1/vertical.mp4', 'C:/work/ep1/props.json')).toEqual([
      'remotion', 'render', 'PodcastVertical', 'C:/work/ep1/vertical.mp4', '--props', 'C:/work/ep1/props.json',
    ]);
  });
});
```

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunkCaption } from '../core/caption.js';
import { proposeCuts } from '../core/cutDetection.js';
import { DEFAULT_SETTINGS } from '../core/defaults.js';
import { buildCaptionTxt, buildSrt } from '../core/exportText.js';
import { loadProject, saveProject } from '../core/projectFile.js';
import type { Project } from '../core/types.js';

describe('sample pipeline', () => {
  it('goes from transcript fixture to export texts and saved project', async () => {
    const words = [
      { text: 'xin', start: 0.0, end: 0.3 },
      { text: 'chào', start: 0.4, end: 0.7 },
      { text: 'ừm', start: 0.8, end: 1.1 },
      { text: 'các', start: 2.5, end: 2.7 },
      { text: 'bạn', start: 2.8, end: 3.0 },
    ];
    const proposals = proposeCuts(words, [], DEFAULT_SETTINGS);
    expect(proposals.some((p) => p.kind === 'filler')).toBe(true);
    expect(proposals.some((p) => p.kind === 'silence')).toBe(true);
    const kept = words.filter((w) => !proposals.some((p) => p.kind === 'filler' && p.start === w.start));
    const captions = chunkCaption(kept);
    expect(buildSrt(captions)).toContain('xin chào');
    const dir = mkdtempSync(join(tmpdir(), 'ape-pipe-'));
    const project: Project = {
      version: 1, name: 'sample', sourcePath: 'sample.mp4', durationSec: 4,
      clips: [], proposals, captions, preset: 'vertical', settings: DEFAULT_SETTINGS,
    };
    const file = join(dir, 'sample.ape.json');
    await saveProject(file, project);
    expect(await loadProject(file)).toEqual(project);
    expect(buildCaptionTxt('Sample', ['#a', '#b', '#c', '#d'])).toContain('#d');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/render.test.ts tests/pipeline.test.ts`
Expected: FAIL with "Failed to resolve import ../electron/render.js".

- [ ] **Step 3: Write minimal implementation**

```ts
import { join } from 'node:path';

export interface RenderOutputs { mp4: string; srt: string; captionTxt: string; thumb: string; }

export function buildRenderOutputs(projectPath: string, preset: 'vertical' | 'horizontal'): RenderOutputs {
  const dir = projectPath.replace(/\.ape\.json$/, '');
  const suffix = preset === 'vertical' ? 'vertical' : 'horizontal';
  return {
    mp4: join(dir, `${suffix}.mp4`),
    srt: join(dir, 'captions.srt'),
    captionTxt: join(dir, 'caption.txt'),
    thumb: join(dir, 'thumb.png'),
  };
}

export function buildRemotionRenderArgs(compId: string, outMp4: string, propsPath: string): string[] {
  return ['remotion', 'render', compId, outMp4, '--props', propsPath];
}
```

- [ ] **Step 4: Wire transcribe + render handlers in main.ts**

Add to `electron/main.ts`:

```ts
import { buildAudioExtractArgs } from './media.js';
import { buildWhisperArgs, whisperJsonPath } from './whisper.js';
import { buildRemotionRenderArgs, buildRenderOutputs } from './render.js';

ipcMain.handle('ai:transcribe', (_e, filePath: string, workDir: string, modelPath: string) =>
  queue.enqueue('transcribe', async () => {
    const wav = `${workDir}/audio16k.wav`;
    spawnSync('ffmpeg', buildAudioExtractArgs(filePath, wav), { stdio: 'ignore' });
    const outBase = `${workDir}/transcript`;
    spawnSync('whisper-cli', buildWhisperArgs(modelPath, wav, outBase), { stdio: 'ignore' });
    return whisperJsonPath(outBase);
  }),
);

ipcMain.handle('job:render', (_e, projectPath: string, preset: 'vertical' | 'horizontal', propsPath: string) =>
  queue.enqueue('render', async () => {
    const out = buildRenderOutputs(projectPath, preset);
    spawnSync('npx', buildRemotionRenderArgs('PodcastVertical', out.mp4, propsPath), { stdio: 'inherit' });
    return out;
  }),
);
```

- [ ] **Step 5: Harden loadProject with shape guard (follow-up from Task 2 review)**

Extend the `node:fs` import in `tests/projectFile.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
```

Append this test:

```ts
it('rejects non-object JSON and wrong-shape projects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ape-'));
  const bad = join(dir, 'bad.ape.json');
  writeFileSync(bad, '"just a string"', 'utf8');
  await expect(loadProject(bad)).rejects.toThrow();
  writeFileSync(bad, JSON.stringify({ version: 1, name: 'x' }), 'utf8');
  await expect(loadProject(bad)).rejects.toThrow('invalid project shape');
});
```

Update `loadProject` in `core/projectFile.ts`:

```ts
export async function loadProject(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid project file');
  const candidate = parsed as Partial<Project>;
  if (candidate.version !== 1) throw new Error(`unsupported project version: ${String(candidate.version)}`);
  if (!Array.isArray(candidate.clips) || typeof candidate.settings !== 'object' || candidate.settings === null) {
    throw new Error('invalid project shape');
  }
  return candidate as Project;
}
```

Run: `npx vitest run tests/projectFile.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run full suite + typecheck**

Run: `npm run typecheck`
Expected: passes.

Run: `npm test`
Expected: all 14 suites pass (12 from Task 15 plus render and pipeline).

- [ ] **Step 7: Commit**

```bash
git add electron/render.ts electron/main.ts tests/render.test.ts tests/pipeline.test.ts core/projectFile.ts tests/projectFile.test.ts
git commit -m "feat: render outputs, job IPC wiring, sample pipeline test"
```

---

## Out of scope for this plan (follow-up plans)

- P1: auto SFX/transition, progressive chunk reveal UI, horizontal preset, Undo batch across polish, WaveformView/CutProposals/Preview/SettingsPanel full components.
- P2: beat-cut Recap mode, face-tracking reframe, concurrency settings, semantic topic detection.

## Manual QA checklist (run after Task 15)

1. `npm run dev` opens the app window.
2. Import a 2-minute talking-head MP4, probe returns duration.
3. Transcript appears with word timestamps; silence/filler proposals listed with reasons.
4. Apply cuts → clips appear on timeline; split/delete/undo/redo work.
5. Captions generate 5–7 words/line inside the safezone overlay.
6. Preview plays segments + captions in Remotion Player.
7. Render outputs MP4 + SRT + caption.txt + thumbnail.
8. Cancel mid-transcribe keeps finished work; relaunch restores autosaved project.
