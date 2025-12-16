import { ElementNode, ExpressionNode, Node, PropsDecl, RootNode, TextNode } from "./ast";

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

  const parts: string[] = [];

  if (root.props) {
    parts.push(emitPropsType(root.props));
  }

  const propsAnnotation = root.props ? ": Props" : "";
  parts.push(
    [`export default function ${componentName}(props${propsAnnotation}) {`, `  return ${jsx};`, `}`].join("\n")
  );

  return parts.join("\n\n");
}

function emitNode(node: Node): string {
  if (node.type === "Text") {
    return emitText(node);
  }

  if (node.type === "Expression") {
    return emitExpression(node);
  }

  return emitElement(node);
}

function emitElement(node: ElementNode): string {
  const classAttr = node.classes.length ? ` className="${node.classes.join(" ")}"` : "";
  const children = node.children.map((child) => emitNode(child)).join("");
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

function emitExpression(node: ExpressionNode): string {
  return `{${node.value}}`;
}

function emitPropsType(props: PropsDecl): string {
  if (!props.fields.length) {
    return "export type Props = {};";
  }

  const fieldLines = props.fields.map((field) => {
    const optional = field.optional ? "?" : "";
    return `  ${field.name}${optional}: ${field.typeText};`;
  });

  return ["export type Props = {", ...fieldLines, "};"].join("\n");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
