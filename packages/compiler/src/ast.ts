export interface RootNode {
  type: "Root";
  children: Node[];
}

export type Node = ElementNode | TextNode;

export interface ElementNode {
  type: "Element";
  name: string;
  classes: string[];
  children: Node[];
}

export interface TextNode {
  type: "Text";
  value: string;
}
