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
    const { container } = render(<Timeline clips={clips} onSplit={onSplit} onDelete={() => undefined} />);
    expect(container.querySelectorAll('[data-clip]').length).toBe(2);
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByTestId('split-k1'));
    expect(onSplit).toHaveBeenCalledWith('k1');
  });
});
