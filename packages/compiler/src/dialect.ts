import type {
  ConditionalBranch,
  ConditionalNode,
  ForNode,
  Node,
  RootNode
} from "./ast.ts";
import type { Diagnostic, DiagnosticSeverity, SourceSpan } from "./diagnostics.ts";
import type {
  CollieDiagnosticLevel,
  NormalizedCollieDialectOptions,
  NormalizedCollieDialectTokenRule
} from "@collie-lang/config";

interface TokenOccurrence {
  kind: "if" | "elseIf" | "else" | "for" | "id";
  token: string;
  span?: SourceSpan;
}

export function enforceDialect(
  root: RootNode,
  config: NormalizedCollieDialectOptions
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (root.idToken) {
    diagnostics.push(
      ...evaluateToken(
        { kind: "id", token: root.idToken, span: root.idTokenSpan },
        config.tokens.id
      )
    );
  }

  walkNodes(root.children, (occurrence) => {
    const rule = config.tokens[occurrence.kind];
    diagnostics.push(...evaluateToken(occurrence, rule));
  });

  return diagnostics;
}

function walkNodes(nodes: Node[], onToken: (occurrence: TokenOccurrence) => void): void {
  for (const node of nodes) {
    if (node.type === "For") {
      onFor(node, onToken);
      walkNodes(node.body, onToken);
      continue;
    }
    if (node.type === "Conditional") {
      onConditional(node, onToken);
      continue;
    }
    if (node.type === "Element" || node.type === "Component") {
      walkNodes(node.children, onToken);
      if (node.type === "Component" && node.slots) {
        for (const slot of node.slots) {
          walkNodes(slot.children, onToken);
        }
      }
      continue;
    }
  }
}

function onFor(node: ForNode, onToken: (occurrence: TokenOccurrence) => void): void {
  if (!node.token) {
    return;
  }
  onToken({ kind: "for", token: node.token, span: node.tokenSpan });
}

function onConditional(
  node: ConditionalNode,
  onToken: (occurrence: TokenOccurrence) => void
): void {
  for (const branch of node.branches) {
    onBranch(branch, onToken);
    walkNodes(branch.body, onToken);
  }
}

function onBranch(
  branch: ConditionalBranch,
  onToken: (occurrence: TokenOccurrence) => void
): void {
  if (!branch.token || !branch.kind) {
    return;
  }
  onToken({ kind: branch.kind, token: branch.token, span: branch.tokenSpan });
}

function evaluateToken(
  occurrence: TokenOccurrence,
  rule: NormalizedCollieDialectTokenRule
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const used = occurrence.token;
  const preferred = rule.preferred;
  const isAllowed = rule.allow.includes(used);

  if (!isAllowed) {
    const severity = levelToSeverity(rule.onDisallowed);
    if (severity) {
      diagnostics.push(
        createDialectDiagnostic(
          "dialect.token.disallowed",
          severity,
          used,
          preferred,
          occurrence.span,
          `Token "${used}" is not allowed for ${occurrence.kind}. Preferred: "${preferred}".`
        )
      );
    }
    return diagnostics;
  }

  if (used !== preferred) {
    const severity = levelToSeverity(rule.onDisallowed);
    if (severity) {
      diagnostics.push(
        createDialectDiagnostic(
          "dialect.token.nonPreferred",
          severity,
          used,
          preferred,
          occurrence.span,
          `Token "${used}" is allowed but not preferred for ${occurrence.kind}. Preferred: "${preferred}".`
        )
      );
    }
  }

  return diagnostics;
}

function createDialectDiagnostic(
  code: "dialect.token.disallowed" | "dialect.token.nonPreferred",
  severity: DiagnosticSeverity,
  used: string,
  preferred: string,
  span: SourceSpan | undefined,
  message: string
): Diagnostic {
  const fix = span
    ? {
        range: span,
        replacementText: preferred
      }
    : undefined;

  return {
    severity,
    code,
    message: message.replace(/\\s+/g, " "),
    span,
    fix
  };
}

function levelToSeverity(level: CollieDiagnosticLevel): DiagnosticSeverity | null {
  if (level === "off") {
    return null;
  }
  if (level === "error") {
    return "error";
  }
  return "warning";
}
