import pc from "picocolors";
import type { Diagnostic } from "@collie-lang/compiler";

type SummaryKind = "success" | "error" | "warning";

const SUMMARY_STYLES: Record<SummaryKind, { icon: string; color: (text: string) => string }> = {
  success: { icon: "✔", color: pc.green },
  warning: { icon: "⚠", color: pc.yellow },
  error: { icon: "✖", color: pc.red }
};

export function printSummary(kind: SummaryKind, message: string, detail?: string, nextStep?: string): void {
  const style = SUMMARY_STYLES[kind];
  console.log(style.color(`${style.icon} ${message}`));
  if (detail) {
    console.log(pc.dim(`Changed: ${detail}`));
  }
  if (nextStep) {
    console.log(pc.dim(`Next: ${nextStep}`));
  }
}

export function formatDiagnosticLine(diag: Diagnostic, fallbackFile?: string): string {
  const fileLabel = diag.filePath ?? diag.file ?? fallbackFile ?? "<unknown>";
  const range = diag.range ?? diag.span;
  const location = range ? `${fileLabel}:${range.start.line}:${range.start.col}` : fileLabel;
  const code = diag.code ? ` (${diag.code})` : "";
  return `${location}: ${diag.severity}${code}: ${diag.message}`;
}
