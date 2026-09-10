import { Composition, type AnyZodObject } from 'remotion';
import { PodcastComposition, type PodcastProps } from './PodcastComposition.js';
import { PodcastHorizontal, type PodcastHorizontalProps } from './PodcastHorizontal.js';
import { compressTimeline, TIMELINE_FPS } from '../../core/compressedTimeline.js';

const defaultProps: PodcastProps = { sourcePath: '', clips: [], captions: [] };
const horizontalDefaults: PodcastHorizontalProps = defaultProps;

function metadata({ props }: { props: PodcastProps }) {
  return { durationInFrames: compressTimeline(props.clips, props.captions).totalFrames, props };
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
