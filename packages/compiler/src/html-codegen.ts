import type {
  Attribute,
  ClassAliasesDecl,
  ComponentNode,
  ConditionalBranch,
  ConditionalNode,
  ElementNode,
  ForNode,
  Node,
  PropsDecl,
  RootNode,
  SlotBlock,
  TextNode
} from "./ast";

export interface HtmlCodegenOptions {
  componentName: string;
}

export function generateHtmlModule(root: RootNode, options: HtmlCodegenOptions): string {
  const aliasEnv = buildClassAliasEnvironment(root.classAliases);
  const htmlExpression = emitNodesString(root.children, aliasEnv);
  const propsType = emitJsDocPropsType(root.props);
  const propsDestructure = emitPropsDestructure(root.props);

  const parts: string[] = [];

  if (root.clientComponent) {
    parts.push(`"use client";`);
  }

  parts.push(...createHtmlHelpers());
  parts.push(propsType);
  parts.push(`/** @param {Props} props */`);
  parts.push(`/** @returns {string} */`);

  const lines = [`export default function ${options.componentName}(props = {}) {`];
  if (propsDestructure) {
    lines.push(`  ${propsDestructure}`);
  }
  lines.push(`  const __collie_html = ${htmlExpression};`);
  lines.push("  return __collie_html;", "}");
  parts.push(lines.join("\n"));

  return parts.join("\n\n");
}

function emitNodesString(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>
): string {
  if (children.length === 0) {
    return '""';
  }

  const segments = children.map((child) => emitNodeString(child, aliasEnv)).filter(Boolean);
  return concatSegments(segments);
}

function emitNodeString(node: Node, aliasEnv: Map<string, readonly string[]>): string {
  switch (node.type) {
    case "Text":
      return emitTextNode(node);
    case "Expression":
      return `__collie_escapeHtml(${node.value})`;
    case "JSXPassthrough":
      return `String(${node.expression})`;
    case "Element":
      return wrapWithGuard(emitElement(node, aliasEnv), node.guard);
    case "Component":
      return wrapWithGuard(emitComponent(node, aliasEnv), node.guard);
    case "Conditional":
      return emitConditional(node, aliasEnv);
    case "For":
      return emitFor(node, aliasEnv);
    default:
      return '""';
  }
}

function emitElement(node: ElementNode, aliasEnv: Map<string, readonly string[]>): string {
  const classSegments = expandClasses(node.classes, aliasEnv);
  const attributeSegments = emitAttributeSegments(node.attributes, classSegments);
  const start = concatSegments([literal(`<${node.name}`), ...attributeSegments, literal(node.children.length > 0 ? ">" : " />")]);

  if (node.children.length === 0) {
    return start;
  }

  const children = emitNodesString(node.children, aliasEnv);
  const end = literal(`</${node.name}>`);
  return concatSegments([start, children, end]);
}

function emitComponent(node: ComponentNode, aliasEnv: Map<string, readonly string[]>): string {
  const attributeSegments = emitAttributeSegments(node.attributes, []);
  const hasChildren = node.children.length > 0 || (node.slots?.length ?? 0) > 0;
  const closingToken = hasChildren ? ">" : " />";
  const start = concatSegments([literal(`<${node.name}`), ...attributeSegments, literal(closingToken)]);

  if (!hasChildren) {
    return start;
  }

  const childSegments: string[] = [];
  if (node.children.length) {
    childSegments.push(emitNodesString(node.children, aliasEnv));
  }
  for (const slot of node.slots ?? []) {
    childSegments.push(emitSlotTemplate(slot, aliasEnv));
  }

  const children = concatSegments(childSegments);
  const end = literal(`</${node.name}>`);
  return concatSegments([start, children, end]);
}

function emitSlotTemplate(slot: SlotBlock, aliasEnv: Map<string, readonly string[]>): string {
  const start = literal(`<template slot="${slot.name}">`);
  const body = emitNodesString(slot.children, aliasEnv);
  const end = literal("</template>");
  return concatSegments([start, body, end]);
}

function emitConditional(
  node: ConditionalNode,
  aliasEnv: Map<string, readonly string[]>
): string {
  if (node.branches.length === 0) {
    return '""';
  }
  const first = node.branches[0];
  if (node.branches.length === 1 && first.test) {
    return `(${first.test}) ? ${emitBranch(first, aliasEnv)} : ""`;
  }
  const hasElse = node.branches[node.branches.length - 1].test === undefined;
  let fallback = hasElse ? emitBranch(node.branches[node.branches.length - 1], aliasEnv) : '""';
  const limit = hasElse ? node.branches.length - 2 : node.branches.length - 1;
  for (let i = limit; i >= 0; i--) {
    const branch = node.branches[i];
    const test = branch.test ?? "false";
    fallback = `(${test}) ? ${emitBranch(branch, aliasEnv)} : ${fallback}`;
  }
  return fallback;
}

function emitBranch(branch: ConditionalBranch, aliasEnv: Map<string, readonly string[]>): string {
  return emitNodesString(branch.body, aliasEnv);
}

function emitFor(node: ForNode, aliasEnv: Map<string, readonly string[]>): string {
  const body = emitNodesString(node.body, aliasEnv);
  return `(${node.arrayExpr}).map((${node.itemName}) => ${body}).join("")`;
}

function emitTextNode(node: TextNode): string {
  if (!node.parts.length) {
    return '""';
  }

  const segments = node.parts.map((part) => {
    if (part.type === "text") {
      return literal(escapeStaticText(part.value));
    }
    return `__collie_escapeHtml(${part.value})`;
  });
  return concatSegments(segments);
}

function emitAttributeSegments(attributes: Attribute[], classNames: readonly string[]): string[] {
  const segments: string[] = [];
  if (classNames.length) {
    segments.push(literal(` class="${classNames.join(" ")}"`));
  }
  for (const attr of attributes) {
    if (attr.value === null) {
      segments.push(literal(` ${attr.name}`));
      continue;
    }
    const expr = attributeExpression(attr.value);
    segments.push(
      [
        "(() => {",
        `  const __collie_attr = ${expr};`,
        `  return __collie_attr == null ? "" : ${literal(` ${attr.name}="`)} + __collie_escapeAttr(__collie_attr) + ${literal(`"`)};`,
        "})()"
      ].join(" ")
    );
  }
  return segments;
}

function attributeExpression(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function wrapWithGuard(rendered: string, guard?: string): string {
  if (!guard) {
    return rendered;
  }
  return `(${guard}) ? ${rendered} : ""`;
}

function literal(text: string): string {
  return JSON.stringify(text);
}

function concatSegments(segments: string[]): string {
  const filtered = segments.filter((segment) => segment && segment !== '""');
  if (!filtered.length) {
    return '""';
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  return filtered.join(" + ");
}

function buildClassAliasEnvironment(
  decl?: ClassAliasesDecl
): Map<string, readonly string[]> {
  const env = new Map<string, readonly string[]>();
  if (!decl) {
    return env;
  }
  for (const alias of decl.aliases) {
    env.set(alias.name, alias.classes);
  }
  return env;
}

function expandClasses(
  classes: readonly string[],
  aliasEnv: Map<string, readonly string[]>
): string[] {
  const result: string[] = [];
  for (const cls of classes) {
    const match = cls.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
    if (!match) {
      result.push(cls);
      continue;
    }
    const aliasClasses = aliasEnv.get(match[1]);
    if (!aliasClasses) {
      continue;
    }
    result.push(...aliasClasses);
  }
  return result;
}

function emitJsDocPropsType(props?: PropsDecl): string {
  if (!props) {
    return "/** @typedef {any} Props */";
  }
  if (!props.fields.length) {
    return "/** @typedef {{}} Props */";
  }
  const fields = props.fields
    .map((field) => {
      const optional = field.optional ? "?" : "";
      return `${field.name}${optional}: ${field.typeText}`;
    })
    .join("; ");
  return `/** @typedef {{ ${fields} }} Props */`;
}

function emitPropsDestructure(props?: PropsDecl): string | null {
  if (!props || props.fields.length === 0) {
    return null;
  }
  const names = props.fields.map((field) => field.name);
  return `const { ${names.join(", ")} } = props;`;
}

function escapeStaticText(value: string): string {
  return value.replace(/[&<>{}]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "{":
        return "&#123;";
      case "}":
        return "&#125;";
      default:
        return char;
    }
  });
}

function createHtmlHelpers(): string[] {
  return [
    "function __collie_escapeHtml(value) {",
    "  if (value === null || value === undefined) {",
    '    return "";',
    "  }",
    "  return String(value).replace(/[&<>]/g, __collie_escapeHtmlChar);",
    "}",
    "function __collie_escapeHtmlChar(char) {",
    '  switch (char) {',
    '    case "&":',
    '      return "&amp;";',
    '    case "<":',
    '      return "&lt;";',
    '    case ">":',
    '      return "&gt;";',
    "    default:",
    "      return char;",
    "  }",
    "}",
    "function __collie_escapeAttr(value) {",
    "  if (value === null || value === undefined) {",
    '    return "";',
    "  }",
    '  return String(value).replace(/["&<>]/g, __collie_escapeAttrChar);',
    "}",
    "function __collie_escapeAttrChar(char) {",
    '  switch (char) {',
    '    case "&":',
    '      return "&amp;";',
    '    case "<":',
    '      return "&lt;";',
    '    case ">":',
    '      return "&gt;";',
    '    case \'"\':',
    '      return "&quot;";',
    "    default:",
    "      return char;",
    "  }",
    "}"
  ];
}
