export type SpawnFn = (cmd: string, args: string[]) => { stdout: string };

export function buildProbeArgs(input: string): string[] {
  return ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', input];
}

export function buildAudioExtractArgs(input: string, outputWav: string): string[] {
  return ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputWav];
}

export function buildPeaksArgs(input: string): string[] {
  return ['-v', 'error', '-i', input, '-ar', '8000', '-ac', '1', '-f', 's16le', '-'];
}

export async function runFfprobe(input: string, spawn: SpawnFn): Promise<number> {
  const { stdout } = spawn('ffprobe', buildProbeArgs(input));
  const match = stdout.match(/duration=([\d.]+)/);
  if (!match) throw new Error('ffprobe: duration not found');
  return Number(match[1]);
}
