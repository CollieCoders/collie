import type {
  Attribute,
  ClassAliasesDecl,
  ElementNode,
  Node,
  RootNode,
  TextNode
} from "./ast.ts";

export interface HtmlCodegenOptions {
  indent?: string;
}

// Attribute rendering overview:
// - renderAttributes flattens classes and AST-provided attributes into `name="value"` strings.
// - extractStaticAttributeValue peels the literal text from the parser's raw attribute field and hands it to
//   escapeHtmlAttribute so that &, <, >, and " inside the value are safely encoded.
// - When inline attributes were parsed as a single chunk (e.g. `src="/foo" alt="bar"`), the chunk's closing quote
//   was treated as part of the literal, causing escapeHtmlAttribute to turn the boundary `"` into `&quot;` and break
//   subsequent attributes. The logic below isolates the raw value and feeds any leftover attribute text back through
//   the same renderer so only the actual attribute contents are escaped.

/**
 * HTML emitter currently supports only static markup; dynamic expressions and control flow will be added later.
 */
export function generateHtml(root: RootNode, options: HtmlCodegenOptions = {}): string {
  const indent = options.indent ?? "  ";
  const aliasEnv = buildClassAliasEnvironment(root.classAliases);
  const rendered = emitNodes(root.children, aliasEnv, indent, 0);
  return rendered.trimEnd();
}

function emitNodes(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>,
  indent: string,
  depth: number
): string {
  let html = "";
  for (const child of children) {
    const chunk = emitNode(child, aliasEnv, indent, depth);
    if (chunk) {
      html += chunk;
    }
  }
  return html;
}

function emitNode(
  node: Node,
  aliasEnv: Map<string, readonly string[]>,
  indent: string,
  depth: number
): string {
  switch (node.type) {
    case "Element":
      return emitElement(node, aliasEnv, indent, depth);
    case "Text":
      return emitTextBlock(node, indent, depth);
    default:
      return "";
  }
}

function emitElement(
  node: ElementNode,
  aliasEnv: Map<string, readonly string[]>,
  indent: string,
  depth: number
): string {
  const indentText = indent.repeat(depth);
  const classNames = expandClasses(node.classes, aliasEnv);
  const attrs = renderAttributes(node.attributes, classNames);
  const openTag = `<${node.name}${attrs}>`;

  if (node.children.length === 0) {
    return `${indentText}${openTag}</${node.name}>\n`;
  }

  if (node.children.length === 1 && node.children[0].type === "Text") {
    const inline = emitInlineText(node.children[0]);
    if (inline !== null) {
      return `${indentText}${openTag}${inline}</${node.name}>\n`;
    }
  }

  const children = emitNodes(node.children, aliasEnv, indent, depth + 1);
  if (!children) {
    return `${indentText}${openTag}</${node.name}>\n`;
  }

  return `${indentText}${openTag}\n${children}${indentText}</${node.name}>\n`;
}

function renderAttributes(attributes: Attribute[], classNames: readonly string[]): string {
  const segments: string[] = [];
  if (classNames.length) {
    segments.push(`class="${escapeAttributeValue(classNames.join(" "))}"`);
  }
  for (const attr of attributes) {
    if (attr.value === null) {
      segments.push(attr.name);
      continue;
    }
    const literal = extractStaticAttributeValue(attr.value);
    if (literal === null) {
      continue;
    }
    const name = attr.name === "className" ? "class" : attr.name;
    segments.push(`${name}="${escapeAttributeValue(literal)}"`);
  }
  if (!segments.length) {
    return "";
  }
  return " " + segments.join(" ");
}

function emitTextBlock(node: TextNode, indent: string, depth: number): string {
  const inline = emitInlineText(node);
  if (inline === null || inline.trim().length === 0) {
    return "";
  }
  return `${indent.repeat(depth)}${inline}\n`;
}

function emitInlineText(node: TextNode): string | null {
  if (!node.parts.length) {
    return "";
  }
  let text = "";
  for (const part of node.parts) {
    if (part.type !== "text") {
      return null;
    }
    text += escapeStaticText(part.value);
  }
  return text;
}

function extractStaticAttributeValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    return null;
  }
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
    return null;
  }
  const body = trimmed.slice(1, -1);
  let result = "";
  let escaping = false;
  for (const char of body) {
    if (escaping) {
      result += unescapeChar(char, quote);
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
    } else {
      result += char;
    }
  }
  if (escaping) {
    result += "\\";
  }
  return result;
}

function unescapeChar(char: string, quote: string): string {
  switch (char) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "\\":
      return "\\";
    case '"':
      return '"';
    case "'":
      return "'";
    default:
      if (char === quote) {
        return quote;
      }
      return char;
  }
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
    const match = cls.match(/^\$([A-Za-z_][A-Za-z0-9_-]*)$/);
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

function escapeAttributeValue(value: string): string {
  return value.replace(/["&<>]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}
