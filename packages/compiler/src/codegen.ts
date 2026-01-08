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
  InputsDecl,
  RootNode,
  SlotBlock,
  TextNode
} from "./ast.ts";
import { createTemplateEnv, isLocal, isInput, popLocals, pushLocals, rewriteExpression, rewriteJsxExpression, type TemplateEnv } from "./rewrite.ts";

export interface RenderCodegenOptions {
  jsxRuntime: "automatic" | "classic";
  flavor: "jsx" | "tsx";
}

export function generateRenderModule(root: RootNode, options: RenderCodegenOptions): string {
  const { prelude, inputsType, inputsPrelude, jsx, isTsx } = buildModuleParts(root, options);
  const parts: string[] = [...prelude, inputsType];

  if (!isTsx) {
    parts.push(`/** @param {any} __inputs */`);
  }

  const functionLines = [
    isTsx ? "export function render(__inputs: any) {" : "export function render(__inputs) {"
  ];
  if (inputsPrelude) {
    functionLines.push(`  ${inputsPrelude}`);
  }
  functionLines.push(`  return ${jsx};`, `}`);
  parts.push(functionLines.join("\n"));

  return parts.join("\n\n");
}

interface ModuleParts {
  prelude: string[];
  inputsType: string;
  inputsPrelude: string | null;
  jsx: string;
  isTsx: boolean;
}

function buildModuleParts(
  root: RootNode,
  options: { jsxRuntime: "automatic" | "classic"; flavor: "jsx" | "tsx" }
): ModuleParts {
  const { jsxRuntime, flavor } = options;
  const isTsx = flavor === "tsx";

  // Build environments for code generation (does not mutate AST)
  const aliasEnv = buildClassAliasEnvironment(root.classAliases);
  const env = createTemplateEnv(root.inputsDecls);
  
  // Generate TSX output with bare identifiers for inputs
  const jsx = renderRootChildren(root.children, aliasEnv, env);
  const inputsPrelude = emitInputsPrelude(root.inputsDecls);

  const prelude: string[] = [];

  if (root.clientComponent) {
    prelude.push(`"use client";`);
  }

  // Classic runtime needs React in scope for JSX transforms.
  if (jsxRuntime === "classic" && templateUsesJsx(root)) {
    prelude.push(`import React from "react";`);
  }

  // JS-safe typedef for Inputs (JSDoc)
  const inputsType = emitInputsType(root.inputs, flavor);

  return { prelude, inputsType, inputsPrelude, jsx, isTsx };
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
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  return emitNodesExpression(children, aliasEnv, env);
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
  env: TemplateEnv
): string {
  if (node.type === "Text") {
    return emitText(node, env);
  }
  if (node.type === "Expression") {
    return `{${emitExpressionValue(node.value, env)}}`;
  }
  if (node.type === "JSXPassthrough") {
    return `{${emitJsxExpression(node.expression, env)}}`;
  }
  if (node.type === "Conditional") {
    return `{${emitConditionalExpression(node, aliasEnv, env)}}`;
  }
  if (node.type === "For") {
    return `{${emitForExpression(node, aliasEnv, env)}}`;
  }
  if (node.type === "Component") {
    return wrapWithGuard(emitComponent(node, aliasEnv, env), node.guard, "jsx", env);
  }
  return wrapWithGuard(emitElement(node, aliasEnv, env), node.guard, "jsx", env);
}

function emitElement(
  node: ElementNode,
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  const expanded = expandClasses(node.classes, aliasEnv);
  const classAttr = expanded.length ? ` className="${expanded.join(" ")}"` : "";
  const attrs = emitAttributes(node.attributes, aliasEnv, env);
  const allAttrs = classAttr + attrs;
  const children = emitChildrenWithSpacing(node.children, aliasEnv, env);
  
  if (children.length > 0) {
    return `<${node.name}${allAttrs}>${children}</${node.name}>`;
  } else {
    return `<${node.name}${allAttrs} />`;
  }
}

function emitComponent(
  node: ComponentNode,
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  const attrs = emitAttributes(node.attributes, aliasEnv, env);
  const slotProps = emitSlotProps(node, aliasEnv, env);
  const allAttrs = `${attrs}${slotProps}`;
  const children = emitChildrenWithSpacing(node.children, aliasEnv, env);
  
  if (children.length > 0) {
    return `<${node.name}${allAttrs}>${children}</${node.name}>`;
  } else {
    return `<${node.name}${allAttrs} />`;
  }
}

function emitChildrenWithSpacing(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  if (children.length === 0) {
    return "";
  }
  
  const parts: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const emitted = emitNodeInJsx(child, aliasEnv, env);
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
  env: TemplateEnv
): string {
  if (attributes.length === 0) {
    return "";
  }
  
  return attributes.map(attr => {
    if (attr.value === null) {
      return ` ${attr.name}`;
    }
    return ` ${attr.name}=${emitAttributeValue(attr.value, env)}`;
  }).join("");
}

function emitSlotProps(
  node: ComponentNode,
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  if (!node.slots || node.slots.length === 0) {
    return "";
  }
  return node.slots
    .map((slot) => {
      const expr = emitNodesExpression(slot.children, aliasEnv, env);
      return ` ${slot.name}={${expr}}`;
    })
    .join("");
}

function wrapWithGuard(
  rendered: string,
  guard: string | undefined,
  context: "jsx" | "expression",
  env: TemplateEnv
): string {
  if (!guard) {
    return rendered;
  }
  const condition = emitExpressionValue(guard, env);
  const expression = `(${condition}) && ${rendered}`;
  return context === "jsx" ? `{${expression}}` : expression;
}

function emitForExpression(
  node: ForNode,
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  const arrayExpr = emitExpressionValue(node.arrayExpr, env);
  pushLocals(env, [node.itemName]);
  const body = emitNodesExpression(node.body, aliasEnv, env);
  popLocals(env);
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

function emitExpressionValue(expression: string, env: TemplateEnv): string {
  return rewriteExpression(expression, env).code;
}

function emitJsxExpression(expression: string, env: TemplateEnv): string {
  const trimmed = expression.trimStart();
  if (trimmed.startsWith("<")) {
    return rewriteJsxExpression(expression, env).code;
  }
  return rewriteExpression(expression, env).code;
}

function emitAttributeValue(value: string, env: TemplateEnv): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
    return value;
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1);
    const rewritten = rewriteExpression(inner, env).code;
    return `{${rewritten}}`;
  }
  return rewriteExpression(trimmed, env).code;
}

function emitText(node: TextNode, env: TemplateEnv): string {
  if (!node.parts.length) {
    return "";
  }

  return node.parts
    .map((part) => {
      if (part.type === "text") {
        return escapeText(part.value);
      }
      return `{${emitExpressionValue(part.value, env)}}`;
    })
    .join("");
}

function emitConditionalExpression(
  node: ConditionalNode,
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  if (!node.branches.length) {
    return "null";
  }
  const first = node.branches[0];
  if (node.branches.length === 1 && first.test) {
    const test = emitExpressionValue(first.test, env);
    return `(${test}) && ${emitBranchExpression(first, aliasEnv, env)}`;
  }
  const hasElse = node.branches[node.branches.length - 1].test === undefined;
  let fallback = hasElse
    ? emitBranchExpression(node.branches[node.branches.length - 1], aliasEnv, env)
    : "null";
  const startIndex = hasElse ? node.branches.length - 2 : node.branches.length - 1;
  if (startIndex < 0) {
    return fallback;
  }
  for (let i = startIndex; i >= 0; i--) {
    const branch = node.branches[i];
    const test = branch.test ? emitExpressionValue(branch.test, env) : "false";
    fallback = `(${test}) ? ${emitBranchExpression(branch, aliasEnv, env)} : ${fallback}`;
  }
  return fallback;
}

function emitBranchExpression(
  branch: ConditionalBranch,
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  return emitNodesExpression(branch.body, aliasEnv, env);
}

function emitNodesExpression(
  children: Node[],
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  if (children.length === 0) {
    return "null";
  }
  if (children.length === 1) {
    return emitSingleNodeExpression(children[0], aliasEnv, env);
  }
  return `<>${children.map((child) => emitNodeInJsx(child, aliasEnv, env)).join("")}</>`;
}

function emitSingleNodeExpression(
  node: Node,
  aliasEnv: Map<string, readonly string[]>,
  env: TemplateEnv
): string {
  if (node.type === "Expression") {
    return emitExpressionValue(node.value, env);
  }
  if (node.type === "JSXPassthrough") {
    return emitJsxExpression(node.expression, env);
  }
  if (node.type === "Conditional") {
    return emitConditionalExpression(node, aliasEnv, env);
  }
  if (node.type === "For") {
    return emitForExpression(node, aliasEnv, env);
  }
  if (node.type === "Element") {
    return wrapWithGuard(emitElement(node, aliasEnv, env), node.guard, "expression", env);
  }
  if (node.type === "Component") {
    return wrapWithGuard(emitComponent(node, aliasEnv, env), node.guard, "expression", env);
  }
  if (node.type === "Text") {
    return `<>${emitNodeInJsx(node, aliasEnv, env)}</>`;
  }
  return emitNodeInJsx(node, aliasEnv, env);
}

function emitInputsType(inputs: InputsDecl | undefined, flavor: "jsx" | "tsx"): string {
  if (flavor === "tsx") {
    return emitTsInputsType(inputs);
  }
  return emitJsDocInputsType(inputs);
}

function emitJsDocInputsType(inputs?: InputsDecl): string {
  // Emit JS-safe JSDoc typedef (Rollup can parse this, and TS tooling can read it).
  if (!inputs) {
    return "/** @typedef {any} Inputs */";
  }
  if (!inputs.fields.length) {
    return "/** @typedef {{}} Inputs */";
  }

  // Build an object type like: { foo: string; bar?: number }
  const fields = inputs.fields
    .map((field) => {
      const optional = field.optional ? "?" : "";
      return `${field.name}${optional}: ${field.typeText}`;
    })
    .join("; ");

  return `/** @typedef {{ ${fields} }} Inputs */`;
}

function emitTsInputsType(inputs?: InputsDecl): string {
  if (!inputs || inputs.fields.length === 0) {
    return "export type Inputs = Record<string, never>;";
  }

  const lines = inputs.fields.map((field) => {
    const optional = field.optional ? "?" : "";
    return `  ${field.name}${optional}: ${field.typeText};`;
  });

  return ["export interface Inputs {", ...lines, "}"].join("\n");
}

function emitInputsPrelude(inputsDecls?: Array<{ name: string; kind: any }>): string | null {
  if (!inputsDecls || inputsDecls.length === 0) {
    return null;
  }
  const names = inputsDecls.map((decl) => decl.name);
  return `const { ${names.join(", ")} } = __inputs ?? {};`;
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
