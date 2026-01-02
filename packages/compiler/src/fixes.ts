import type { Diagnostic, DiagnosticFix, SourceSpan } from "./diagnostics";

interface FixWithOffsets {
  fix: DiagnosticFix;
  start: number;
  end: number;
}

interface FixApplyResult {
  text: string;
  applied: DiagnosticFix[];
  skipped: DiagnosticFix[];
}

export function applyFixes(sourceText: string, fixes: DiagnosticFix[]): FixApplyResult {
  const normalized: FixWithOffsets[] = [];
  const skipped: DiagnosticFix[] = [];

  for (const fix of fixes) {
    const offsets = getSpanOffsets(fix.range);
    if (!offsets) {
      skipped.push(fix);
      continue;
    }
    if (offsets.start < 0 || offsets.end < offsets.start || offsets.end > sourceText.length) {
      skipped.push(fix);
      continue;
    }
    normalized.push({ fix, start: offsets.start, end: offsets.end });
  }

  normalized.sort((a, b) => (a.start === b.start ? a.end - b.end : a.start - b.start));

  const accepted: FixWithOffsets[] = [];
  let currentEnd = -1;
  for (const item of normalized) {
    if (item.start < currentEnd) {
      skipped.push(item.fix);
      continue;
    }
    accepted.push(item);
    currentEnd = item.end;
  }

  let text = sourceText;
  for (let i = accepted.length - 1; i >= 0; i--) {
    const { start, end, fix } = accepted[i];
    text = `${text.slice(0, start)}${fix.replacementText}${text.slice(end)}`;
  }

  return { text, applied: accepted.map((item) => item.fix), skipped };
}

export function fixAllFromDiagnostics(
  sourceText: string,
  diagnostics: Diagnostic[]
): FixApplyResult {
  const fixes = diagnostics.flatMap((diag) => (diag.fix ? [diag.fix] : []));
  return applyFixes(sourceText, fixes);
}

function getSpanOffsets(span: SourceSpan | undefined): { start: number; end: number } | null {
  if (!span) {
    return null;
  }
  const start = span.start?.offset;
  const end = span.end?.offset;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return { start, end };
}
