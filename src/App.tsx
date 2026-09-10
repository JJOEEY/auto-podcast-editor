import { useReducer } from 'react';
import { createDefaultSettings } from '../core/defaults.js';
import { createState, reduce } from './state/reducer.js';
import { Timeline } from './components/Timeline.js';

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(
    reduce,
    createState({ name: 'untitled', sourcePath: '', durationSec: 0, preset: 'vertical', settings: createDefaultSettings() }),
  );
  return (
    <div>
      <h1>Auto Podcast Editor (MVP)</h1>
      <Timeline
        clips={state.present.clips}
        onSplit={(id) => dispatch({ type: 'split-clip', id, at: state.present.clips.find((c) => c.id === id)!.start + 1 })}
        onDelete={(id) => dispatch({ type: 'delete-clip', id })}
      />
    </div>
  );
}
