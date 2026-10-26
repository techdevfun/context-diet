import { splitLines } from "./tokens.js";

export interface DedupeOptions {
  /**
   * When true, only byte-identical lines/blocks are treated as
   * duplicates. Default (false) also collapses near-duplicates: lines
   * that differ only in 0x-prefixed memory addresses.
   */
  exactOnly?: boolean;
}

export interface DedupeResult {
  text: string;
  keptLines: number;
  removedDuplicateLines: number;
  removedDuplicateBlocks: number;
  /** Total lines removed via block removal (blocks * their lengths). */
  removedBlockLines: number;
  /** Lines removed because they matched an earlier line modulo 0x addresses. */
  removedNearDuplicateLines: number;
  /** Blocks removed because they matched an earlier block modulo 0x addresses. */
  removedNearDuplicateBlocks: number;
  /** Total lines removed via near-duplicate block removal. */
  removedNearBlockLines: number;
}

/**
 * Mask only 0x-prefixed hex tokens (memory addresses as printed by
 * native stack traces). Deliberate boundary: bare hex without a 0x
 * prefix (hashes, request IDs) is left untouched, because it may be a
 * meaningful identifier rather than an address. Timestamps and PIDs are
 * also left exact: they often carry ordering or identity meaning, and
 * no commenter confirmed them for the mask list.
 */
const ADDRESS_RE = /0[xX][0-9a-fA-F]+/g;

function normalizeKey(line: string): string {
  return line.replace(ADDRESS_RE, "0x<addr>");
}

/**
 * Remove repeated multi-line blocks first (length 3..8, later occurrences
 * removed as whole blocks), then duplicate lines (keep first occurrence,
 * preserve order). Block-first ordering keeps the manifest honest: a
 * repeated 5-line chunk counts as 1 block (5 lines), not as 5 unrelated
 * duplicate lines.
 *
 * By default, comparison keys mask 0x memory addresses, so repeated
 * stack traces that differ only by address collapse as near-duplicates.
 * The kept text is always the ORIGINAL first occurrence, verbatim —
 * normalization never rewrites output, it only decides what counts as
 * "the same" for comparison. Near-duplicate removals are counted
 * separately from exact ones, so a reader can tell them apart: a removal
 * is "near" exactly when the removed text differs byte-for-byte from
 * the kept first occurrence (i.e. only the masked addresses differ).
 *
 * This is a text-equality approximation, NOT proof that two failures
 * share a fix: the tool matches normalized text, it cannot know fixes.
 * The first occurrence keeps its location; later near-duplicate
 * locations are counted in the manifest, not kept.
 */
export function dedupeText(text: string, options: DedupeOptions = {}): DedupeResult {
  const exactOnly = options.exactOnly ?? false;
  const keyOf = (line: string): string => (exactOnly ? line : normalizeKey(line));
  const lines = splitLines(text);
  // Repeated blocks: scan from longest to shortest so a long repeated
  // block is removed as one block, not as several short ones.
  // Map from comparison key to the exact text of the first occurrence,
  // so exact vs near can be told apart (near = same key, different bytes).
  let removedDuplicateBlocks = 0;
  let removedBlockLines = 0;
  let removedNearDuplicateBlocks = 0;
  let removedNearBlockLines = 0;
  let current = lines;
  for (let blockLen = 8; blockLen >= 3; blockLen--) {
    const seenBlocks = new Map<string, string>();
    const out: string[] = [];
    let i = 0;
    while (i < current.length) {
      if (i + blockLen <= current.length) {
        const block = current.slice(i, i + blockLen);
        const key = block.map(keyOf).join("\n");
        const exact = block.join("\n");
        if (seenBlocks.has(key)) {
          if (!exactOnly && seenBlocks.get(key) !== exact) {
            removedNearDuplicateBlocks++;
            removedNearBlockLines += blockLen;
          } else {
            removedDuplicateBlocks++;
            removedBlockLines += blockLen;
          }
          i += blockLen;
          continue;
        }
        seenBlocks.set(key, exact);
      }
      out.push(current[i]);
      i++;
    }
    current = out;
  }
  const seenLines = new Map<string, string>();
  const kept: string[] = [];
  let removedDuplicateLines = 0;
  let removedNearDuplicateLines = 0;
  for (const line of current) {
    const key = keyOf(line);
    if (seenLines.has(key)) {
      if (!exactOnly && seenLines.get(key) !== line) {
        removedNearDuplicateLines++;
      } else {
        removedDuplicateLines++;
      }
      continue;
    }
    seenLines.set(key, line);
    kept.push(line);
  }
  return {
    text: kept.join("\n") + (kept.length > 0 ? "\n" : ""),
    keptLines: kept.length,
    removedDuplicateLines,
    removedDuplicateBlocks,
    removedBlockLines,
    removedNearDuplicateLines,
    removedNearDuplicateBlocks,
    removedNearBlockLines,
  };
}
