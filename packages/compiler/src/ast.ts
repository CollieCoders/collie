export interface RootNode {
  type: "Root";
  children: Node[];
  props?: PropsDecl;
}

export type Node = ElementNode | TextNode | ExpressionNode | IfNode;

export interface ElementNode {
  type: "Element";
  name: string;
  classes: string[];
  children: Node[];
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

export interface IfNode {
  type: "If";
  test: string;
  consequent: Node[];
  alternate?: Node[];
}

export interface PropsDecl {
  fields: PropsField[];
}

export interface PropsField {
  name: string;
  optional: boolean;
  typeText: string;
}
