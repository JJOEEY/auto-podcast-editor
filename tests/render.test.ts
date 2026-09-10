import { describe, expect, it } from 'vitest';
import { buildRemotionRenderArgs, buildRenderOutputs, checkSpawn } from '../electron/render.js';

describe('buildRenderOutputs', () => {
  it('derives output paths from project path and preset', () => {
    const out = buildRenderOutputs('C:/work/ep1.ape.json', 'vertical');
    expect(out.mp4).toContain('vertical.mp4');
    expect(out.srt.endsWith('captions.srt')).toBe(true);
    expect(out.captionTxt.endsWith('caption.txt')).toBe(true);
    expect(out.thumb.endsWith('thumb.png')).toBe(true);
  });
});

describe('buildRemotionRenderArgs', () => {
  it('renders the vertical composition with a props file', () => {
    expect(buildRemotionRenderArgs('PodcastVertical', 'C:/work/ep1/vertical.mp4', 'C:/work/ep1/props.json')).toEqual([
      'remotion', 'render', 'PodcastVertical', 'C:/work/ep1/vertical.mp4', '--props', 'C:/work/ep1/props.json',
    ]);
  });
});

describe('checkSpawn', () => {
  it('passes on status 0', () => {
    expect(() => checkSpawn('ffmpeg', { status: 0 })).not.toThrow();
  });

  it('throws on spawn error and non-zero exit', () => {
    expect(() => checkSpawn('ffmpeg', { status: null, error: new Error('ENOENT') })).toThrow('ENOENT');
    expect(() => checkSpawn('ffmpeg', { status: 1 })).toThrow('ffmpeg exited with code 1');
  });
});
