/**
 * Surface-form cleanup only. This does not replace words, stem, or drop numbers or names.
 * The same function is safe to run twice.
 */
export function normalizeQuery(text: string): string {
  const collapsed = text
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = collapsed.replace(/^[?!,.;:'"]+/, "").replace(/[?!,.;:'"]+$/, "").trim();
  return stripped.length > 0 ? stripped : collapsed;
}

/** Text sent to the embedding model. Falls back to the trimmed question if cleanup removes everything. */
export function embeddingText(text: string): string {
  const normalized = normalizeQuery(text);
  if (normalized.length > 0) {
    return normalized;
  }
  return text.trim();
}
