import type { Project, ProjectV2, Track, TimelineItem } from './types.js';
import { requiredHandleFrames } from './timeline.ts';

export function migrateProject(project: Project): ProjectV2 {
  const candidate = project as Partial<ProjectV2>;
  const timebase = candidate.timebase ?? { fpsNum: 30, fpsDen: 1 };
  const tracks = ensureRequiredTracks(candidate.tracks?.length ? candidate.tracks : buildTracks(project), (project.sfx?.length ?? 0) > 0);
  const assets = candidate.assets?.length ? candidate.assets : [{
    id: 'source-asset',
    path: project.sourcePath,
    kind: 'video' as const,
    durationSec: project.durationSec,
  }];
  const items = candidate.items?.length ? candidate.items : buildTimelineItems(project, timebase.fpsNum / timebase.fpsDen);

  return {
    ...project,
    version: 2,
    timebase,
    assets,
    tracks,
    items,
    markers: candidate.markers ?? [],
    audioChains: candidate.audioChains ?? [],
    proxies: candidate.proxies ?? {},
    appliedCommandIds: candidate.appliedCommandIds ?? [],
    sfx: (project.sfx ?? []).map((clip) => ({ ...clip, trackId: clip.trackId ?? 'A2' })),
    subtitleStyle: project.subtitleStyle ?? 'karaoke',
    revision: Number.isInteger(candidate.revision) && (candidate.revision ?? 0) >= 0 ? candidate.revision as number : 0,
  };
}

/** Keeps the additive v2 timeline in sync while legacy UI actions still write clips. */
export function syncProjectTimeline(project: ProjectV2): ProjectV2 {
  const generated = buildTimelineItems(project, project.timebase.fpsNum / project.timebase.fpsDen);
  const legacyIds = new Set(project.clips.map((clip) => clip.id));
  const generatedIds = new Set(generated.map((item) => item.id));
  const nonLegacyItems = project.items.filter((item) => !legacyIds.has(item.id) && !generatedIds.has(item.id));
  return {
    ...project,
    items: [...generated, ...nonLegacyItems].sort((a, b) => a.startFrame - b.startFrame),
  };
}

function buildTracks(project: Project): Track[] {
  const trackIds = new Set(['V1', 'A1', 'A2', 'CC', ...project.clips.map((clip) => clip.track)]);
  if ((project.sfx?.length ?? 0) > 0) trackIds.add('A3');
  return [...trackIds].map((id, index) => ({
    id,
    kind: id === 'CC' ? 'caption' : id === 'A3' ? 'sfx' : id.startsWith('A') ? 'audio' : 'video',
    name: id === 'A1' ? 'Voice' : id === 'A2' ? 'Music' : id === 'A3' ? 'SFX' : id,
    index,
  }));
}

function ensureRequiredTracks(tracks: Track[], needsSfxTrack: boolean): Track[] {
  const required: Track[] = [
    { id: 'A1', kind: 'audio', name: 'Voice', index: 1 },
    { id: 'A2', kind: 'audio', name: 'Music', index: 2 },
  ];
  if (needsSfxTrack || tracks.some((track) => track.id === 'A3')) required.push({ id: 'A3', kind: 'sfx', name: 'SFX', index: 3 });
  const existing = new Map(tracks.map((track) => [track.id, track]));
  for (const track of required) if (!existing.has(track.id)) existing.set(track.id, track);
  return [...existing.values()].map((track, index) => ({ ...track, index }));
}

function buildTimelineItems(project: Project, fps: number): TimelineItem[] {
  return project.clips.map((clip) => {
    const startFrame = Math.max(0, Math.round(clip.start * fps));
    const endFrame = Math.max(startFrame + 1, Math.round(clip.end * fps));
    const transitionFrames = clip.transitionOut?.durationFrames ?? 0;
    const requiredHandle = requiredHandleFrames(clip.transitionOut?.type);
    return {
      id: clip.id,
      trackId: clip.track,
      assetId: clip.assetId ?? 'source-asset',
      label: clip.label,
      startFrame,
      durationFrames: endFrame - startFrame,
      source: {
        sourceIn: clip.sourceIn ?? clip.start,
        sourceOut: (clip.sourceIn ?? clip.start) + clip.end - clip.start,
        handleBeforeFrames: Math.min(requiredHandle, startFrame),
        handleAfterFrames: Math.min(requiredHandle, Math.max(0, Math.round(project.durationSec * fps) - endFrame)),
      },
      transitionKind: clip.transitionOut?.type,
      effects: transitionFrames > 0 ? [{ id: `transition-${clip.id}`, type: clip.transitionOut?.type ?? 'hard-cut', enabled: true, params: { durationFrames: transitionFrames } }] : [],
    };
  });
}
