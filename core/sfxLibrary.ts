export interface SfxAsset {
  id: string;
  name: string;
  path: string;
  category: string;
  duration: number;
  license: string;
  source: string;
}

export function makeSfxClip(asset: SfxAsset, start = 0): { id: string; path: string; start: number; duration: number; volume: number; category: string; trackId: string } {
  return {
    id: `sfx-${asset.id}-${Math.round(start * 1000)}`,
    path: asset.path,
    start,
    duration: Math.max(0.1, asset.duration || 1),
    volume: 0.75,
    category: asset.category,
    trackId: 'A3',
  };
}
