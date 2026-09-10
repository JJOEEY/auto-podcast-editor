import { AbsoluteFill, OffthreadVideo, Sequence } from 'remotion';
import type { CaptionLine, Clip } from '../../core/types.js';

export type PodcastProps = {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
};

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
