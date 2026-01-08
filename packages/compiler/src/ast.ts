import type { SourceSpan } from "./diagnostics.ts";

export interface ClassAliasDecl {
  name: string;
  classes: string[];
  span?: SourceSpan;
}

export interface ClassAliasesDecl {
  aliases: ClassAliasDecl[];
}

export type InputDeclKind = "value" | "fn";

export interface InputDecl {
  name: string;
  kind: InputDeclKind;
  span?: SourceSpan;   // span for the decl (at least name)
}

export interface RootNode {
  type: "Root";
  children: Node[];
  inputs?: InputsDecl;
  inputsDecls?: InputDecl[];
  classAliases?: ClassAliasesDecl;
  clientComponent?: boolean;
  id?: string;
  rawId?: string;
  idToken?: string;
  idTokenSpan?: SourceSpan;
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
  guardSpan?: SourceSpan;
}

export interface ComponentNode {
  type: "Component";
  name: string;
  attributes: Attribute[];
  children: Node[];
  slots?: SlotBlock[];
  guard?: string;
  guardSpan?: SourceSpan;
}

export interface ForNode {
  type: "For";
  itemName: string;
  arrayExpr: string;
  body: Node[];
  token?: string;
  tokenSpan?: SourceSpan;
  arrayExprSpan?: SourceSpan;
}

export interface JSXPassthroughNode {
  type: "JSXPassthrough";
  expression: string;
  span?: SourceSpan;
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
  span?: SourceSpan;
}

export interface ExpressionNode {
  type: "Expression";
  value: string;
  span?: SourceSpan;
}

export interface ConditionalBranch {
  kind?: "if" | "elseIf" | "else";
  test?: string;
  body: Node[];
  token?: string;
  tokenSpan?: SourceSpan;
  testSpan?: SourceSpan;
}

export interface ConditionalNode {
  type: "Conditional";
  branches: ConditionalBranch[];
}

export interface InputsDecl {
  fields: InputsField[];
}

export interface InputsField {
  name: string;
  optional: boolean;
  typeText: string;
  span?: SourceSpan;
}

export interface SlotBlock {
  type: "Slot";
  name: string;
  children: Node[];
}
