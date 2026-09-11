import type { EditCommand } from './commandParser.js';
import type { EditorCommand, ProjectV2 } from './types.js';

/** Converts the current rule-based parser output into the validated command contract. */
export function toEditorCommands(parsed: EditCommand[], project: ProjectV2, idPrefix = 'ai'): EditorCommand[] {
  return parsed.flatMap((command, index): EditorCommand[] => {
    const id = `${idPrefix}-${index + 1}-${command.type}`;
    switch (command.type) {
      case 'remove-silence': {
        const proposalIds = project.proposals
          .filter((proposal) => proposal.kind === 'silence' || proposal.kind === 'filler')
          .map((proposal) => proposal.id);
        return proposalIds.length > 0 ? [{ id, type: 'apply-cut-proposals', proposalIds }] : [];
      }
      case 'subtitle-style':
        return [{ id, type: 'set-subtitle-style', style: command.style }];
      case 'transition-style':
        return [{ id, type: 'set-transition-all', transition: { type: command.transition, durationFrames: 12 } }];
      case 'voice-preset':
        return [{ id, type: 'set-voice-preset', preset: command.preset }];
    }
  });
}
