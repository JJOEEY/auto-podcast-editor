import { AbsoluteFill, OffthreadVideo, Sequence } from 'remotion';
import type { CaptionLine, Clip } from '../../core/types.js';
import { compressTimeline, TIMELINE_FPS } from '../../core/compressedTimeline.js';

export type PodcastProps = {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
};

export function PodcastComposition({ sourcePath, clips, captions }: PodcastProps): JSX.Element {
  const timeline = compressTimeline(clips, captions, TIMELINE_FPS);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {timeline.video.map((p) => (
        <Sequence key={p.item.id} from={Math.round(p.outStart * TIMELINE_FPS)} durationInFrames={Math.max(1, Math.round((p.outEnd - p.outStart) * TIMELINE_FPS))}>
          <OffthreadVideo src={sourcePath} trimBefore={Math.round(p.item.start * TIMELINE_FPS)} trimAfter={Math.round(p.item.end * TIMELINE_FPS)} />
        </Sequence>
      ))}
      {timeline.captions.map((p) => (
        <Sequence key={`${p.item.id}-${Math.round(p.outStart * 1000)}`} from={Math.round(p.outStart * TIMELINE_FPS)} durationInFrames={Math.max(1, Math.round((p.outEnd - p.outStart) * TIMELINE_FPS))}>
          <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 460 }}>
            <div style={{ color: '#fff', fontSize: 64, fontWeight: 800, textAlign: 'center', padding: '0 48px' }}>{p.item.text}</div>
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
