import type { SourceSpan } from "./diagnostics";

export interface ClassAliasDecl {
  name: string;
  classes: string[];
  span?: SourceSpan;
}

export interface ClassAliasesDecl {
  aliases: ClassAliasDecl[];
}

export interface RootNode {
  type: "Root";
  children: Node[];
  props?: PropsDecl;
  classAliases?: ClassAliasesDecl;
  clientComponent?: boolean;
  id?: string;
  rawId?: string;
}

export type Node = ElementNode | TextNode | ExpressionNode | ConditionalNode | ForNode | ComponentNode | JSXPassthroughNode;

export interface Attribute {
  name: string;
  value: string | null;
}

export interface ElementNode {
  type: "Element";
  name: string;
  classes: string[];
  classSpans?: SourceSpan[];
  attributes: Attribute[];
  children: Node[];
  guard?: string;
}

export interface ComponentNode {
  type: "Component";
  name: string;
  attributes: Attribute[];
  children: Node[];
  slots?: SlotBlock[];
  guard?: string;
}

export interface ForNode {
  type: "For";
  itemName: string;
  arrayExpr: string;
  body: Node[];
}

export interface JSXPassthroughNode {
  type: "JSXPassthrough";
  expression: string;
}

export interface TextNode {
  type: "Text";
  parts: TextPart[];
}

export type TextPart = TextChunk | TextExprPart;

export interface TextChunk {
  type: "text";
  value: string;
}

export interface TextExprPart {
  type: "expr";
  value: string;
}

export interface ExpressionNode {
  type: "Expression";
  value: string;
}

export interface ConditionalBranch {
  test?: string;
  body: Node[];
}

export interface ConditionalNode {
  type: "Conditional";
  branches: ConditionalBranch[];
}

export interface PropsDecl {
  fields: PropsField[];
}

export interface PropsField {
  name: string;
  optional: boolean;
  typeText: string;
}

export interface SlotBlock {
  type: "Slot";
  name: string;
  children: Node[];
}
