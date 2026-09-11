import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { CaptionLine, Clip, SfxClip, SubtitleStyleId, Timebase, TimelineItem, Track } from '../../core/types.ts';
import { compressTimeline, TIMELINE_FPS, toFrames } from '../../core/compressedTimeline.ts';
import { buildTransitionPlan } from '../../core/transitionPlan.ts';
import { TransitionVideo } from './TransitionVideo.tsx';

export type PodcastProps = {
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

export function CaptionView({ caption, sourceStart, style, bottomPadding = 460 }: { caption: CaptionLine; sourceStart: number; style: SubtitleStyleId; bottomPadding?: number }): JSX.Element {
  const frame = useCurrentFrame();
  const sourceTime = sourceStart + frame / TIMELINE_FPS;
  const words = caption.words ?? [];
  const activeIndex = words.findIndex((word) => sourceTime >= word.start && sourceTime <= word.end);
  const visibleWords = style === 'typewriter' && activeIndex >= 0 ? words.slice(0, activeIndex + 1) : words;
  const text = visibleWords.length > 0 ? visibleWords.map((word) => word.text).join(' ') : caption.text;
  const base: React.CSSProperties = {
    color: '#fff',
    fontSize: 64,
    fontWeight: 800,
    textAlign: 'center',
    padding: '0 48px',
    lineHeight: 1.1,
  };
  const box = style === 'box' ? { background: 'rgba(0,0,0,.72)', borderRadius: 18, padding: '14px 24px' } : {};
  const neon = style === 'neon' ? { textShadow: '0 0 14px #22d3ee, 0 0 28px #2563eb' } : {};
  const scale = activeIndex >= 0 && style === 'pop' ? interpolate(frame, [0, 4, 8], [0.94, 1.08, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottomPadding }}>
      <div style={{ ...base, ...box, ...neon, transform: `scale(${scale})` }}>
        {words.length > 0 && (style === 'karaoke' || style === 'pop' || style === 'neon')
          ? words.map((word, index) => <span key={`${word.start}-${index}`} style={{ color: index === activeIndex ? '#facc15' : base.color }}>{`${word.text}${index === words.length - 1 ? '' : ' '}`}</span>)
          : text}
      </div>
    </AbsoluteFill>
  );
}

export function PodcastComposition({ sourcePath, clips, captions, sfx, subtitleStyle, items, tracks, timebase, originalAudioVolume = 1, previewAudioPath }: PodcastProps): JSX.Element {
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
            <CaptionView caption={p.item} sourceStart={p.sourceStart ?? p.item.start} style={subtitleStyle} />
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
