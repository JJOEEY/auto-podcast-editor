function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) || 'video';
}

export function buildHashtags(projectName: string): [string, string, string, string] {
  const values = ['#podcast', `#${slug(projectName)}`, '#video', '#xuhuong'];
  const fallback = ['#shorts', '#tiktok'];
  const unique: string[] = [];
  for (const value of [...values, ...fallback]) {
    if (!unique.includes(value)) unique.push(value);
    if (unique.length === 4) break;
  }
  return unique as [string, string, string, string];
}
