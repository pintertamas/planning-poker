const PATTERN = /https?:\/\/linear\.app\/[^\s/]+\/issue\/([A-Za-z][A-Za-z0-9]*-\d+)\S*|https?:\/\/\S+|\b([A-Za-z][A-Za-z0-9]*-\d+)\b/g;

export function parseRefs(input: string): string[] {
  const seen = new Set<string>();
  for (const match of input.matchAll(PATTERN)) {
    const ref = (match[1] ?? match[2])?.toUpperCase();
    if (ref) seen.add(ref);
  }
  return [...seen];
}
