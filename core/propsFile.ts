import { rename, writeFile } from 'node:fs/promises';
import type { CaptionLine, Clip, SfxClip, SubtitleStyleId, Timebase, TimelineItem, Track } from './types.js';

export interface RenderProps {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
  sfx: SfxClip[];
  subtitleStyle: SubtitleStyleId;
  items?: TimelineItem[];
  tracks?: Track[];
  timebase?: Timebase;
  /** Linear gain applied to the source voice before post-render filtering. */
  originalAudioVolume?: number;
  /** Only used by Player for a generated, processed preview stem. */
  previewAudioPath?: string;
  durationInFrames?: number;
}

/** Props passed to the Remotion composition for preview AND render (single source of truth). */
export function buildRenderProps(
  sourcePath: string,
  clips: Clip[],
  captions: CaptionLine[],
  sfx: SfxClip[] = [],
  subtitleStyle: SubtitleStyleId = 'karaoke',
  items?: TimelineItem[],
  tracks?: Track[],
  timebase: Timebase = { fpsNum: 30, fpsDen: 1 },
): RenderProps {
  return {
    sourcePath,
    clips: clips.map((c) => ({ ...c })),
    captions: captions.map((c) => ({ ...c, words: c.words?.map((word) => ({ ...word })) })),
    sfx: sfx.map((clip) => ({ ...clip })),
    subtitleStyle,
    items: items?.map((item) => ({
      ...item,
      source: item.source ? { ...item.source } : undefined,
      effects: item.effects?.map((effect) => ({ ...effect, params: { ...effect.params } })),
      keyframes: item.keyframes?.map((keyframe) => ({ ...keyframe })),
    })),
    tracks: tracks?.map((track) => ({ ...track })),
    timebase: { ...timebase },
    durationInFrames: undefined,
  };
}

export async function writePropsFile(filePath: string, props: RenderProps): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(props, null, 2), 'utf8');
  await rename(tmpPath, filePath);
}
