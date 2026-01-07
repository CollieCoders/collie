import type {
  Attribute,
  ClassAliasesDecl,
  Node,
  PropsDecl,
  RootNode,
  TextNode,
  TextPart
} from "./ast.ts";
import type { Diagnostic } from "./diagnostics.ts";
import { parse } from "./parser.ts";
import type { TemplateUnit } from "./parser.ts";

export interface FormatOptions {
  indent?: number;
}

export interface FormatResult {
  formatted: string;
  diagnostics: Diagnostic[];
  success: boolean;
}

export function formatCollie(source: string, options: FormatOptions = {}): FormatResult {
  const indentSize = validateIndentOption(options.indent);
  const normalized = source.replace(/\r\n?/g, "\n");
  const parseResult = parse(normalized);
  const diagnostics = normalizeDiagnostics(parseResult.diagnostics);
  const hasErrors = diagnostics.some((diag) => diag.severity === "error");

  if (hasErrors) {
    return {
      formatted: source,
      diagnostics,
      success: false
    };
  }

  const serialized = serializeTemplates(parseResult.templates, indentSize);
  const formatted = ensureTrailingNewline(serialized);

  return {
    formatted,
    diagnostics,
    success: true
  };
}

function normalizeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.map((diag) => {
    if (diag.range || !diag.span) {
      return diag;
    }
    return {
      ...diag,
      range: diag.span
    };
  });
}

function validateIndentOption(indent?: number): number {
  if (indent === undefined) {
    return 2;
  }
  if (!Number.isFinite(indent) || indent < 1) {
    throw new Error("Indent width must be a positive integer.");
  }
  return Math.floor(indent);
}

function serializeTemplates(templates: TemplateUnit[], indentSize: number): string {
  const lines: string[] = [];

  for (const template of templates) {
    if (lines.length && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    const idValue = template.rawId || template.id;
    lines.push(cleanLine(`#id ${idValue}`));
    const body = serializeRoot(template.ast, indentSize);
    if (body.trim().length > 0) {
      lines.push(...body.split("\n"));
    }
  }

  while (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function serializeRoot(root: RootNode, indentSize: number): string {
  const sections: string[][] = [];
  if (root.classAliases && root.classAliases.aliases.length > 0) {
    sections.push(formatClassAliases(root.classAliases, indentSize));
  }
  if (root.props && root.props.fields.length > 0) {
    sections.push(formatProps(root.props, indentSize));
  }
  if (root.children.length > 0) {
    sections.push(formatNodes(root.children, 0, indentSize));
  }

  const lines: string[] = [];
  for (const section of sections) {
    if (!section.length) continue;
    if (lines.length && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    for (const line of section) {
      lines.push(line);
    }
  }

  while (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function formatClassAliases(decl: ClassAliasesDecl, indentSize: number): string[] {
  const indent = indentString(1, indentSize);
  const lines: string[] = ["classes"];
  for (const alias of decl.aliases) {
    const rhs = alias.classes.join(".");
    lines.push(cleanLine(`${indent}${alias.name} = ${rhs}`));
  }
  return lines;
}

function formatProps(props: PropsDecl, indentSize: number): string[] {
  const indent = indentString(1, indentSize);
  const lines: string[] = ["props"];
  for (const field of props.fields) {
    const optionalFlag = field.optional ? "?" : "";
    lines.push(cleanLine(`${indent}${field.name}${optionalFlag}: ${field.typeText.trim()}`));
  }
  return lines;
}

function formatNodes(nodes: Node[], level: number, indentSize: number): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    lines.push(...formatNode(node, level, indentSize));
  }
  return lines;
}

function formatNode(node: Node, level: number, indentSize: number): string[] {
  switch (node.type) {
    case "Element":
      return formatElement(node, level, indentSize);
    case "Component":
      return formatComponent(node, level, indentSize);
    case "Text":
      return [formatTextNode(node, level, indentSize)];
    case "Expression":
      return [cleanLine(`${indentString(level, indentSize)}{{ ${node.value} }}`)];
    case "JSXPassthrough":
      return formatJsxPassthrough(node.expression, level, indentSize);
    case "For":
      return formatFor(node, level, indentSize);
    case "Conditional":
      return formatConditional(node, level, indentSize);
    default:
      return [];
  }
}

function formatElement(node: Node & { type: "Element" }, level: number, indentSize: number): string[] {
  const indent = indentString(level, indentSize);
  let line = `${indent}${node.name}${formatClassList(node.classes)}`;
  const attrs = formatAttributes(node.attributes);
  if (attrs) {
    line += `(${attrs})`;
  }
  const children = formatNodes(node.children, level + 1, indentSize);
  if (children.length === 0) {
    return [cleanLine(line)];
  }
  return [cleanLine(line), ...children];
}

function formatComponent(node: Node & { type: "Component" }, level: number, indentSize: number): string[] {
  const indent = indentString(level, indentSize);
  let line = `${indent}${node.name}`;
  const attrs = formatAttributes(node.attributes);
  if (attrs) {
    line += `(${attrs})`;
  }
  const children = formatNodes(node.children, level + 1, indentSize);
  if (children.length === 0) {
    return [cleanLine(line)];
  }
  return [cleanLine(line), ...children];
}

function formatTextNode(node: TextNode, level: number, indentSize: number): string {
  const indent = indentString(level, indentSize);
  const text = renderTextParts(node.parts);
  return cleanLine(`${indent}| ${text}`);
}

function renderTextParts(parts: TextPart[]): string {
  return parts
    .map((part) => {
      if (part.type === "text") {
        return part.value;
      }
      return `{${part.value}}`;
    })
    .join("");
}

function formatJsxPassthrough(expression: string, level: number, indentSize: number): string[] {
  const indent = indentString(level, indentSize);
  const childIndent = indentString(level + 1, indentSize);
  const normalized = expression.replace(/\r\n?/g, "\n").trimEnd();
  if (!normalized.trim()) {
    return [cleanLine(`${indent}= ${normalized.trim()}`)];
  }
  const lines = normalized.split("\n");
  const [first, ...rest] = lines;
  const result: string[] = [cleanLine(`${indent}= ${first.trim()}`)];
  if (rest.length === 0) {
    return result;
  }

  const dedent = computeDedent(rest);
  for (const raw of rest) {
    if (!raw.trim()) {
      result.push("");
      continue;
    }
    const withoutIndent = raw.slice(Math.min(dedent, raw.length)).trimEnd();
    result.push(cleanLine(`${childIndent}${withoutIndent}`));
  }
  return result;
}

function computeDedent(lines: string[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indentMatch = line.match(/^\s*/);
    const indentLength = indentMatch ? indentMatch[0].length : 0;
    min = Math.min(min, indentLength);
  }
  return Number.isFinite(min) ? min : 0;
}

function formatFor(node: Node & { type: "For" }, level: number, indentSize: number): string[] {
  const indent = indentString(level, indentSize);
  const header = cleanLine(`${indent}@for ${node.itemName} in ${node.arrayExpr}`);
  const body = formatNodes(node.body, level + 1, indentSize);
  return body.length ? [header, ...body] : [header];
}

function formatConditional(node: Node & { type: "Conditional" }, level: number, indentSize: number): string[] {
  const indent = indentString(level, indentSize);
  const lines: string[] = [];
  node.branches.forEach((branch, index) => {
    let directive: string;
    if (index === 0) {
      directive = `@if (${branch.test ?? ""})`;
    } else if (branch.test) {
      directive = `@elseIf (${branch.test})`;
    } else {
      directive = "@else";
    }
    lines.push(cleanLine(`${indent}${directive}`));
    const body = formatNodes(branch.body, level + 1, indentSize);
    lines.push(...body);
  });
  return lines;
}

function formatAttributes(attributes: Attribute[]): string {
  if (!attributes.length) {
    return "";
  }
  const sorted = [...attributes].sort((a, b) => {
    if (a.name === b.name) return 0;
    if (a.name === "class") return -1;
    if (b.name === "class") return 1;
    return a.name.localeCompare(b.name);
  });
  return sorted
    .map((attr) => {
      if (attr.value === null) {
        return attr.name;
      }
      return `${attr.name}=${normalizeAttributeValue(attr.value)}`;
    })
    .join(" ");
}

function normalizeAttributeValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("<")) {
    return trimmed;
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed;
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    const inner = trimmed.slice(1, -1).replace(/"/g, '\\"');
    return `"${inner}"`;
  }
  return trimmed;
}

function formatClassList(classes: string[]): string {
  if (!classes.length) return "";
  return classes.map((cls) => `.${cls}`).join("");
}

function indentString(level: number, indentSize: number): string {
  return " ".repeat(level * indentSize);
}

function ensureTrailingNewline(output: string): string {
  const trimmed = output.replace(/\s+$/g, "");
  return trimmed.length ? `${trimmed}\n` : "\n";
}

function cleanLine(line: string): string {
  return line.replace(/[ \t]+$/g, "");
}
