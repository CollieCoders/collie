import { ElementNode, ExpressionNode, RootNode, TextNode } from "./ast";
import { Diagnostic, DiagnosticCode, createSpan } from "./diagnostics";

export interface ParseResult {
  root: RootNode;
  diagnostics: Diagnostic[];
}

interface StackItem {
  node: RootNode | ElementNode;
  level: number;
}

const ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9_-]*/;
const CLASS_NAME = /^[A-Za-z0-9_-]+/;

export function parse(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const root: RootNode = { type: "Root", children: [] };
  const stack: StackItem[] = [{ node: root, level: -1 }];

  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    const lineOffset = offset;
    offset += rawLine.length + 1;

    if (/^\s*$/.test(rawLine)) {
      continue;
    }

    const tabIndex = rawLine.indexOf("\t");
    if (tabIndex !== -1) {
      pushDiag(
        diagnostics,
        "COLLIE001",
        "Tabs are not allowed; use spaces for indentation.",
        lineNumber,
        tabIndex + 1,
        lineOffset
      );
      continue;
    }

    const indentMatch = rawLine.match(/^\s*/) ?? [""];
    const indent = indentMatch[0].length;
    const lineContent = rawLine.slice(indent);
    const trimmed = lineContent.trimEnd();

    if (indent % 2 !== 0) {
      pushDiag(
        diagnostics,
        "COLLIE002",
        "Indentation must be multiples of two spaces.",
        lineNumber,
        indent + 1,
        lineOffset
      );
      continue;
    }

    let level = indent / 2;

    const top = stack[stack.length - 1];
    if (level > top.level + 1) {
      pushDiag(
        diagnostics,
        "COLLIE003",
        "Indentation jumped more than one level.",
        lineNumber,
        indent + 1,
        lineOffset
      );
      level = top.level + 1;
    }

    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;

    if (lineContent.startsWith("|")) {
      const textNode = parseTextLine(lineContent, lineNumber, indent + 1, lineOffset, diagnostics);
      if (textNode) {
        parent.children.push(textNode);
      }
      continue;
    }

    if (lineContent.startsWith("{{")) {
      const exprNode = parseExpressionLine(lineContent, lineNumber, indent + 1, lineOffset, diagnostics);
      if (exprNode) {
        parent.children.push(exprNode);
      }
      continue;
    }

    const element = parseElement(trimmed, lineNumber, indent + 1, lineOffset, diagnostics);
    if (!element) {
      continue;
    }

    parent.children.push(element);
    stack.push({ node: element, level });
  }

  return { root, diagnostics };
}

function parseTextLine(
  lineContent: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): TextNode | null {
  const trimmed = lineContent.trimEnd();
  let payload = trimmed.slice(1);
  let payloadColumn = column + 1;

  if (payload.startsWith(" ")) {
    payload = payload.slice(1);
    payloadColumn += 1;
  }

  const parts: TextNode["parts"] = [];
  let cursor = 0;

  while (cursor < payload.length) {
    const exprStart = payload.indexOf("{{", cursor);
    if (exprStart === -1) {
      const text = payload.slice(cursor);
      if (text.length) {
        parts.push({ type: "text", value: text });
      }
      break;
    }

    if (exprStart > cursor) {
      parts.push({ type: "text", value: payload.slice(cursor, exprStart) });
    }

    const exprEnd = payload.indexOf("}}", exprStart + 2);
    if (exprEnd === -1) {
      pushDiag(
        diagnostics,
        "COLLIE005",
        "Inline expression must end with }}.",
        lineNumber,
        payloadColumn + exprStart,
        lineOffset
      );
      const remainder = payload.slice(exprStart);
      if (remainder.length) {
        parts.push({ type: "text", value: remainder });
      }
      break;
    }

    const inner = payload.slice(exprStart + 2, exprEnd).trim();
    if (!inner) {
      pushDiag(
        diagnostics,
        "COLLIE005",
        "Inline expression cannot be empty.",
        lineNumber,
        payloadColumn + exprStart,
        lineOffset,
        exprEnd - exprStart
      );
    } else {
      parts.push({ type: "expr", value: inner });
    }

    cursor = exprEnd + 2;
  }

  return { type: "Text", parts };
}

function parseExpressionLine(
  line: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ExpressionNode | null {
  const trimmed = line.trimEnd();
  const closeIndex = trimmed.indexOf("}}");
  if (closeIndex === -1) {
    pushDiag(
      diagnostics,
      "COLLIE005",
      "Expression lines must end with }}.",
      lineNumber,
      column,
      lineOffset
    );
    return null;
  }

  if (trimmed.slice(closeIndex + 2).trim().length) {
    pushDiag(
      diagnostics,
      "COLLIE005",
      "Expression lines cannot contain text after the closing }}.",
      lineNumber,
      column + closeIndex + 2,
      lineOffset
    );
    return null;
  }

  const inner = trimmed.slice(2, closeIndex).trim();
  if (!inner) {
    pushDiag(
      diagnostics,
      "COLLIE005",
      "Expression cannot be empty.",
      lineNumber,
      column,
      lineOffset,
      closeIndex + 2
    );
    return null;
  }

  return { type: "Expression", value: inner };
}

function parseElement(
  line: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ElementNode | null {
  const nameMatch = line.match(ELEMENT_NAME);
  if (!nameMatch) {
    pushDiag(
      diagnostics,
      "COLLIE004",
      "Element lines must start with a valid tag or component name.",
      lineNumber,
      column,
      lineOffset,
      line.length
    );
    return null;
  }

  const name = nameMatch[0];
  let rest = line.slice(name.length);
  const classes: string[] = [];

  while (rest.length > 0) {
    if (!rest.startsWith(".")) {
      pushDiag(
        diagnostics,
        "COLLIE004",
        "Element lines may only contain .class shorthands after the tag name.",
        lineNumber,
        column + name.length,
        lineOffset
      );
      return null;
    }

    rest = rest.slice(1);
    const classMatch = rest.match(CLASS_NAME);
    if (!classMatch) {
      pushDiag(
        diagnostics,
        "COLLIE004",
        "Class names must contain only letters, numbers, underscores, or hyphens.",
        lineNumber,
        column + name.length + 1,
        lineOffset
      );
      return null;
    }

    classes.push(classMatch[0]);
    rest = rest.slice(classMatch[0].length);
  }

  return {
    type: "Element",
    name,
    classes,
    children: []
  };
}

function pushDiag(
  diagnostics: Diagnostic[],
  code: DiagnosticCode,
  message: string,
  line: number,
  column: number,
  lineOffset: number,
  length = 1
): void {
  diagnostics.push({
    severity: "error",
    code,
    message,
    span: createSpan(line, column, Math.max(length, 1), lineOffset)
  });
}
