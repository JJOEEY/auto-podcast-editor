export function buildWhisperArgs(modelPath: string, audioWav: string, outJson: string): string[] {
  return ['-m', modelPath, '-l', 'vi', '-f', audioWav, '--output-json', '--max-len', '1', '-oj', outJson];
}

export function parseProgressLine(line: string): number | null {
  const match = line.match(/progress\s*=\s*(\d{1,3})%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}
