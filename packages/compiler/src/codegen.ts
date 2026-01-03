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
    return wrapWithGuard(emitComponent(node, aliasEnv), node.guard, "jsx");
  }
  return wrapWithGuard(emitElement(node, aliasEnv), node.guard, "jsx");
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
  const slotProps = emitSlotProps(node, aliasEnv);
  const allAttrs = `${attrs}${slotProps}`;
  const children = emitChildrenWithSpacing(node.children, aliasEnv);
  
  if (children.length > 0) {
    return `<${node.name}${allAttrs}>${children}</${node.name}>`;
  } else {
    return `<${node.name}${allAttrs} />`;
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

function emitSlotProps(
  node: ComponentNode,
  aliasEnv: Map<string, readonly string[]>
): string {
  if (!node.slots || node.slots.length === 0) {
    return "";
  }
  return node.slots
    .map((slot) => {
      const expr = emitNodesExpression(slot.children, aliasEnv);
      return ` ${slot.name}={${expr}}`;
    })
    .join("");
}

function wrapWithGuard(rendered: string, guard: string | undefined, context: "jsx" | "expression"): string {
  if (!guard) {
    return rendered;
  }
  const expression = `(${guard}) && ${rendered}`;
  return context === "jsx" ? `{${expression}}` : expression;
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
  if (node.type === "Element") {
    return wrapWithGuard(emitElement(node, aliasEnv), node.guard, "expression");
  }
  if (node.type === "Component") {
    return wrapWithGuard(emitComponent(node, aliasEnv), node.guard, "expression");
  }
  if (node.type === "Text") {
    return `<>${emitNodeInJsx(node, aliasEnv)}</>`;
  }
  return emitNodeInJsx(node, aliasEnv);
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
  return `const { ${names.join(", ")} } = props;`;
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
