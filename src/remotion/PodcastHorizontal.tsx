import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from 'remotion';
import type { CaptionLine, Clip, SfxClip, SubtitleStyleId } from '../../core/types.js';
import { compressTimeline, TIMELINE_FPS, toFrames } from '../../core/compressedTimeline.js';
import { TransitionOverlay } from './TransitionOverlay.js';
import { CaptionView } from './PodcastComposition.js';

export type PodcastHorizontalProps = {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
  sfx: SfxClip[];
  subtitleStyle: SubtitleStyleId;
};

export function PodcastHorizontal({ sourcePath, clips, captions, sfx, subtitleStyle }: PodcastHorizontalProps): JSX.Element {
  const timeline = compressTimeline(clips, captions, TIMELINE_FPS);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {timeline.video.map((p) => {
        const { from, dur } = toFrames(p.outStart, p.outEnd);
        return (
          <Sequence key={p.item.id} from={from} durationInFrames={dur}>
            <OffthreadVideo
              src={sourcePath}
              trimBefore={Math.round(p.item.start * TIMELINE_FPS)}
              trimAfter={Math.round(p.item.end * TIMELINE_FPS)}
            />
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
      {timeline.video.slice(0, -1).map((p, index) => {
        const next = timeline.video[index + 1];
        const transition = p.item.transitionOut;
        if (!transition || transition.durationFrames <= 0) return null;
        const from = Math.max(0, Math.round(next.outStart * TIMELINE_FPS) - Math.floor(transition.durationFrames / 2));
        return <Sequence key={`transition-${p.item.id}`} from={from} durationInFrames={transition.durationFrames}><TransitionOverlay config={transition} /></Sequence>;
      })}
      {sfx.map((clip) => (
        <Sequence key={clip.id} from={Math.round(clip.start * TIMELINE_FPS)} durationInFrames={Math.max(1, Math.round(clip.duration * TIMELINE_FPS))}>
          <Audio src={clip.path} volume={clip.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
