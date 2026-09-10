import { Player } from '@remotion/player';
import { compressTimeline, TIMELINE_FPS } from '../../core/compressedTimeline.js';
import { HORIZONTAL_INSETS, VERTICAL_INSETS } from '../../core/safezone.js';
import type { CaptionLine, Clip, Preset } from '../../core/types.js';
import { PodcastComposition } from '../remotion/PodcastComposition.js';
import { PodcastHorizontal } from '../remotion/PodcastHorizontal.js';

interface Props {
  sourcePath: string;
  clips: Clip[];
  captions: CaptionLine[];
  preset: Preset;
}

export function Preview({ sourcePath, clips, captions, preset }: Props): JSX.Element {
  if (!sourcePath) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: 360, color: '#64748b' }}>Import video để xem preview</div>;
  }
  const vertical = preset === 'vertical';
  const timeline = compressTimeline(clips, captions, TIMELINE_FPS);
  const insets = vertical ? VERTICAL_INSETS : HORIZONTAL_INSETS;
  const width = vertical ? 1080 : 1920;
  const height = vertical ? 1920 : 1080;
  const Component = vertical ? PodcastComposition : PodcastHorizontal;
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: vertical ? 360 : 720, margin: '0 auto' }}>
      <Player
        component={Component}
        inputProps={{ sourcePath, clips, captions }}
        durationInFrames={timeline.totalFrames}
        fps={TIMELINE_FPS}
        compositionWidth={width}
        compositionHeight={height}
        controls
        style={{ width: '100%' }}
      />
      <div style={{ position: 'absolute', pointerEvents: 'none', inset: 0 }}>
        <div style={{ position: 'absolute', top: `${(insets.top / height) * 100}%`, left: `${(insets.left / width) * 100}%`, right: `${(insets.right / width) * 100}%`, bottom: `${(insets.bottom / height) * 100}%`, border: '1px dashed rgba(255,255,255,.55)' }} />
      </div>
    </div>
  );
}
