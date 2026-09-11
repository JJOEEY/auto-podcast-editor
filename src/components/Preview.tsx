import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useRef, useState } from 'react';
import { compressTimeline, TIMELINE_FPS } from '../../core/compressedTimeline.js';
import { buildTransitionPlan } from '../../core/transitionPlan.js';
import { timelineDurationFrames } from '../../core/timelineDuration.js';
import { HORIZONTAL_INSETS, VERTICAL_INSETS } from '../../core/safezone.js';
import type { AudioChain, CaptionLine, Clip, MediaAsset, Preset, Timebase, TimelineItem, Track } from '../../core/types.js';
import { PodcastComposition } from '../remotion/PodcastComposition.js';
import { PodcastHorizontal } from '../remotion/PodcastHorizontal.js';

interface Props {
  sourcePath: string;
  assets?: MediaAsset[];
  clips: Clip[];
  captions: CaptionLine[];
  sfx?: import('../../core/types.js').SfxClip[];
  subtitleStyle?: import('../../core/types.js').SubtitleStyleId;
  items?: TimelineItem[];
  tracks?: Track[];
  timebase?: Timebase;
  preset: Preset;
  audioPreset?: 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm';
  audioChain?: AudioChain;
}

export function Preview({ sourcePath, assets = [], clips, captions, preset, sfx = [], subtitleStyle = 'karaoke', items, tracks, timebase, audioPreset = 'podcast', audioChain }: Props): JSX.Element {
  const playerRef = useRef<PlayerRef>(null);
  const [audioMode, setAudioMode] = useState<'original' | 'enhanced'>('enhanced');
  const [enhancedPath, setEnhancedPath] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [playerSourcePath, setPlayerSourcePath] = useState('');
  const [playerPreviewAudioPath, setPlayerPreviewAudioPath] = useState<string | undefined>();
  const [playerSfx, setPlayerSfx] = useState<typeof sfx>([]);
  const [playerAssets, setPlayerAssets] = useState<MediaAsset[]>([]);
  const [isCaptureMode, setIsCaptureMode] = useState(false);
  const audioTracks = (tracks ?? []).filter((track) => track.kind === 'audio' || track.kind === 'sfx');
  const soloTracks = audioTracks.filter((track) => track.solo);
  const voiceTrack = audioTracks.find((track) => track.id === 'A1');
  const voiceAudible = Boolean(voiceTrack) && !voiceTrack?.muted && (soloTracks.length === 0 || Boolean(voiceTrack?.solo));
  const voiceVolume = voiceAudible ? Math.pow(10, (voiceTrack?.volumeDb ?? 0) / 20) : 0;
  useEffect(() => {
    let active = true;
    void window.api.captureMode().then((enabled) => {
      if (active) setIsCaptureMode(enabled);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    if (!sourcePath || audioMode !== 'enhanced') {
      setAudioBusy(false);
      return () => { active = false; };
    }
    setAudioBusy(true);
    void window.api.audioPreview(sourcePath, audioPreset, audioChain).then((result) => {
      if (active) setEnhancedPath(result.path);
    }).catch(() => {
      if (active) setEnhancedPath(null);
    }).finally(() => {
      if (active) setAudioBusy(false);
    });
    return () => { active = false; };
  }, [audioChain, audioMode, audioPreset, sourcePath]);
  useEffect(() => {
    let active = true;
    if (!sourcePath) {
      setPlayerSourcePath('');
      return () => { active = false; };
    }
    void window.api.mediaUrl(sourcePath).then((url) => {
      if (active) {
        setPlayerSourcePath(url);
      }
    }).catch(() => {
      if (active) setPlayerSourcePath(sourcePath);
    });
    return () => { active = false; };
  }, [sourcePath]);
  useEffect(() => {
    let active = true;
    void Promise.all(assets.map(async (asset) => ({ ...asset, path: await window.api.mediaUrl(asset.path) }))).then((resolved) => {
      if (active) setPlayerAssets(resolved);
    }).catch(() => {
      if (active) setPlayerAssets(assets);
    });
    return () => { active = false; };
  }, [assets]);
  useEffect(() => {
    let active = true;
    if (!enhancedPath || audioMode !== 'enhanced') {
      setPlayerPreviewAudioPath(undefined);
      return () => { active = false; };
    }
    void window.api.mediaUrl(enhancedPath).then((url) => {
      if (active) setPlayerPreviewAudioPath(url);
    }).catch(() => {
      if (active) setPlayerPreviewAudioPath(enhancedPath);
    });
    return () => { active = false; };
  }, [audioMode, enhancedPath]);
  useEffect(() => {
    let active = true;
    const audible = sfx.filter((clip) => {
      if (clip.muted) return false;
      const trackId = clip.trackId ?? 'A2';
      const track = audioTracks.find((candidate) => candidate.id === trackId);
      return Boolean(track) && !track?.muted && (soloTracks.length === 0 || Boolean(track?.solo));
    }).map((clip) => ({
      ...clip,
      volume: clip.volume * Math.pow(10, (audioTracks.find((track) => track.id === (clip.trackId ?? 'A2'))?.volumeDb ?? 0) / 20),
    }));
    void Promise.all(audible.map(async (clip) => ({ ...clip, path: await window.api.mediaUrl(clip.path) }))).then((resolved) => {
      if (active) setPlayerSfx(resolved);
    }).catch(() => {
      if (active) setPlayerSfx(sfx);
    });
    return () => { active = false; };
  }, [sfx]);
  const vertical = preset === 'vertical';
  const timeline = compressTimeline(clips, captions, TIMELINE_FPS);
  const transitionPlan = items?.length && tracks?.length ? buildTransitionPlan(items, tracks, timebase ?? { fpsNum: 30, fpsDen: 1 }) : null;
  const plannedDuration = timelineDurationFrames({ items, tracks, clips, captions, sfx, timebase });
  const insets = vertical ? VERTICAL_INSETS : HORIZONTAL_INSETS;
  const width = vertical ? 1080 : 1920;
  const height = vertical ? 1920 : 1080;
  const Component = vertical ? PodcastComposition : PodcastHorizontal;
  const previewAudioPath = audioMode === 'enhanced' ? playerPreviewAudioPath : undefined;
  useEffect(() => {
    let active = true;
    void window.api.captureMode().then((enabled) => {
      if (!active || !enabled) return;
      const bridge = {
          get ready() { return playerRef.current !== null && playerSourcePath.length > 0; },
          info: () => {
            const element = document.querySelector('[data-player-surface]');
            const bounds = element?.getBoundingClientRect();
            return {
              durationInFrames: plannedDuration,
              rect: bounds
                ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
                : { x: 0, y: 0, width: 1, height: 1 },
            };
          },
        seek: async (frame: number) => {
          const player = playerRef.current;
          if (!player) return;
          player.seekTo(frame);
          const deadline = Date.now() + 1000;
          const targetTime = frame / TIMELINE_FPS;
          while (Date.now() < deadline) {
            const video = document.querySelector('video');
            const frameReady = player.getCurrentFrame() === frame;
            const mediaReady = !video || Math.abs(video.currentTime - targetTime) <= 0.05;
            if (frameReady && mediaReady) break;
            await new Promise((resolve) => window.setTimeout(resolve, 16));
          }
          const video = document.querySelector('video');
          return { frame: player.getCurrentFrame(), currentTime: video?.currentTime ?? null };
        },
      };
      (window as unknown as { __autoPodcastPlayerCapture?: typeof bridge }).__autoPodcastPlayerCapture = bridge;
    }).catch(() => undefined);
    return () => {
      active = false;
      delete (window as unknown as { __autoPodcastPlayerCapture?: unknown }).__autoPodcastPlayerCapture;
    };
  }, [plannedDuration, playerSourcePath]);
  if (!sourcePath) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: 360, color: '#64748b' }}>Import video để xem preview</div>;
  }
  return (
    <div className="preview-module" style={{ position: 'relative', width: '100%', maxWidth: vertical ? 360 : isCaptureMode ? 480 : 720, margin: '0 auto' }}>
      <div className="preview-audio-bar">
        <button type="button" onClick={() => setAudioMode('original')} disabled={audioBusy || audioMode === 'original'}>A: Gốc</button>
        <button type="button" onClick={() => setAudioMode('enhanced')} disabled={audioBusy || audioMode === 'enhanced'}>B: {audioBusy ? 'Đang xử lý…' : 'Voice enhance'}</button>
        <small style={{ alignSelf: 'center', color: '#64748b' }}>{audioMode === 'enhanced' && enhancedPath ? 'Preview cùng filter với export' : 'Âm thanh gốc'}</small>
      </div>
      <div data-player-surface>
        {playerSourcePath ? (
          <Player
            ref={playerRef}
            component={Component}
            inputProps={{ sourcePath: playerSourcePath, assets: playerAssets, clips, captions, sfx: playerSfx, subtitleStyle, items, tracks, timebase, previewAudioPath, originalAudioVolume: voiceVolume }}
            durationInFrames={plannedDuration}
            fps={TIMELINE_FPS}
            compositionWidth={width}
            compositionHeight={height}
            controls={!isCaptureMode}
            errorFallback={({ error }) => {
              console.error(`Player composition error: ${error.message}`);
              return <div style={{ color: '#b91c1c', padding: 16 }}>Preview lỗi: {error.message}</div>;
            }}
            style={{ width: '100%' }}
          />
        ) : <div style={{ display: 'grid', placeItems: 'center', minHeight: 405 }}>Đang nạp media…</div>}
      </div>
      <div style={{ position: 'absolute', pointerEvents: 'none', inset: 0, display: isCaptureMode ? 'none' : undefined }}>
        <div style={{ position: 'absolute', top: `${(insets.top / height) * 100}%`, left: `${(insets.left / width) * 100}%`, right: `${(insets.right / width) * 100}%`, bottom: `${(insets.bottom / height) * 100}%`, border: '1px dashed rgba(255,255,255,.55)' }} />
      </div>
    </div>
  );
}
