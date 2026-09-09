export function buildWhisperArgs(modelPath: string, audioWav: string, outBase: string): string[] {
  return [
    '-m', modelPath, '-l', 'vi', '-f', audioWav,
    '--max-len', '1', '--print-progress', '--output-json', '--output-file', outBase,
  ];
}

export function whisperJsonPath(outBase: string): string {
  return `${outBase}.json`;
}

export function parseProgressLine(line: string): number | null {
  const match = line.match(/progress\s*=\s*(\d{1,3})%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}
