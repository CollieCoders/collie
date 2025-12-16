import { ElementNode, RootNode, TextNode } from "./ast";
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
      const textNode = createTextNode(lineContent);
      parent.children.push(textNode);
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

function createTextNode(trimmedLine: string): TextNode {
  const afterPipe = trimmedLine.slice(1);
  const value = afterPipe.startsWith(" ") ? afterPipe.slice(1) : afterPipe;
  return { type: "Text", value };
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
