import { Composition, type AnyZodObject } from 'remotion';
import { PodcastComposition, type PodcastProps } from './PodcastComposition.js';

const defaultProps: PodcastProps = { sourcePath: '', clips: [], captions: [] };

export function RemotionRoot(): JSX.Element {
  return (
    <Composition<AnyZodObject, PodcastProps>
      id="PodcastVertical"
      component={PodcastComposition}
      durationInFrames={1800}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
    />
  );
}
