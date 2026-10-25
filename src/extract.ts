import { splitLines } from "./tokens.js";

export interface ExcerptChunk {
  startLine: number; // 0-based, inclusive
  endLine: number; // 0-based, inclusive
  score: number;
  lines: string[];
}

export interface ExtractResult {
  text: string;
  chunks: ExcerptChunk[];
  matchedLines: number;
}

const ERROR_RE = /(error|fail(?:ure|ed)?|exception|traceback|assert|fatal|panic|e[0-9a-z]+(?:-[0-9a-z]+)?\b.*\b(?:code|error))/i;
const HEADING_RE = /^\s{0,3}#{1,6}\s+\S|^\s*[A-Z][A-Za-z0-9 _/-]{2,60}:\s*$/;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "when",
  "then", "than", "are", "was", "were", "been", "have", "has", "had",
]);

export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function scoreLine(line: string, terms: string[]): number {
  const lower = line.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) score += 3;
  }
  if (ERROR_RE.test(line)) score += 5;
  if (HEADING_RE.test(line)) score += 2;
  return score;
}

/**
 * Return the most relevant excerpts for a query: score every line, take
 * windows around scoring lines, merge overlaps, keep the top chunks by
 * score, and emit them in original document order.
 */
export function extractText(
  text: string,
  query: string,
  options: { windowLines?: number; maxChunks?: number } = {},
): ExtractResult {
  const windowLines = options.windowLines ?? 2;
  const maxChunks = options.maxChunks ?? 10;
  const lines = splitLines(text);
  const terms = queryTerms(query);
  const scores = lines.map((line) => scoreLine(line, terms));
  const windows: ExcerptChunk[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (scores[i] <= 0) continue;
    const start = Math.max(0, i - windowLines);
    const end = Math.min(lines.length - 1, i + windowLines);
    const last = windows[windows.length - 1];
    if (last && start <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, end);
      last.score += scores[i];
      last.lines = lines.slice(last.startLine, last.endLine + 1);
    } else {
      windows.push({
        startLine: start,
        endLine: end,
        score: scores[i],
        lines: lines.slice(start, end + 1),
      });
    }
  }
  const top = [...windows].sort((a, b) => b.score - a.score).slice(0, maxChunks);
  top.sort((a, b) => a.startLine - b.startLine);
  const out: string[] = [];
  let matchedLines = 0;
  for (const chunk of top) {
    out.push(...chunk.lines);
    matchedLines += chunk.lines.length;
  }
  return {
    text: out.join("\n") + (out.length > 0 ? "\n" : ""),
    chunks: top,
    matchedLines,
  };
}
