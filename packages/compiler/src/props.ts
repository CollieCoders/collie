import type {
  Attribute,
  ConditionalNode,
  ElementNode,
  ComponentNode,
  ForNode,
  Node,
  PropsField,
  RootNode,
  TextNode
} from "./ast";
import type { Diagnostic, DiagnosticSeverity, SourceSpan } from "./diagnostics";
import type { CollieDiagnosticLevel, NormalizedCollieDialectPropsOptions } from "@collie-lang/config";

interface UsageOccurrence {
  name: string;
  kind: "local" | "namespace";
  index: number;
  length: number;
}

interface UsageTracker {
  span?: SourceSpan;
  count: number;
}

const IGNORED_IDENTIFIERS = new Set([
  "null",
  "undefined",
  "true",
  "false",
  "NaN",
  "Infinity",
  "this",
  "props"
]);

const RESERVED_KEYWORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);

export function enforceProps(
  root: RootNode,
  propsConfig: NormalizedCollieDialectPropsOptions
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declaredProps = new Map<string, PropsField>();
  const usedLocal = new Map<string, UsageTracker>();
  const usedNamespace = new Map<string, UsageTracker>();
  const usedAny = new Set<string>();
  const missingReported = new Set<string>();
  const localStyleReported = new Set<string>();
  const namespaceStyleReported = new Set<string>();

  if (root.props?.fields) {
    for (const field of root.props.fields) {
      declaredProps.set(field.name, field);
    }
  }

  const preferStyle = propsConfig.preferAccessStyle;
  const flagLocalStyle = !propsConfig.allowDeclaredLocals || preferStyle === "namespace";
  const flagNamespaceStyle = !propsConfig.allowPropsNamespace || preferStyle === "locals";

  const walkNodes = (nodes: Node[], locals: Set<string>): void => {
    for (const node of nodes) {
      if (node.type === "Conditional") {
        handleConditional(node, locals);
        continue;
      }
      if (node.type === "For") {
        handleFor(node, locals);
        continue;
      }
      if (node.type === "Expression") {
        handleExpression(node.value, node.span, locals);
        continue;
      }
      if (node.type === "JSXPassthrough") {
        handleExpression(node.expression, node.span, locals);
        continue;
      }
      if (node.type === "Text") {
        handleText(node.parts, locals);
        continue;
      }
      if (node.type === "Element") {
        handleElement(node, locals);
        continue;
      }
      if (node.type === "Component") {
        handleComponent(node, locals);
        continue;
      }
    }
  };

  const handleConditional = (node: ConditionalNode, locals: Set<string>): void => {
    for (const branch of node.branches) {
      if (branch.test) {
        handleExpression(branch.test, branch.testSpan, locals);
      }
      walkNodes(branch.body, locals);
    }
  };

  const handleFor = (node: ForNode, locals: Set<string>): void => {
    handleExpression(node.arrayExpr, node.arrayExprSpan, locals);
    const nextLocals = new Set(locals);
    nextLocals.add(node.itemName);
    walkNodes(node.body, nextLocals);
  };

  const handleElement = (node: ElementNode, locals: Set<string>): void => {
    if (node.guard) {
      handleExpression(node.guard, node.guardSpan, locals);
    }
    handleAttributes(node.attributes, locals);
    walkNodes(node.children, locals);
  };

  const handleComponent = (node: ComponentNode, locals: Set<string>): void => {
    if (node.guard) {
      handleExpression(node.guard, node.guardSpan, locals);
    }
    handleAttributes(node.attributes, locals);
    if (node.slots) {
      for (const slot of node.slots) {
        walkNodes(slot.children, locals);
      }
    }
    walkNodes(node.children, locals);
  };

  const handleText = (parts: TextNode["parts"], locals: Set<string>): void => {
    for (const part of parts) {
      if (part.type === "expr") {
        handleExpression(part.value, part.span, locals);
      }
    }
  };

  const handleAttributes = (attributes: Attribute[], locals: Set<string>): void => {
    for (const attr of attributes) {
      if (!attr.value) continue;
      const trimmed = attr.value.trim();
      if (!trimmed || trimmed.startsWith("'") || trimmed.startsWith("\"")) {
        continue;
      }
      handleExpression(trimmed, undefined, locals);
    }
  };

  const handleExpression = (
    expression: string,
    span: SourceSpan | undefined,
    locals: Set<string>
  ): void => {
    const occurrences = scanExpression(expression);
    for (const occurrence of occurrences) {
      const name = occurrence.name;
      if (occurrence.kind === "local" && locals.has(name)) {
        continue;
      }
      if (shouldIgnoreIdentifier(name)) {
        continue;
      }
      const usageSpan = span ? offsetSpan(span, occurrence.index, occurrence.length) : undefined;
      if (occurrence.kind === "namespace") {
        recordUsage(usedNamespace, name, usageSpan);
        usedAny.add(name);
        if (flagNamespaceStyle && !namespaceStyleReported.has(name)) {
          const severity = levelToSeverity(propsConfig.diagnostics.style);
          if (severity) {
            diagnostics.push(
              createStyleDiagnostic(
                name,
                "namespace",
                severity,
                usageSpan,
                propsConfig.allowPropsNamespace
              )
            );
            namespaceStyleReported.add(name);
          }
        }
        continue;
      }

      recordUsage(usedLocal, name, usageSpan);
      usedAny.add(name);
      if (
        propsConfig.requireDeclarationForLocals &&
        !declaredProps.has(name) &&
        !missingReported.has(name)
      ) {
        const severity = levelToSeverity(propsConfig.diagnostics.missingDeclaration);
        if (severity) {
          diagnostics.push(createMissingDeclarationDiagnostic(name, severity, usageSpan));
          missingReported.add(name);
        }
      }

      if (flagLocalStyle && !localStyleReported.has(name)) {
        const severity = levelToSeverity(propsConfig.diagnostics.style);
        if (severity) {
          diagnostics.push(
            createStyleDiagnostic(name, "local", severity, usageSpan, propsConfig.allowDeclaredLocals)
          );
          localStyleReported.add(name);
        }
      }
    }
  };

  walkNodes(root.children, new Set());

  if (root.props?.fields) {
    for (const field of root.props.fields) {
      if (!usedAny.has(field.name)) {
        const severity = levelToSeverity(propsConfig.diagnostics.unusedDeclaration);
        if (severity) {
          diagnostics.push({
            severity,
            code: "props.unusedDeclaration",
            message: `Prop "${field.name}" is declared but never used.`,
            span: field.span
          });
        }
      }
    }
  }

  if (
    propsConfig.requirePropsBlockWhen.enabled &&
    !root.props &&
    usedAny.size >= propsConfig.requirePropsBlockWhen.minUniquePropsUsed
  ) {
    const severity = levelToSeverity(propsConfig.requirePropsBlockWhen.severity);
    if (severity) {
      diagnostics.push({
        severity,
        code: "props.block.recommendedOrRequired",
        message: `Props block recommended: ${usedAny.size} unique prop${usedAny.size === 1 ? "" : "s"} used.`
      });
    }
  }

  return diagnostics;
}

function createMissingDeclarationDiagnostic(
  name: string,
  severity: DiagnosticSeverity,
  span?: SourceSpan
): Diagnostic {
  return {
    severity,
    code: "props.missingDeclaration",
    message: `Prop "${name}" is used without a props declaration.`,
    span,
    data: {
      kind: "addPropDeclaration",
      propName: name
    }
  };
}

function createStyleDiagnostic(
  name: string,
  kind: "local" | "namespace",
  severity: DiagnosticSeverity,
  span: SourceSpan | undefined,
  allowed: boolean
): Diagnostic {
  if (kind === "namespace") {
    const message = allowed
      ? `props.${name} is allowed but not preferred; use "${name}" instead.`
      : `props.${name} is disabled; use "${name}" instead.`;
    return {
      severity,
      code: "props.style.nonPreferred",
      message,
      span
    };
  }

  const message = allowed
    ? `"${name}" is allowed but not preferred; use props.${name} instead.`
    : `"${name}" is disabled; use props.${name} instead.`;

  return {
    severity,
    code: "props.style.nonPreferred",
    message,
    span
  };
}

function recordUsage(map: Map<string, UsageTracker>, name: string, span?: SourceSpan): void {
  const existing = map.get(name);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(name, { count: 1, span });
}

function scanExpression(expression: string): UsageOccurrence[] {
  const occurrences: UsageOccurrence[] = [];
  let i = 0;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";

  while (i < expression.length) {
    const ch = expression[i];

    if (state === "code") {
      if (ch === "'" || ch === "\"") {
        state = ch === "'" ? "single" : "double";
        i++;
        continue;
      }
      if (ch === "`") {
        state = "template";
        i++;
        continue;
      }
      if (ch === "/" && expression[i + 1] === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (ch === "/" && expression[i + 1] === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (isIdentifierStart(ch)) {
        const start = i;
        i++;
        while (i < expression.length && isIdentifierPart(expression[i])) {
          i++;
        }
        const name = expression.slice(start, i);
        if (name === "props") {
          const namespace = readNamespaceAccess(expression, i);
          if (namespace) {
            occurrences.push({
              name: namespace.name,
              kind: "namespace",
              index: namespace.index,
              length: namespace.name.length
            });
            i = namespace.endIndex;
            continue;
          }
        }
        const prevNonSpace = findPreviousNonSpace(expression, start - 1);
        if (prevNonSpace !== ".") {
          occurrences.push({ name, kind: "local", index: start, length: name.length });
        }
        continue;
      }
      i++;
      continue;
    }

    if (state === "line") {
      if (ch === "\n") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (ch === "*" && expression[i + 1] === "/") {
        state = "code";
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (state === "single") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "double") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "\"") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "template") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        state = "code";
        i++;
        continue;
      }
      i++;
      continue;
    }
  }

  return occurrences;
}

function readNamespaceAccess(
  expression: string,
  startIndex: number
): { name: string; index: number; endIndex: number } | null {
  let i = startIndex;
  while (i < expression.length && /\s/.test(expression[i])) {
    i++;
  }
  if (expression[i] === "?") {
    if (expression[i + 1] !== ".") {
      return null;
    }
    i += 2;
  } else if (expression[i] === ".") {
    i++;
  } else {
    return null;
  }
  while (i < expression.length && /\s/.test(expression[i])) {
    i++;
  }
  if (!isIdentifierStart(expression[i])) {
    return null;
  }
  const propStart = i;
  i++;
  while (i < expression.length && isIdentifierPart(expression[i])) {
    i++;
  }
  return {
    name: expression.slice(propStart, i),
    index: propStart,
    endIndex: i
  };
}

function findPreviousNonSpace(text: string, index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const ch = text[i];
    if (!/\s/.test(ch)) {
      return ch;
    }
  }
  return null;
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function shouldIgnoreIdentifier(name: string): boolean {
  return IGNORED_IDENTIFIERS.has(name) || RESERVED_KEYWORDS.has(name);
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

function offsetSpan(base: SourceSpan, index: number, length: number): SourceSpan {
  const startOffset = base.start.offset + index;
  const startCol = base.start.col + index;
  return {
    start: {
      line: base.start.line,
      col: startCol,
      offset: startOffset
    },
    end: {
      line: base.start.line,
      col: startCol + length,
      offset: startOffset + length
    }
  };
}
