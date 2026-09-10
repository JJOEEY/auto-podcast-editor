export function assertMeaningfulPath(value: string, name: string): void {
  if (!value || !value.trim()) throw new Error(`${name} must be a non-empty path`);
}
