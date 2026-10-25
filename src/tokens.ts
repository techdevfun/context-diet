/**
 * Token accounting for Context Diet.
 *
 * Honesty contract: lines and bytes are EXACT. Token counts are ESTIMATES
 * produced by a documented rule of thumb (about 4 characters per token for
 * English text and source code) and are always labeled "estimated" in every
 * output. Never quote an estimated token count as if it were measured by
 * a real tokenizer.
 */

export interface TextCounts {
  lines: number;
  bytes: number;
  /** Estimated tokens (chars/4 rule). Always an estimate, never exact. */
  estTokens: number;
}

export function splitLines(text: string): string[] {
  if (text === "") return [];
  const parts = text.split("\n");
  // A trailing newline terminates the last line; it is not an extra line.
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

export function countBytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Documented estimator: ceil(chars / 4). See module docstring. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countText(text: string): TextCounts {
  return {
    lines: splitLines(text).length,
    bytes: countBytes(text),
    estTokens: estimateTokens(text),
  };
}

/** Strip ANSI escape sequences (terminal color/control codes). */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}
