import type {
  Attribute,
  ClassAliasesDecl,
  ComponentNode,
  ConditionalBranch,
  ConditionalNode,
  ElementNode,
  ForNode,
  JSXPassthroughNode,
  Node,
  PropsDecl,
  RootNode,
  SlotBlock,
  TextNode
} from "./ast";

export interface CodegenOptions {
  componentName: string;
  jsxRuntime: "automatic" | "classic";
  flavor: "jsx" | "tsx";
}

export interface RenderCodegenOptions {
  jsxRuntime: "automatic" | "classic";
  flavor: "jsx" | "tsx";
}

export function generateModule(root: RootNode, options: CodegenOptions): string {
  const { componentName } = options;
  const { prelude, propsType, propsDestructure, jsx, isTsx } = buildModuleParts(root, options);

  const parts: string[] = [...prelude, propsType];

  if (!isTsx) {
    // JS-safe param typing (JSDoc), so tooling can still understand Props.
    parts.push(`/** @param {Props} props */`);
  }

  // IMPORTANT: Do not emit TypeScript annotations here.
  const functionLines = [
    isTsx
      ? `export default function ${componentName}(props: Props) {`
      : `export default function ${componentName}(props) {`
  ];
  if (propsDestructure) {
    functionLines.push(`  ${propsDestructure}`);
  }
  functionLines.push(`  return ${jsx};`, `}`);
  parts.push(functionLines.join("\n"));

  return parts.join("\n\n");
}

export function generateRenderModule(root: RootNode, options: RenderCodegenOptions): string {
  const { prelude, propsType, propsDestructure, jsx, isTsx } = buildModuleParts(root, options);
  const parts: string[] = [...prelude, propsType];

  if (!isTsx) {
    parts.push(`/** @param {any} props */`);
  }

  const functionLines = [
    isTsx ? "export function render(props: any) {" : "export function render(props) {"
  ];
  if (propsDestructure) {
    functionLines.push(`  ${propsDestructure}`);
  }
  functionLines.push(`  return ${jsx};`, `}`);
  parts.push(functionLines.join("\n"));

  return parts.join("\n\n");
}

interface ModuleParts {
  prelude: string[];
  propsType: string;
  propsDestructure: string | null;
  jsx: string;
  isTsx: boolean;
}

function buildModuleParts(
  root: RootNode,
  options: { jsxRuntime: "automatic" | "classic"; flavor: "jsx" | "tsx" }
): ModuleParts {
  const { jsxRuntime, flavor } = options;
  const isTsx = flavor === "tsx";

  const aliasEnv = buildClassAliasEnvironment(root.classAliases);
  const jsx = renderRootChildren(root.children, aliasEnv);
  const propsDestructure = emitPropsDestructure(root.props);

  const prelude: string[] = [];

  if (root.clientComponent) {
    prelude.push(`"use client";`);
  }

  // Classic runtime needs React in scope for JSX transforms.
  if (jsxRuntime === "classic" && templateUsesJsx(root)) {
    prelude.push(`import React from "react";`);
  }

  // JS-safe typedef for Props (JSDoc)
  const propsType = emitPropsType(root.props, flavor);

  return { prelude, propsType, propsDestructure, jsx, isTsx };
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

function renderRootChildren(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>
): string {
  return emitNodesExpression(children, aliasEnv, new Set());
}

function templateUsesJsx(root: RootNode): boolean {
  if (root.children.length === 0) {
    return false;
  }
  if (root.children.length > 1) {
    return true;
  }
  return nodeUsesJsx(root.children[0]);
}

function nodeUsesJsx(node: Node): boolean {
  if (node.type === "Element" || node.type === "Text" || node.type === "Component") {
    return true;
  }
  if (node.type === "Expression" || node.type === "JSXPassthrough") {
    return false;
  }
  if (node.type === "Conditional") {
    return node.branches.some((branch) => branchUsesJsx(branch));
  }
  if (node.type === "For") {
    return node.body.some((child) => nodeUsesJsx(child));
  }
  return false;
}

function branchUsesJsx(branch: ConditionalBranch): boolean {
  if (!branch.body.length) {
    return false;
  }
  return branch.body.some((child) => nodeUsesJsx(child));
}

function emitNodeInJsx(
  node: Node,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  if (node.type === "Text") {
    return emitText(node, locals);
  }
  if (node.type === "Expression") {
    return `{${emitExpressionValue(node.value, locals)}}`;
  }
  if (node.type === "JSXPassthrough") {
    return `{${emitJsxExpression(node.expression, locals)}}`;
  }
  if (node.type === "Conditional") {
    return `{${emitConditionalExpression(node, aliasEnv, locals)}}`;
  }
  if (node.type === "For") {
    return `{${emitForExpression(node, aliasEnv, locals)}}`;
  }
  if (node.type === "Component") {
    return wrapWithGuard(emitComponent(node, aliasEnv, locals), node.guard, "jsx", locals);
  }
  return wrapWithGuard(emitElement(node, aliasEnv, locals), node.guard, "jsx", locals);
}

function emitElement(
  node: ElementNode,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  const expanded = expandClasses(node.classes, aliasEnv);
  const classAttr = expanded.length ? ` className="${expanded.join(" ")}"` : "";
  const attrs = emitAttributes(node.attributes, aliasEnv, locals);
  const allAttrs = classAttr + attrs;
  const children = emitChildrenWithSpacing(node.children, aliasEnv, locals);
  
  if (children.length > 0) {
    return `<${node.name}${allAttrs}>${children}</${node.name}>`;
  } else {
    return `<${node.name}${allAttrs} />`;
  }
}

function emitComponent(
  node: ComponentNode,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  const attrs = emitAttributes(node.attributes, aliasEnv, locals);
  const slotProps = emitSlotProps(node, aliasEnv, locals);
  const allAttrs = `${attrs}${slotProps}`;
  const children = emitChildrenWithSpacing(node.children, aliasEnv, locals);
  
  if (children.length > 0) {
    return `<${node.name}${allAttrs}>${children}</${node.name}>`;
  } else {
    return `<${node.name}${allAttrs} />`;
  }
}

function emitChildrenWithSpacing(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  if (children.length === 0) {
    return "";
  }
  
  const parts: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const emitted = emitNodeInJsx(child, aliasEnv, locals);
    parts.push(emitted);
    
    // Add space between text and following element/component
    // but NOT between element/component and element/component
    if (i < children.length - 1) {
      const nextChild = children[i + 1];
      const needsSpace = 
        child.type === "Text" &&
        (nextChild.type === "Element" || nextChild.type === "Component" || nextChild.type === "Expression" || nextChild.type === "JSXPassthrough");
      
      if (needsSpace) {
        parts.push(" ");
      }
    }
  }
  
  return parts.join("");
}

function emitAttributes(
  attributes: Attribute[],
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  if (attributes.length === 0) {
    return "";
  }
  
  return attributes.map(attr => {
    if (attr.value === null) {
      return ` ${attr.name}`;
    }
    return ` ${attr.name}=${emitAttributeValue(attr.value, locals)}`;
  }).join("");
}

function emitSlotProps(
  node: ComponentNode,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  if (!node.slots || node.slots.length === 0) {
    return "";
  }
  return node.slots
    .map((slot) => {
      const expr = emitNodesExpression(slot.children, aliasEnv, locals);
      return ` ${slot.name}={${expr}}`;
    })
    .join("");
}

function wrapWithGuard(
  rendered: string,
  guard: string | undefined,
  context: "jsx" | "expression",
  locals: Set<string>
): string {
  if (!guard) {
    return rendered;
  }
  const condition = emitExpressionValue(guard, locals);
  const expression = `(${condition}) && ${rendered}`;
  return context === "jsx" ? `{${expression}}` : expression;
}

function emitForExpression(
  node: ForNode,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  const arrayExpr = emitExpressionValue(node.arrayExpr, locals);
  const nextLocals = new Set(locals);
  nextLocals.add(node.itemName);
  const body = emitNodesExpression(node.body, aliasEnv, nextLocals);
  return `(${arrayExpr} ?? []).map((${node.itemName}) => ${body})`;
}

function expandClasses(
  classes: readonly string[],
  aliasEnv: Map<string, readonly string[]>
): string[] {
  // Alias expansion is a pure compile-time macro. The parser guarantees diagnostics for
  // undefined aliases, so codegen simply replaces $alias tokens with their literal class list.
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

function emitExpressionValue(expression: string, locals: Set<string>): string {
  return rewriteExpression(expression, locals);
}

function emitJsxExpression(expression: string, locals: Set<string>): string {
  const trimmed = expression.trimStart();
  if (trimmed.startsWith("<")) {
    return rewriteJsxExpression(expression, locals);
  }
  return rewriteExpression(expression, locals);
}

function emitAttributeValue(value: string, locals: Set<string>): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
    return value;
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1);
    const rewritten = rewriteExpression(inner, locals);
    return `{${rewritten}}`;
  }
  return rewriteExpression(trimmed, locals);
}

function emitText(node: TextNode, locals: Set<string>): string {
  if (!node.parts.length) {
    return "";
  }

  return node.parts
    .map((part) => {
      if (part.type === "text") {
        return escapeText(part.value);
      }
      return `{${emitExpressionValue(part.value, locals)}}`;
    })
    .join("");
}

function emitConditionalExpression(
  node: ConditionalNode,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  if (!node.branches.length) {
    return "null";
  }
  const first = node.branches[0];
  if (node.branches.length === 1 && first.test) {
    const test = emitExpressionValue(first.test, locals);
    return `(${test}) && ${emitBranchExpression(first, aliasEnv, locals)}`;
  }
  const hasElse = node.branches[node.branches.length - 1].test === undefined;
  let fallback = hasElse
    ? emitBranchExpression(node.branches[node.branches.length - 1], aliasEnv, locals)
    : "null";
  const startIndex = hasElse ? node.branches.length - 2 : node.branches.length - 1;
  if (startIndex < 0) {
    return fallback;
  }
  for (let i = startIndex; i >= 0; i--) {
    const branch = node.branches[i];
    const test = branch.test ? emitExpressionValue(branch.test, locals) : "false";
    fallback = `(${test}) ? ${emitBranchExpression(branch, aliasEnv, locals)} : ${fallback}`;
  }
  return fallback;
}

function emitBranchExpression(
  branch: ConditionalBranch,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  return emitNodesExpression(branch.body, aliasEnv, locals);
}

function emitNodesExpression(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  if (children.length === 0) {
    return "null";
  }
  if (children.length === 1) {
    return emitSingleNodeExpression(children[0], aliasEnv, locals);
  }
  return `<>${children.map((child) => emitNodeInJsx(child, aliasEnv, locals)).join("")}</>`;
}

function emitSingleNodeExpression(
  node: Node,
  aliasEnv: Map<string, readonly string[]>,
  locals: Set<string>
): string {
  if (node.type === "Expression") {
    return emitExpressionValue(node.value, locals);
  }
  if (node.type === "JSXPassthrough") {
    return emitJsxExpression(node.expression, locals);
  }
  if (node.type === "Conditional") {
    return emitConditionalExpression(node, aliasEnv, locals);
  }
  if (node.type === "For") {
    return emitForExpression(node, aliasEnv, locals);
  }
  if (node.type === "Element") {
    return wrapWithGuard(emitElement(node, aliasEnv, locals), node.guard, "expression", locals);
  }
  if (node.type === "Component") {
    return wrapWithGuard(emitComponent(node, aliasEnv, locals), node.guard, "expression", locals);
  }
  if (node.type === "Text") {
    return `<>${emitNodeInJsx(node, aliasEnv, locals)}</>`;
  }
  return emitNodeInJsx(node, aliasEnv, locals);
}

function emitPropsType(props: PropsDecl | undefined, flavor: "jsx" | "tsx"): string {
  if (flavor === "tsx") {
    return emitTsPropsType(props);
  }
  return emitJsDocPropsType(props);
}

function emitJsDocPropsType(props?: PropsDecl): string {
  // Emit JS-safe JSDoc typedef (Rollup can parse this, and TS tooling can read it).
  if (!props) {
    return "/** @typedef {any} Props */";
  }
  if (!props.fields.length) {
    return "/** @typedef {{}} Props */";
  }

  // Build an object type like: { foo: string; bar?: number }
  const fields = props.fields
    .map((field) => {
      const optional = field.optional ? "?" : "";
      return `${field.name}${optional}: ${field.typeText}`;
    })
    .join("; ");

  return `/** @typedef {{ ${fields} }} Props */`;
}

function emitTsPropsType(props?: PropsDecl): string {
  if (!props || props.fields.length === 0) {
    return "export type Props = Record<string, never>;";
  }

  const lines = props.fields.map((field) => {
    const optional = field.optional ? "?" : "";
    return `  ${field.name}${optional}: ${field.typeText};`;
  });

  return ["export interface Props {", ...lines, "}"].join("\n");
}

function emitPropsDestructure(props?: PropsDecl): string | null {
  if (!props || props.fields.length === 0) {
    return null;
  }
  const names = props.fields.map((field) => field.name);
  return `const { ${names.join(", ")} } = props ?? {};`;
}

function escapeText(value: string): string {
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

function emitIdentifier(name: string): string {
  return `props?.${name}`;
}

function rewriteExpression(expression: string, locals: Set<string>): string {
  let i = 0;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";
  let output = "";

  while (i < expression.length) {
    const ch = expression[i];

    if (state === "code") {
      if (ch === "'" || ch === "\"") {
        state = ch === "'" ? "single" : "double";
        output += ch;
        i++;
        continue;
      }
      if (ch === "`") {
        state = "template";
        output += ch;
        i++;
        continue;
      }
      if (ch === "/" && expression[i + 1] === "/") {
        state = "line";
        output += ch;
        i++;
        continue;
      }
      if (ch === "/" && expression[i + 1] === "*") {
        state = "block";
        output += ch;
        i++;
        continue;
      }
      if (isIdentifierStart(ch)) {
        const start = i;
        i++;
        while (i < expression.length && isIdentifierPart(expression[i])) {
          i++;
        }
        const name = expression.slice(start, i);
        const prevNonSpace = findPreviousNonSpace(expression, start - 1);
        const nextNonSpace = findNextNonSpace(expression, i);
        const isMemberAccess = prevNonSpace === ".";
        const isObjectKey = nextNonSpace === ":";

        if (
          isMemberAccess ||
          isObjectKey ||
          locals.has(name) ||
          shouldIgnoreIdentifier(name)
        ) {
          output += name;
          continue;
        }

        output += emitIdentifier(name);
        continue;
      }

      output += ch;
      i++;
      continue;
    }

    if (state === "line") {
      output += ch;
      if (ch === "\n") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "block") {
      output += ch;
      if (ch === "*" && expression[i + 1] === "/") {
        output += "/";
        i += 2;
        state = "code";
        continue;
      }
      i++;
      continue;
    }

    if (state === "single") {
      output += ch;
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          output += expression[i + 1];
          i += 2;
          continue;
        }
      }
      if (ch === "'") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "double") {
      output += ch;
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          output += expression[i + 1];
          i += 2;
          continue;
        }
      }
      if (ch === "\"") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "template") {
      output += ch;
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          output += expression[i + 1];
          i += 2;
          continue;
        }
      }
      if (ch === "`") {
        state = "code";
      }
      i++;
      continue;
    }
  }

  return output;
}

function rewriteJsxExpression(expression: string, locals: Set<string>): string {
  let output = "";
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];
    if (ch === "{") {
      const braceResult = readBalancedBraces(expression, i + 1);
      if (!braceResult) {
        output += expression.slice(i);
        break;
      }
      const rewritten = rewriteExpression(braceResult.content, locals);
      output += `{${rewritten}}`;
      i = braceResult.endIndex + 1;
      continue;
    }
    output += ch;
    i++;
  }

  return output;
}

function readBalancedBraces(
  source: string,
  startIndex: number
): { content: string; endIndex: number } | null {
  let i = startIndex;
  let depth = 1;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";

  while (i < source.length) {
    const ch = source[i];

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
      if (ch === "/" && source[i + 1] === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (ch === "/" && source[i + 1] === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return { content: source.slice(startIndex, i), endIndex: i };
        }
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
      if (ch === "*" && source[i + 1] === "/") {
        i += 2;
        state = "code";
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
      }
      i++;
      continue;
    }
  }

  return null;
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

function findNextNonSpace(text: string, index: number): string | null {
  for (let i = index; i < text.length; i++) {
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
