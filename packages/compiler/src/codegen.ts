import { ElementNode, Node, RootNode, TextNode } from "./ast";

export interface CodegenOptions {
  componentName: string;
}

export function generateModule(root: RootNode, options: CodegenOptions): string {
  const { componentName } = options;

  let jsx: string;
  if (root.children.length === 0) {
    jsx = "null";
  } else if (root.children.length === 1) {
    const only = root.children[0];
    if (only.type === "Text") {
      jsx = `<>${emitNode(only)}</>`;
    } else {
      jsx = emitNode(only);
    }
  } else {
    jsx = `<>${root.children.map((child) => emitNode(child)).join("")}</>`;
  }

  return [
    `export default function ${componentName}(props) {`,
    `  return ${jsx};`,
    `}`
  ].join("\n");
}

function emitNode(node: Node): string {
  if (node.type === "Text") {
    return emitText(node);
  }

  return emitElement(node);
}

function emitElement(node: ElementNode): string {
  const classAttr = node.classes.length ? ` className="${node.classes.join(" ")}"` : "";
  const children = node.children.map((child) => emitNode(child)).join("");
  return `<${node.name}${classAttr}>${children}</${node.name}>`;
}

function emitText(node: TextNode): string {
  return escapeText(node.value);
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
