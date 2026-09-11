import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from 'remotion';
import type { CaptionLine, Clip, SfxClip, SubtitleStyleId, Timebase, TimelineItem, Track } from '../../core/types.ts';
import { compressTimeline, TIMELINE_FPS, toFrames } from '../../core/compressedTimeline.ts';
import { buildTransitionPlan } from '../../core/transitionPlan.ts';
import { TransitionVideo } from './TransitionVideo.tsx';
import { CaptionView } from './PodcastComposition.tsx';

export type PodcastHorizontalProps = {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
  sfx: SfxClip[];
  subtitleStyle: SubtitleStyleId;
  items?: TimelineItem[];
  tracks?: Track[];
  timebase?: Timebase;
  originalAudioVolume?: number;
  previewAudioPath?: string;
  durationInFrames?: number;
};

export function PodcastHorizontal({ sourcePath, clips, captions, sfx, subtitleStyle, items, tracks, timebase, originalAudioVolume = 1, previewAudioPath }: PodcastHorizontalProps): JSX.Element {
  const timeline = compressTimeline(clips, captions, TIMELINE_FPS);
  const transitionPlan = items?.length && tracks?.length ? buildTransitionPlan(items, tracks, timebase ?? { fpsNum: 30, fpsDen: 1 }) : null;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {transitionPlan
        ? transitionPlan.placements.map((placement) => (
          <Sequence key={placement.item.id} from={placement.outputStartFrame} durationInFrames={placement.outputDurationFrames}>
            <TransitionVideo sourcePath={sourcePath} placement={placement} volume={previewAudioPath ? 0 : originalAudioVolume} audioSourcePath={previewAudioPath} audioVolume={originalAudioVolume} />
          </Sequence>
        ))
        : timeline.video.map((p) => {
          const { from, dur } = toFrames(p.outStart, p.outEnd);
          return (
            <Sequence key={p.item.id} from={from} durationInFrames={dur}>
              <>
                <OffthreadVideo src={sourcePath} trimBefore={Math.round(p.item.start * TIMELINE_FPS)} volume={previewAudioPath ? 0 : originalAudioVolume} onError={(error) => console.error('Player video error', error)} />
                {previewAudioPath && <Audio src={previewAudioPath} trimBefore={Math.round(p.item.start * TIMELINE_FPS)} volume={originalAudioVolume} />}
              </>
            </Sequence>
          );
        })}
      {timeline.captions.map((p) => {
        const { from, dur } = toFrames(p.outStart, p.outEnd);
        return (
          <Sequence key={`${p.item.id}-${Math.round(p.outStart * 1000)}`} from={from} durationInFrames={dur}>
            <CaptionView caption={p.item} sourceStart={p.sourceStart ?? p.item.start} style={subtitleStyle} bottomPadding={120} />
          </Sequence>
        );
      })}
      {sfx.map((clip) => (
        <Sequence key={clip.id} from={Math.round(clip.start * TIMELINE_FPS)} durationInFrames={Math.max(1, Math.round(clip.duration * TIMELINE_FPS))}>
          <Audio src={clip.path} volume={clip.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
