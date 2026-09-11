import { buildKeepClips } from './keepRanges.js';
import { requiredHandleFrames, rippleDelete, validateTimelineItem } from './timeline.js';
import { syncProjectTimeline } from './projectMigration.js';
import type { EditorCommand, ProjectV2, Track } from './types.js';

export interface CommandDiff {
  changedItemIds: string[];
  removedItemIds: string[];
  shiftedItemIds: string[];
  changedFields: string[];
}

export interface DryRunResult {
  ok: boolean;
  requiresConfirmation: boolean;
  project: ProjectV2;
  diff: CommandDiff;
  errors: string[];
  warnings: string[];
}

function cloneProject(project: ProjectV2): ProjectV2 {
  return JSON.parse(JSON.stringify(project)) as ProjectV2;
}

function commandIds(project: ProjectV2): Set<string> {
  return new Set(project.appliedCommandIds ?? []);
}

function validateCommand(command: EditorCommand, project: ProjectV2): string[] {
  const errors: string[] = [];
  const trackById = new Map(project.tracks.map((track) => [track.id, track]));
  if (!command.id.trim()) errors.push('command id is required');
  if (command.type === 'remove-timeline-range') {
    if (!Number.isInteger(command.fromFrame) || !Number.isInteger(command.toFrame) || command.toFrame <= command.fromFrame) {
      errors.push('ripple range must contain positive integer frames');
    }
    const knownTracks = new Set(project.tracks.map((track) => track.id));
    for (const trackId of command.trackIds ?? []) if (!knownTracks.has(trackId)) errors.push(`track does not exist: ${trackId}`);
    const affectedTracks = command.trackIds ?? project.tracks.map((track) => track.id);
    for (const trackId of affectedTracks) if (trackById.get(trackId)?.locked) errors.push(`track is locked: ${trackId}`);
  }
  if (command.type === 'apply-cut-proposals') {
    const knownProposals = new Set(project.proposals.map((proposal) => proposal.id));
    if (command.proposalIds.length === 0) errors.push('at least one cut proposal is required');
    for (const proposalId of command.proposalIds) if (!knownProposals.has(proposalId)) errors.push(`cut proposal does not exist: ${proposalId}`);
    if (trackById.get('V1')?.locked) errors.push('track is locked: V1');
  }
  if (command.type === 'set-track-volume' && (!Number.isFinite(command.volumeDb) || command.volumeDb < -60 || command.volumeDb > 12)) {
    errors.push('track volume must be between -60dB and +12dB');
  }
  if (command.type === 'set-transition-all') {
    const required = requiredHandleFrames(command.transition.type);
    if (required > 0) {
      const videoItems = project.items
        .filter((item) => project.tracks.find((track) => track.id === item.trackId)?.kind === 'video')
        .sort((a, b) => a.startFrame - b.startFrame);
      for (let index = 0; index < videoItems.length - 1; index += 1) {
        const outgoing = videoItems[index];
        const incoming = videoItems[index + 1];
        if ((outgoing.source?.handleAfterFrames ?? 0) < required) errors.push(`item lacks ${required} outgoing handle frames: ${outgoing.id}`);
        if ((incoming.source?.handleBeforeFrames ?? 0) < required) errors.push(`item lacks ${required} incoming handle frames: ${incoming.id}`);
      }
    }
    for (const track of project.tracks) {
      if (track.kind === 'video' && track.locked) errors.push(`track is locked: ${track.id}`);
    }
  }
  if (command.type === 'set-track-volume' && trackById.get(command.trackId)?.locked) errors.push(`track is locked: ${command.trackId}`);
  return errors;
}

function applyOne(project: ProjectV2, command: EditorCommand): ProjectV2 {
  const errors = validateCommand(command, project);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (commandIds(project).has(command.id)) throw new Error(`command already applied: ${command.id}`);

  const next = cloneProject(project);
  switch (command.type) {
    case 'remove-timeline-range': {
      const trackIds = command.trackIds ? new Set(command.trackIds) : undefined;
      next.items = rippleDelete(next.items, command.fromFrame, command.toFrame, trackIds);
      break;
    }
    case 'apply-cut-proposals': {
      const selected = next.proposals.filter((proposal) => command.proposalIds.includes(proposal.id));
      next.clips = buildKeepClips(selected, next.durationSec);
      return syncProjectTimeline(next);
    }
    case 'set-subtitle-style':
      next.subtitleStyle = command.style;
      break;
    case 'set-transition-all':
      {
        const videoIds = next.items
          .filter((item) => next.tracks.find((track) => track.id === item.trackId)?.kind === 'video')
          .sort((a, b) => a.startFrame - b.startFrame)
          .map((item) => item.id);
        const lastVideoId = videoIds[videoIds.length - 1];
        next.items = next.items.map((item) => {
          if (next.tracks.find((track) => track.id === item.trackId)?.kind !== 'video') return item;
          return { ...item, transitionKind: item.id === lastVideoId ? undefined : command.transition.type };
        });
      }
      break;
    case 'set-track-volume': {
      const existing = next.audioChains.find((chain) => chain.trackId === command.trackId);
      if (existing) existing.volumeDb = command.volumeDb;
      else next.audioChains.push({ id: `chain-${command.trackId}`, trackId: command.trackId, enabled: true, volumeDb: command.volumeDb });
      break;
    }
    case 'set-voice-preset':
      next.voicePreset = command.preset;
      break;
  }
  next.appliedCommandIds = [...(next.appliedCommandIds ?? []), command.id];
  return next;
}

function diffProjects(before: ProjectV2, after: ProjectV2): CommandDiff {
  const beforeById = new Map(before.items.map((item) => [item.id, item]));
  const afterById = new Map(after.items.map((item) => [item.id, item]));
  const changedItemIds: string[] = [];
  const shiftedItemIds: string[] = [];
  for (const item of after.items) {
    const old = beforeById.get(item.id);
    if (!old) {
      changedItemIds.push(item.id);
      continue;
    }
    if (JSON.stringify(old) !== JSON.stringify(item)) changedItemIds.push(item.id);
    if (old.startFrame !== item.startFrame) shiftedItemIds.push(item.id);
  }
  const removedItemIds = before.items.filter((item) => !afterById.has(item.id)).map((item) => item.id);
  const changedFields: string[] = [];
  if (before.subtitleStyle !== after.subtitleStyle) changedFields.push('subtitleStyle');
  if (before.voicePreset !== after.voicePreset) changedFields.push('voicePreset');
  if (JSON.stringify(before.audioChains) !== JSON.stringify(after.audioChains)) changedFields.push('audioChains');
  return { changedItemIds, removedItemIds, shiftedItemIds, changedFields };
}

function validateProjectItems(project: ProjectV2): string[] {
  return project.items.flatMap((item) => validateTimelineItem(item, project.timebase).map((error) => `${item.id}: ${error}`));
}

export function simulateEditorCommands(project: ProjectV2, commands: EditorCommand[]): DryRunResult {
  const errors = validateProjectItems(project);
  const warnings: string[] = [];
  let simulated = cloneProject(project);
  const seen = new Set<string>();
  for (const command of commands) {
    if (seen.has(command.id) || commandIds(project).has(command.id)) {
      warnings.push(`command may be duplicated: ${command.id}`);
      continue;
    }
    seen.add(command.id);
    try {
      const previousCount = simulated.items.length;
      simulated = applyOne(simulated, command);
      if (command.type === 'remove-timeline-range') {
        const shifted = simulated.items.filter((item) => item.startFrame < command.fromFrame).length;
        const moved = simulated.items.filter((item) => item.startFrame >= command.fromFrame).length;
        warnings.push(`ripple affects ${moved} items after shifting an interval of ${command.toFrame - command.fromFrame} frames`);
        if (simulated.items.length !== previousCount) warnings.push(`${previousCount - simulated.items.length} items are removed or fully covered`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const diff = diffProjects(project, simulated);
  return { ok: errors.length === 0, requiresConfirmation: warnings.length > 0, project: simulated, diff, errors, warnings };
}

/** Applies only after a successful dry-run; persistence remains the caller's atomic save. */
export function applyEditorCommands(project: ProjectV2, commands: EditorCommand[]): ProjectV2 {
  const result = simulateEditorCommands(project, commands);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.project;
}

export function tracksAffectedByRipple(project: ProjectV2, command: Extract<EditorCommand, { type: 'remove-timeline-range' }>): Track[] {
  const ids = command.trackIds ? new Set(command.trackIds) : new Set(project.tracks.map((track) => track.id));
  return project.tracks.filter((track) => ids.has(track.id));
}
