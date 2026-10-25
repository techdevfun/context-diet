import { splitLines } from "./tokens.js";

export interface DedupeResult {
  text: string;
  keptLines: number;
  removedDuplicateLines: number;
  removedDuplicateBlocks: number;
  /** Total lines removed via block removal (blocks * their lengths). */
  removedBlockLines: number;
}

/**
 * Remove repeated multi-line blocks first (length 3..8, later occurrences
 * removed as whole blocks), then exact duplicate lines (keep first
 * occurrence, preserve order). Block-first ordering keeps the manifest
 * honest: a repeated 5-line chunk counts as 1 block (5 lines), not as
 * 5 unrelated duplicate lines.
 */
export function dedupeText(text: string): DedupeResult {
  const lines = splitLines(text);
  // Repeated blocks: scan from longest to shortest so a long repeated
  // block is removed as one block, not as several short ones.
  let removedDuplicateBlocks = 0;
  let removedBlockLines = 0;
  let current = lines;
  for (let blockLen = 8; blockLen >= 3; blockLen--) {
    const seenBlocks = new Set<string>();
    const out: string[] = [];
    let i = 0;
    while (i < current.length) {
      if (i + blockLen <= current.length) {
        const key = current.slice(i, i + blockLen).join("\n");
        if (seenBlocks.has(key)) {
          removedDuplicateBlocks++;
          removedBlockLines += blockLen;
          i += blockLen;
          continue;
        }
        seenBlocks.add(key);
      }
      out.push(current[i]);
      i++;
    }
    current = out;
  }
  const seenLines = new Set<string>();
  const kept: string[] = [];
  let removedDuplicateLines = 0;
  for (const line of current) {
    if (seenLines.has(line)) {
      removedDuplicateLines++;
      continue;
    }
    seenLines.add(line);
    kept.push(line);
  }
  return {
    text: kept.join("\n") + (kept.length > 0 ? "\n" : ""),
    keptLines: kept.length,
    removedDuplicateLines,
    removedDuplicateBlocks,
    removedBlockLines,
  };
}
