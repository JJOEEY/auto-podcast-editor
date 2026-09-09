export type SpawnFn = (cmd: string, args: string[]) => { stdout: string };

export function buildProbeArgs(input: string): string[] {
  return ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', input];
}

export function buildAudioExtractArgs(input: string, outputWav: string): string[] {
  return ['-y', '-i', input, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputWav];
}

export function buildPeaksArgs(input: string): string[] {
  return ['-v', 'error', '-i', input, '-ar', '8000', '-ac', '1', '-f', 's16le', '-'];
}

export async function runFfprobe(input: string, spawn: SpawnFn): Promise<number> {
  const { stdout } = spawn('ffprobe', buildProbeArgs(input));
  const match = stdout.match(/^duration=(.+)$/m);
  if (!match) throw new Error('ffprobe: duration not found');
  const value = Number(match[1].trim());
  if (!Number.isFinite(value)) throw new Error(`ffprobe: invalid duration: ${match[1].trim()}`);
  return value;
}

export type SpawnBinaryFn = (cmd: string, args: string[]) => Uint8Array;

export function runPeaks(input: string, spawn: SpawnBinaryFn): Int16Array {
  const raw = spawn('ffmpeg', buildPeaksArgs(input));
  const usable = raw.byteLength - (raw.byteLength % 2);
  const copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + usable);
  return new Int16Array(copy);
}
