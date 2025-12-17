import type {
  ConditionalBranch,
  ConditionalNode,
  ElementNode,
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

  const jsx = renderRootChildren(root.children);

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

function renderRootChildren(children: Node[]): string {
  return emitNodesExpression(children);
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
  if (node.type === "Element" || node.type === "Text") {
    return true;
  }
  if (node.type === "Expression") {
    return false;
  }
  if (node.type === "Conditional") {
    return node.branches.some((branch) => branchUsesJsx(branch));
  }
  return false;
}

function branchUsesJsx(branch: ConditionalBranch): boolean {
  if (!branch.body.length) {
    return false;
  }
  return branch.body.some((child) => nodeUsesJsx(child));
}

function emitNodeInJsx(node: Node): string {
  if (node.type === "Text") {
    return emitText(node);
  }
  if (node.type === "Expression") {
    return `{${node.value}}`;
  }
  if (node.type === "Conditional") {
    return `{${emitConditionalExpression(node)}}`;
  }
  return emitElement(node);
}

function emitElement(node: ElementNode): string {
  const classAttr = node.classes.length ? ` className="${node.classes.join(" ")}"` : "";
  const children = node.children.map((child) => emitNodeInJsx(child)).join("");
  return `<${node.name}${classAttr}>${children}</${node.name}>`;
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

function emitConditionalExpression(node: ConditionalNode): string {
  if (!node.branches.length) {
    return "null";
  }
  const first = node.branches[0];
  if (node.branches.length === 1 && first.test) {
    return `(${first.test}) && ${emitBranchExpression(first)}`;
  }
  const hasElse = node.branches[node.branches.length - 1].test === undefined;
  let fallback = hasElse ? emitBranchExpression(node.branches[node.branches.length - 1]) : "null";
  const startIndex = hasElse ? node.branches.length - 2 : node.branches.length - 1;
  if (startIndex < 0) {
    return fallback;
  }
  for (let i = startIndex; i >= 0; i--) {
    const branch = node.branches[i];
    const test = branch.test ?? "false";
    fallback = `(${test}) ? ${emitBranchExpression(branch)} : ${fallback}`;
  }
  return fallback;
}

function emitBranchExpression(branch: ConditionalBranch): string {
  return emitNodesExpression(branch.body);
}

function emitNodesExpression(children: Node[]): string {
  if (children.length === 0) {
    return "null";
  }
  if (children.length === 1) {
    return emitSingleNodeExpression(children[0]);
  }
  return `<>${children.map((child) => emitNodeInJsx(child)).join("")}</>`;
}

function emitSingleNodeExpression(node: Node): string {
  if (node.type === "Expression") {
    return node.value;
  }
  if (node.type === "Conditional") {
    return emitConditionalExpression(node);
  }
  if (node.type === "Text") {
    return `<>${emitNodeInJsx(node)}</>`;
  }
  return emitNodeInJsx(node);
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
