import { Composition, type AnyZodObject } from 'remotion';
import { PodcastComposition, type PodcastProps } from './PodcastComposition.tsx';
import { PodcastHorizontal, type PodcastHorizontalProps } from './PodcastHorizontal.tsx';
import { TIMELINE_FPS } from '../../core/compressedTimeline.ts';
import { timelineDurationFrames } from '../../core/timelineDuration.ts';

const defaultProps: PodcastProps = { sourcePath: '', clips: [], captions: [], sfx: [], subtitleStyle: 'karaoke' };
const horizontalDefaults: PodcastHorizontalProps = defaultProps;

function metadata({ props }: { props: PodcastProps }) {
  const durationInFrames = props.durationInFrames ?? timelineDurationFrames({ items: props.items, tracks: props.tracks, clips: props.clips, captions: props.captions, sfx: props.sfx, timebase: props.timebase });
  return { durationInFrames, props };
}

export function RemotionRoot(): JSX.Element {
  return (
    <>
      <Composition<AnyZodObject, PodcastProps>
        id="PodcastVertical"
        component={PodcastComposition}
        durationInFrames={1800}
        fps={TIMELINE_FPS}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={metadata}
      />
      <Composition<AnyZodObject, PodcastHorizontalProps>
        id="PodcastHorizontal"
        component={PodcastHorizontal}
        durationInFrames={1800}
        fps={TIMELINE_FPS}
        width={1920}
        height={1080}
        defaultProps={horizontalDefaults}
        calculateMetadata={metadata}
      />
    </>
  );
}
