// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from '../src/components/Timeline.js';
import type { Clip } from '../core/types.js';

const clips: Clip[] = [
  { id: 'k1', track: 'V1', start: 0, end: 10, label: 'keep 1' },
  { id: 'k2', track: 'V1', start: 20, end: 30, label: 'keep 2' },
];

describe('Timeline', () => {
  it('renders one block per clip and splits on button click', async () => {
    const onSplit = vi.fn();
    const { container } = render(<Timeline clips={clips} tracks={[{ id: 'V1', kind: 'video', name: 'Video 1', index: 0 }, { id: 'A1', kind: 'audio', name: 'Voice', index: 1 }]} onSplit={onSplit} onDelete={() => undefined} />);
    expect(container.querySelectorAll('[data-clip]').length).toBe(2);
    expect(container.querySelector('[data-track-row="A1"]')).not.toBeNull();
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByTestId('split-k1'));
    expect(onSplit).toHaveBeenCalledWith('k1');
  });

  it('exposes track reassignment and ripple controls', async () => {
    const onTrackChange = vi.fn();
    const onRippleDelete = vi.fn();
    const { fireEvent } = await import('@testing-library/react');
    render(<Timeline clips={clips} tracks={[{ id: 'V1', kind: 'video', name: 'Video 1', index: 0 }, { id: 'A1', kind: 'audio', name: 'Voice', index: 1 }]} onTrackChange={onTrackChange} onRippleDelete={onRippleDelete} onSplit={() => undefined} onDelete={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Track k1'), { target: { value: 'A1' } });
    fireEvent.click(screen.getByTestId('ripple-k1'));
    expect(onTrackChange).toHaveBeenCalledWith('k1', 'A1');
    expect(onRippleDelete).toHaveBeenCalledWith('k1');
  });

  it('renders draggable trim handles and track visibility controls', () => {
    const { container } = render(<Timeline clips={clips} tracks={[{ id: 'V1', kind: 'video', name: 'Video 1', index: 0, hidden: false }, { id: 'A1', kind: 'audio', name: 'Voice', index: 1 }]} onTrackMuted={() => undefined} onTrackHidden={() => undefined} onSplit={() => undefined} onDelete={() => undefined} />);
    expect(container.querySelector('[data-testid="trim-handle-start-k1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="trim-handle-end-k1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hide-track-V1"]')).not.toBeNull();
  });
});
