import { AbsoluteFill, OffthreadVideo, Sequence } from 'remotion';
import type { CaptionLine, Clip } from '../../core/types.js';
import { compressTimeline, TIMELINE_FPS, toFrames } from '../../core/compressedTimeline.js';

export type PodcastHorizontalProps = {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
};

export function PodcastHorizontal({ sourcePath, clips, captions }: PodcastHorizontalProps): JSX.Element {
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
            <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 120 }}>
              <div style={{ color: '#fff', fontSize: 52, fontWeight: 800, textAlign: 'center', padding: '0 60px' }}>
                {p.item.text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
