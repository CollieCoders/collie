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
  TextNode
} from "./ast";

export interface CodegenOptions {
  componentName: string;
  jsxRuntime: "automatic" | "classic";
}

export function generateModule(root: RootNode, options: CodegenOptions): string {
  const { componentName, jsxRuntime } = options;

  const aliasEnv = buildClassAliasEnvironment(root.classAliases);
  const jsx = renderRootChildren(root.children, aliasEnv);

  const parts: string[] = [];

  // Classic runtime needs React in scope for JSX transforms.
  if (jsxRuntime === "classic" && templateUsesJsx(root)) {
    parts.push(`import React from "react";`);
  }

  // JS-safe typedef for Props (JSDoc)
  parts.push(emitPropsType(root.props));

  // JS-safe param typing (JSDoc), so tooling can still understand Props.
  parts.push(`/** @param {Props} props */`);

  // IMPORTANT: Do not emit TypeScript annotations here.
  parts.push(
    [`export default function ${componentName}(props) {`, `  return ${jsx};`, `}`].join("\n")
  );

  return parts.join("\n\n");
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
  return emitNodesExpression(children, aliasEnv);
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

function emitNodeInJsx(node: Node, aliasEnv: Map<string, readonly string[]>): string {
  if (node.type === "Text") {
    return emitText(node);
  }
  if (node.type === "Expression") {
    return `{${node.value}}`;
  }
  if (node.type === "JSXPassthrough") {
    return `{${node.expression}}`;
  }
  if (node.type === "Conditional") {
    return `{${emitConditionalExpression(node, aliasEnv)}}`;
  }
  if (node.type === "For") {
    return `{${emitForExpression(node, aliasEnv)}}`;
  }
  if (node.type === "Component") {
    return emitComponent(node, aliasEnv);
  }
  return emitElement(node, aliasEnv);
}

function emitElement(
  node: ElementNode,
  aliasEnv: Map<string, readonly string[]>
): string {
  const expanded = expandClasses(node.classes, aliasEnv);
  const classAttr = expanded.length ? ` className="${expanded.join(" ")}"` : "";
  const attrs = emitAttributes(node.attributes, aliasEnv);
  const allAttrs = classAttr + attrs;
  const children = emitChildrenWithSpacing(node.children, aliasEnv);
  
  if (children.length > 0) {
    return `<${node.name}${allAttrs}>${children}</${node.name}>`;
  } else {
    return `<${node.name}${allAttrs} />`;
  }
}

function emitComponent(
  node: ComponentNode,
  aliasEnv: Map<string, readonly string[]>
): string {
  const attrs = emitAttributes(node.attributes, aliasEnv);
  const children = emitChildrenWithSpacing(node.children, aliasEnv);
  
  if (children.length > 0) {
    return `<${node.name}${attrs}>${children}</${node.name}>`;
  } else {
    return `<${node.name}${attrs} />`;
  }
}

function emitChildrenWithSpacing(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>
): string {
  if (children.length === 0) {
    return "";
  }
  
  const parts: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const emitted = emitNodeInJsx(child, aliasEnv);
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
  aliasEnv: Map<string, readonly string[]>
): string {
  if (attributes.length === 0) {
    return "";
  }
  
  return attributes.map(attr => {
    if (attr.value === null) {
      return ` ${attr.name}`;
    }
    // The value is already in the correct format (e.g., {expr} or "string")
    return ` ${attr.name}=${attr.value}`;
  }).join("");
}

function emitForExpression(
  node: ForNode,
  aliasEnv: Map<string, readonly string[]>
): string {
  const body = emitNodesExpression(node.body, aliasEnv);
  return `${node.arrayExpr}.map((${node.itemName}) => ${body})`;
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

function emitText(node: TextNode): string {
  if (!node.parts.length) {
    return "";
  }

  return node.parts
    .map((part) => {
      if (part.type === "text") {
        return escapeText(part.value);
      }
      return `{${part.value}}`;
    })
    .join("");
}

function emitConditionalExpression(
  node: ConditionalNode,
  aliasEnv: Map<string, readonly string[]>
): string {
  if (!node.branches.length) {
    return "null";
  }
  const first = node.branches[0];
  if (node.branches.length === 1 && first.test) {
    return `(${first.test}) && ${emitBranchExpression(first, aliasEnv)}`;
  }
  const hasElse = node.branches[node.branches.length - 1].test === undefined;
  let fallback = hasElse
    ? emitBranchExpression(node.branches[node.branches.length - 1], aliasEnv)
    : "null";
  const startIndex = hasElse ? node.branches.length - 2 : node.branches.length - 1;
  if (startIndex < 0) {
    return fallback;
  }
  for (let i = startIndex; i >= 0; i--) {
    const branch = node.branches[i];
    const test = branch.test ?? "false";
    fallback = `(${test}) ? ${emitBranchExpression(branch, aliasEnv)} : ${fallback}`;
  }
  return fallback;
}

function emitBranchExpression(
  branch: ConditionalBranch,
  aliasEnv: Map<string, readonly string[]>
): string {
  return emitNodesExpression(branch.body, aliasEnv);
}

function emitNodesExpression(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>
): string {
  if (children.length === 0) {
    return "null";
  }
  if (children.length === 1) {
    return emitSingleNodeExpression(children[0], aliasEnv);
  }
  return `<>${children.map((child) => emitNodeInJsx(child, aliasEnv)).join("")}</>`;
}

function emitSingleNodeExpression(
  node: Node,
  aliasEnv: Map<string, readonly string[]>
): string {
  if (node.type === "Expression") {
    return node.value;
  }
  if (node.type === "JSXPassthrough") {
    return node.expression;
  }
  if (node.type === "Conditional") {
    return emitConditionalExpression(node, aliasEnv);
  }
  if (node.type === "For") {
    return emitForExpression(node, aliasEnv);
  }
  if (node.type === "Text") {
    return `<>${emitNodeInJsx(node, aliasEnv)}</>`;
  }
  return emitNodeInJsx(node, aliasEnv);
}

function emitPropsType(props?: PropsDecl): string {
  // Emit JS-safe JSDoc typedef (Rollup can parse this, and TS tooling can read it).
  if (!props || !props.fields.length) {
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
