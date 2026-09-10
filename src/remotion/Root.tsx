import { Composition, type AnyZodObject } from 'remotion';
import { PodcastComposition, type PodcastProps } from './PodcastComposition.js';
import { compressTimeline, TIMELINE_FPS } from '../../core/compressedTimeline.js';

const defaultProps: PodcastProps = { sourcePath: '', clips: [], captions: [] };

export function RemotionRoot(): JSX.Element {
  return (
    <Composition<AnyZodObject, PodcastProps>
      id="PodcastVertical"
      component={PodcastComposition}
      durationInFrames={1800}
      fps={TIMELINE_FPS}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        return {
          durationInFrames: compressTimeline(props.clips, props.captions).totalFrames,
          props,
        };
      }}
    />
  );
}
