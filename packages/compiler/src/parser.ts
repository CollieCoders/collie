import type {
  Attribute,
  ClassAliasDecl,
  ClassAliasesDecl,
  ComponentNode,
  ConditionalBranch,
  ConditionalNode,
  ElementNode,
  ExpressionNode,
  ForNode,
  JSXPassthroughNode,
  Node,
  InputDecl,
  InputsField,
  RootNode,
  SlotBlock,
  TextNode
} from "./ast.ts";
import type { NormalizedCollieDialectOptions } from "@collie-lang/config";
import { type Diagnostic, type DiagnosticCode, type SourceSpan, createSpan } from "./diagnostics.ts";
import { enforceDialect } from "./dialect.ts";

export interface TemplateUnit {
  id: string;
  rawId: string;
  span?: SourceSpan;
  ast: RootNode;
  diagnostics: Diagnostic[];
}

export interface ParseResult {
  templates: TemplateUnit[];
  diagnostics: Diagnostic[];
}

export interface ParseOptions {
  dialect?: NormalizedCollieDialectOptions;
}

interface ConditionalBranchContext {
  kind: "ConditionalBranch";
  owner: ConditionalNode;
  branch: ConditionalBranch;
  children: Node[];
}

interface SlotContext {
  kind: "Slot";
  owner: ComponentNode;
  slot: SlotBlock;
  children: Node[];
}

type ParentNode = RootNode | ElementNode | ComponentNode | ForNode | ConditionalBranchContext | SlotContext;

interface StackItem {
  node: ParentNode;
  level: number;
}

interface BranchLocation {
  branch: ConditionalBranch;
  line: number;
  column: number;
  lineOffset: number;
  length: number;
}

interface ConditionalChainState {
  node: ConditionalNode;
  level: number;
  hasElse: boolean;
}

const ELEMENT_NAME = /^[A-Za-z][A-Za-z0-9_-]*/;
const CLASS_NAME = /^[A-Za-z0-9_$-]+/;
const TEMPLATE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]*$/;

function getIndentLevel(line: string): number {
  const match = line.match(/^\s*/);
  return match ? match[0].length / 2 : 0;
}

function getIdValueSpan(
  lineContent: string,
  indent: number,
  lineNumber: number,
  lineOffset: number,
  tokenLength: number,
  valueLength: number
): SourceSpan | undefined {
  if (valueLength <= 0) {
    return undefined;
  }

  let cursor = tokenLength;
  while (cursor < lineContent.length && /\s/.test(lineContent[cursor])) {
    cursor++;
  }
  if (lineContent[cursor] === ":" || lineContent[cursor] === "=") {
    cursor++;
    while (cursor < lineContent.length && /\s/.test(lineContent[cursor])) {
      cursor++;
    }
  }

  const column = indent + cursor + 1;
  return createSpan(lineNumber, column, valueLength, lineOffset);
}

interface TemplateHeader {
  id: string;
  rawId: string;
  span?: SourceSpan;
  bodyStartIndex: number;
}

export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const templates: TemplateUnit[] = [];

  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const lineOffsets = buildLineOffsets(lines);

  let currentHeader: TemplateHeader | null = null;
  let sawIdBlock = false;
  const seenIds = new Map<string, SourceSpan | undefined>();

  const finalizeTemplate = (endIndex: number): void => {
    if (!currentHeader) {
      return;
    }
    const result = parseTemplateBlock(lines, lineOffsets, currentHeader.bodyStartIndex, endIndex, options);
    const prefixedDiagnostics = prefixDiagnostics(result.diagnostics, currentHeader.id);
    const unit: TemplateUnit = {
      id: currentHeader.id,
      rawId: currentHeader.rawId,
      span: currentHeader.span,
      ast: result.root,
      diagnostics: prefixedDiagnostics
    };
    templates.push(unit);
    diagnostics.push(...prefixedDiagnostics);
    currentHeader = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    const lineOffset = lineOffsets[i];

    if (/^\s*$/.test(rawLine)) {
      continue;
    }

    const indentMatch = rawLine.match(/^\s*/) ?? [""];
    const indent = indentMatch[0].length;
    const lineContent = rawLine.slice(indent);
    const trimmed = lineContent.trimEnd();

    const idMatch = trimmed.match(/^#id\b(.*)$/);
    if (idMatch) {
      if (indent !== 0) {
        pushDiag(
          diagnostics,
          "COLLIE701",
          "#id directives must appear at the top level.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
        continue;
      }

      finalizeTemplate(i);
      sawIdBlock = true;

      const remainderRaw = idMatch[1] ?? "";
      if (remainderRaw && !/^[\s:=]/.test(remainderRaw)) {
        pushDiag(
          diagnostics,
          "COLLIE702",
          'Invalid #id directive syntax. Use "#id <id>".',
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      }
      let valuePart = remainderRaw.trim();
      if (valuePart.startsWith("=") || valuePart.startsWith(":")) {
        valuePart = valuePart.slice(1).trim();
      }

      const valueSpan = getIdValueSpan(
        lineContent,
        indent,
        lineNumber,
        lineOffset,
        "#id".length,
        valuePart.length
      );
      const valueColumn = valueSpan?.start.col ?? indent + 1;
      const valueLength = valueSpan ? valuePart.length : trimmed.length;

      if (!valuePart) {
        pushDiag(
          diagnostics,
          "COLLIE702",
          "#id directives must specify an identifier value.",
          lineNumber,
          valueColumn,
          lineOffset,
          valueLength
        );
      } else if (!TEMPLATE_ID_PATTERN.test(valuePart)) {
        pushDiag(
          diagnostics,
          "COLLIE702",
          'Invalid #id value. IDs must match "^[A-Za-z][A-Za-z0-9._-]*$".',
          lineNumber,
          valueColumn,
          lineOffset,
          valueLength
        );
      }

      if (valuePart && TEMPLATE_ID_PATTERN.test(valuePart)) {
        const previous = seenIds.get(valuePart);
        if (previous) {
          const previousLine = previous.start.line;
          pushDiag(
            diagnostics,
            "COLLIE703",
            `Duplicate #id "${valuePart}" (first declared on line ${previousLine}).`,
            lineNumber,
            valueColumn,
            lineOffset,
            valueLength
          );
        } else {
          seenIds.set(valuePart, valueSpan);
        }
      }

      currentHeader = {
        id: valuePart,
        rawId: valuePart,
        span: valueSpan,
        bodyStartIndex: i + 1
      };
      continue;
    }

    if (!sawIdBlock && !currentHeader) {
      pushDiag(
        diagnostics,
        "COLLIE701",
        "Content before the first #id block is not allowed.",
        lineNumber,
        indent + 1,
        lineOffset,
        trimmed.length
      );
    }
  }

  finalizeTemplate(lines.length);

  if (!sawIdBlock) {
    pushDiag(
      diagnostics,
      "COLLIE701",
      "A .collie file must contain at least one #id block.",
      1,
      1,
      0
    );
  }

  return { templates, diagnostics };
}

function parseTemplateBlock(
  lines: string[],
  lineOffsets: number[],
  startIndex: number,
  endIndex: number,
  options: ParseOptions
): { root: RootNode; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const root: RootNode = { type: "Root", children: [] };
  const stack: StackItem[] = [{ node: root, level: -1 }];
  let inputsBlockLevel: number | null = null;
  let classesBlockLevel: number | null = null;
  let sawTopLevelTemplateNode = false;
  const conditionalChains = new Map<number, ConditionalChainState>();
  const branchLocations: BranchLocation[] = [];

  let i = startIndex;

  while (i < endIndex) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    const lineOffset = lineOffsets[i];
    i++;

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

    if (inputsBlockLevel !== null && level <= inputsBlockLevel) {
      inputsBlockLevel = null;
    }
    if (classesBlockLevel !== null && level <= classesBlockLevel) {
      classesBlockLevel = null;
    }

    const isInInputsBlock = inputsBlockLevel !== null && level > inputsBlockLevel;
    const isInClassesBlock = classesBlockLevel !== null && level > classesBlockLevel;

    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parentLevel = stack[stack.length - 1].level;
    if (level > parentLevel + 1 && !isInInputsBlock && !isInClassesBlock) {
      pushDiag(
        diagnostics,
        "COLLIE003",
        "Indentation jumped more than one level.",
        lineNumber,
        indent + 1,
        lineOffset
      );
      level = parentLevel + 1;
    }

    cleanupConditionalChains(conditionalChains, level);
    const isElseIfLine = /^@elseIf\b/.test(trimmed);
    const isElseLine = /^@else\b/.test(trimmed) && !isElseIfLine;
    if (!isElseIfLine && !isElseLine) {
      conditionalChains.delete(level);
    }

    if (trimmed === "#classes") {
      if (level !== 0) {
        pushDiag(
          diagnostics,
          "COLLIE301",
          "#classes block must be at the top level.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      } else if (sawTopLevelTemplateNode) {
        pushDiag(
          diagnostics,
          "COLLIE302",
          "#classes block must appear before any template nodes.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      } else {
        if (!root.classAliases) {
          root.classAliases = { aliases: [] };
        }
        classesBlockLevel = level;
      }
      continue;
    }

    if (trimmed === "#inputs") {
      if (level !== 0) {
        pushDiag(
          diagnostics,
          "COLLIE102",
          "#inputs block must be at the top level.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      } else if (root.inputs) {
        pushDiag(
          diagnostics,
          "COLLIE101",
          "Only one #inputs block is allowed per #id.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      } else {
        root.inputs = { fields: [] };
      }
      if (level === 0) {
        if (!root.inputsDecls) {
          root.inputsDecls = [];
        }
        inputsBlockLevel = level;
      }
      continue;
    }

    if (trimmed === "@client") {
      if (level !== 0) {
        pushDiag(
          diagnostics,
          "COLLIE401",
          "@client must appear at the top level before any other blocks.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      } else if (sawTopLevelTemplateNode) {
        pushDiag(
          diagnostics,
          "COLLIE401",
          "@client must appear before any template nodes.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      } else if (root.clientComponent) {
        pushDiag(
          diagnostics,
          "COLLIE402",
          "@client can only appear once per file.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      } else {
        root.clientComponent = true;
      }
      continue;
    }

    if (inputsBlockLevel !== null && level > inputsBlockLevel) {
      if (level !== inputsBlockLevel + 1) {
        pushDiag(
          diagnostics,
          "COLLIE102",
          "#inputs lines must be indented two spaces under the #inputs header.",
          lineNumber,
          indent + 1,
          lineOffset
        );
        continue;
      }

      const decl = parseInputDecl(lineContent, lineNumber, indent + 1, lineOffset, diagnostics);
      if (decl && root.inputsDecls) {
        // Check for duplicates
        const existing = root.inputsDecls.find((d) => d.name === decl.name);
        if (existing) {
          pushDiag(
            diagnostics,
            "COLLIE106",
            `Duplicate input declaration "${decl.name}".`,
            lineNumber,
            indent + 1,
            lineOffset,
            trimmed.length
          );
        } else {
          root.inputsDecls.push(decl);
        }
      }
      continue;
    }

    if (classesBlockLevel !== null && level > classesBlockLevel) {
      if (level !== classesBlockLevel + 1) {
        pushDiag(
          diagnostics,
          "COLLIE303",
          "Classes lines must be indented two spaces under the #classes header.",
          lineNumber,
          indent + 1,
          lineOffset
        );
        continue;
      }

      const alias = parseClassAliasLine(trimmed, lineNumber, indent + 1, lineOffset, diagnostics);
      if (alias && root.classAliases) {
        root.classAliases.aliases.push(alias);
      }
      continue;
    }

    const parent = stack[stack.length - 1].node;

    if (trimmed.startsWith("@for")) {
      const forHeader = parseForHeader(
        lineContent,
        lineNumber,
        indent + 1,
        lineOffset,
        diagnostics
      );
      if (!forHeader) {
        continue;
      }
      const forNode: ForNode = {
        type: "For",
        itemName: forHeader.itemName,
        arrayExpr: forHeader.arrayExpr,
        body: [],
        token: forHeader.token,
        tokenSpan: forHeader.tokenSpan,
        arrayExprSpan: forHeader.arrayExprSpan
      };
      addChildToParent(parent, forNode);
      if (parent === root) {
        sawTopLevelTemplateNode = true;
      }
      stack.push({ node: forNode, level });
      continue;
    }

    if (trimmed.startsWith("@if")) {
      const header = parseConditionalHeader(
        "if",
        lineContent,
        lineNumber,
        indent + 1,
        lineOffset,
        diagnostics
      );
      if (!header) {
        continue;
      }
      const chain: ConditionalNode = { type: "Conditional", branches: [] };
      const branch: ConditionalBranch = {
        kind: "if",
        test: header.test,
        body: [],
        token: header.token,
        tokenSpan: header.tokenSpan,
        testSpan: header.testSpan
      };
      chain.branches.push(branch);
      addChildToParent(parent, chain);
      if (parent === root) {
        sawTopLevelTemplateNode = true;
      }
      conditionalChains.set(level, { node: chain, level, hasElse: false });
      branchLocations.push({
        branch,
        line: lineNumber,
        column: indent + 1,
        lineOffset,
        length: header.directiveLength
      });
      if (header.inlineBody) {
        const inlineNode = parseInlineNode(
          header.inlineBody,
          lineNumber,
          header.inlineColumn ?? indent + 1,
          lineOffset,
          diagnostics
        );
        if (inlineNode) {
          branch.body.push(inlineNode);
        }
      } else {
        stack.push({ node: createConditionalBranchContext(chain, branch), level });
      }
      continue;
    }

    if (isElseIfLine) {
      const chain = conditionalChains.get(level);
      if (!chain) {
        pushDiag(
          diagnostics,
          "COLLIE205",
          "@elseIf must follow an @if at the same indentation level.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
        continue;
      }
      if (chain.hasElse) {
        pushDiag(
          diagnostics,
          "COLLIE207",
          "@elseIf cannot appear after an @else in the same chain.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
        continue;
      }
      const header = parseConditionalHeader(
        "elseIf",
        lineContent,
        lineNumber,
        indent + 1,
        lineOffset,
        diagnostics
      );
      if (!header) {
        continue;
      }
      const branch: ConditionalBranch = {
        kind: "elseIf",
        test: header.test,
        body: [],
        token: header.token,
        tokenSpan: header.tokenSpan,
        testSpan: header.testSpan
      };
      chain.node.branches.push(branch);
      branchLocations.push({
        branch,
        line: lineNumber,
        column: indent + 1,
        lineOffset,
        length: header.directiveLength
      });
      if (header.inlineBody) {
        const inlineNode = parseInlineNode(
          header.inlineBody,
          lineNumber,
          header.inlineColumn ?? indent + 1,
          lineOffset,
          diagnostics
        );
        if (inlineNode) {
          branch.body.push(inlineNode);
        }
      } else {
        stack.push({ node: createConditionalBranchContext(chain.node, branch), level });
      }
      continue;
    }

    if (isElseLine) {
      const chain = conditionalChains.get(level);
      if (!chain) {
        pushDiag(
          diagnostics,
          "COLLIE206",
          "@else must follow an @if at the same indentation level.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
        continue;
      }
      if (chain.hasElse) {
        pushDiag(
          diagnostics,
          "COLLIE203",
          "An @if chain can only have one @else branch.",
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
        continue;
      }
      const header = parseElseHeader(lineContent, lineNumber, indent + 1, lineOffset, diagnostics);
      if (!header) {
        continue;
      }
      const branch: ConditionalBranch = {
        kind: "else",
        test: undefined,
        body: [],
        token: header.token,
        tokenSpan: header.tokenSpan
      };
      chain.node.branches.push(branch);
      chain.hasElse = true;
      branchLocations.push({
        branch,
        line: lineNumber,
        column: indent + 1,
        lineOffset,
        length: header.directiveLength
      });
      if (header.inlineBody) {
        const inlineNode = parseInlineNode(
          header.inlineBody,
          lineNumber,
          header.inlineColumn ?? indent + 1,
          lineOffset,
          diagnostics
        );
        if (inlineNode) {
          branch.body.push(inlineNode);
        }
      } else {
        stack.push({ node: createConditionalBranchContext(chain.node, branch), level });
      }
      continue;
    }

    const slotMatch = trimmed.match(/^@([A-Za-z_][A-Za-z0-9_]*)$/);
    if (slotMatch) {
      const slotName = slotMatch[1];
      if (!isComponentNode(parent)) {
        pushDiag(
          diagnostics,
          "COLLIE501",
          `Slot '${slotName}' must be a direct child of a component.`,
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
        stack.push({ node: createStandaloneSlotContext(slotName), level });
        continue;
      }

      if (!parent.slots) {
        parent.slots = [];
      }
      const existing = parent.slots.find((slot) => slot.name === slotName);
      const slotBlock: SlotBlock =
        existing ??
        {
          type: "Slot",
          name: slotName,
          children: []
        };
      if (!existing) {
        parent.slots.push(slotBlock);
      } else {
        pushDiag(
          diagnostics,
          "COLLIE503",
          `Duplicate slot '${slotName}' inside ${parent.name}.`,
          lineNumber,
          indent + 1,
          lineOffset,
          trimmed.length
        );
      }
      stack.push({ node: createSlotContext(parent, slotBlock), level });
      continue;
    }

    if (trimmed.startsWith("@")) {
      pushDiag(
        diagnostics,
        "COLLIE502",
        "Invalid slot syntax. Use @slotName on its own line.",
        lineNumber,
        indent + 1,
        lineOffset,
        trimmed.length
      );
      const fallbackName = trimmed.slice(1).split(/\s+/)[0] || "slot";
      stack.push({ node: createStandaloneSlotContext(fallbackName), level });
      continue;
    }

    if (lineContent.startsWith("=")) {
      // Check if this starts a multiline JSX block
      const payload = lineContent.slice(1).trim();
      
      // If it's a function or expression that starts with ( or <, collect multiline content
      if (payload.endsWith("(") || payload.endsWith("<") || (i < endIndex && level < getIndentLevel(lines[i]))) {
        // Collect all indented children
        let jsxContent = payload;
        while (i < endIndex) {
          const nextRaw = lines[i];
          const nextIndent = getIndentLevel(nextRaw);
          const nextTrimmed = nextRaw.trim();
          
          // Include lines that are:
          // 1. More indented than the = line (children)
          // 2. At the same level but are just closing parens/braces
          if (nextIndent > level && nextTrimmed.length > 0) {
            jsxContent += "\n" + nextRaw;
            i++;
          } else if (nextIndent === level && /^[)\]}]+$/.test(nextTrimmed)) {
            // Include closing parens/braces at the same level
            jsxContent += "\n" + nextRaw;
            i++;
            // After the closing paren, we're done
            break;
          } else {
            break;
          }
        }
        
        const jsxNode: JSXPassthroughNode = {
          type: "JSXPassthrough",
          expression: jsxContent
        };
        addChildToParent(parent, jsxNode);
        if (parent === root) {
          sawTopLevelTemplateNode = true;
        }
        continue;
      }
      
      const jsxNode = parseJSXPassthrough(lineContent, lineNumber, indent + 1, lineOffset, diagnostics);
      if (jsxNode) {
        addChildToParent(parent, jsxNode);
        if (parent === root) {
          sawTopLevelTemplateNode = true;
        }
      }
      continue;
    }

    if (lineContent.startsWith("|")) {
      const textNode = parseTextLine(lineContent, lineNumber, indent + 1, lineOffset, diagnostics);
      if (textNode) {
        addChildToParent(parent, textNode);
        if (parent === root) {
          sawTopLevelTemplateNode = true;
        }
      }
      continue;
    }

    if (lineContent.startsWith("{{")) {
      const exprNode = parseExpressionLine(lineContent, lineNumber, indent + 1, lineOffset, diagnostics);
      if (exprNode) {
        addChildToParent(parent, exprNode);
        if (parent === root) {
          sawTopLevelTemplateNode = true;
        }
      }
      continue;
    }

    // Check if this line starts an element/component with potential multiline attributes
    let fullLine = trimmed;
    let multilineEnd = i;
    
    if (trimmed.includes("(") && !trimmed.includes(")")) {
      // Multiline attributes - collect subsequent lines
      let parenDepth = (trimmed.match(/\(/g) || []).length - (trimmed.match(/\)/g) || []).length;
      while (multilineEnd < endIndex && parenDepth > 0) {
        const nextRaw = lines[multilineEnd];
        multilineEnd++;
        fullLine += "\n" + nextRaw;
        parenDepth += (nextRaw.match(/\(/g) || []).length - (nextRaw.match(/\)/g) || []).length;
      }
      // Update i to skip the lines we consumed
      i = multilineEnd;
    }

    const elementResult = parseElementWithInfo(fullLine, lineNumber, indent + 1, lineOffset, diagnostics);
    if (!elementResult) {
      // Try parsing as text if element parsing failed
      const textNode = parseTextPayload(trimmed, lineNumber, indent + 1, lineOffset, diagnostics);
      if (textNode && textNode.parts.length > 0) {
        addChildToParent(parent, textNode);
        if (parent === root) {
          sawTopLevelTemplateNode = true;
        }
      }
      continue;
    }

    const element = elementResult.node;
    let hasIndentedAttributeLines = false;
    if ((element.type === "Element" || element.type === "Component") && element.children.length === 0) {
      const indentedAttributes = collectIndentedAttributeLines(
        lines,
        lineOffsets,
        i,
        endIndex,
        level,
        diagnostics
      );
      if (indentedAttributes.attributes.length > 0) {
        element.attributes.push(...indentedAttributes.attributes);
        hasIndentedAttributeLines = true;
      }
      i = indentedAttributes.nextIndex;
    }

    addChildToParent(parent, element);
    if (parent === root) {
      sawTopLevelTemplateNode = true;
    }
    stack.push({ node: element, level });
    if (hasIndentedAttributeLines) {
      // Treat attribute-only lines as an intermediate indent step for children.
      stack.push({ node: element, level: level + 1 });
    }
  }

  if (root.classAliases) {
    validateClassAliasDefinitions(root.classAliases, diagnostics);
  }
  validateClassAliasUsages(root, diagnostics);

  for (const info of branchLocations) {
    if (info.branch.body.length === 0) {
      pushDiag(
        diagnostics,
        "COLLIE208",
        "Conditional branches must include an inline body or indented block.",
        info.line,
        info.column,
        info.lineOffset,
        info.length || 3
      );
    }
  }

  if (options.dialect) {
    diagnostics.push(...enforceDialect(root, options.dialect));
  }

  return { root, diagnostics };
}

function buildLineOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}

function prefixDiagnostics(diagnostics: Diagnostic[], templateId?: string): Diagnostic[] {
  if (!templateId) {
    return diagnostics;
  }
  const prefix = `In template "${templateId}": `;
  return diagnostics.map((diag) => {
    if (diag.message.startsWith(prefix)) {
      return diag;
    }
    return { ...diag, message: `${prefix}${diag.message}` };
  });
}

function cleanupConditionalChains(state: Map<number, ConditionalChainState>, level: number): void {
  for (const key of Array.from(state.keys())) {
    if (key > level) {
      state.delete(key);
    }
  }
}

function addChildToParent(parent: ParentNode, child: Node): void {
  if (isForParent(parent)) {
    parent.body.push(child);
  } else {
    parent.children.push(child);
  }
}

function isForParent(parent: ParentNode): parent is ForNode {
  return "type" in parent && parent.type === "For";
}

function isComponentNode(parent: ParentNode): parent is ComponentNode {
  return "type" in parent && parent.type === "Component";
}

interface ConditionalHeaderResult {
  test?: string;
  inlineBody?: string;
  inlineColumn?: number;
  directiveLength: number;
  token: string;
  tokenSpan?: SourceSpan;
  testSpan?: SourceSpan;
}

function parseConditionalHeader(
  kind: "if" | "elseIf",
  lineContent: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ConditionalHeaderResult | null {
  const trimmed = lineContent.trimEnd();
  const token = kind === "if" ? "@if" : "@elseIf";
  if (!trimmed.startsWith(token)) {
    pushDiag(
      diagnostics,
      "COLLIE201",
      kind === "if" ? "Invalid @if syntax. Use @if (condition)." : "Invalid @elseIf syntax. Use @elseIf (condition).",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || token.length
    );
    return null;
  }
  const tokenSpan = createSpan(lineNumber, column, token.length, lineOffset);
  const remainder = trimmed.slice(token.length);
  if (!remainder.trim()) {
    pushDiag(
      diagnostics,
      "COLLIE201",
      kind === "if" ? "@if condition cannot be empty." : "@elseIf condition cannot be empty.",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || token.length
    );
    return null;
  }

  const remainderTrimmed = remainder.trimStart();
  const usesParens = remainderTrimmed.startsWith("(");
  
  // Require parentheses
  if (!usesParens) {
    pushDiag(
      diagnostics,
      "COLLIE211",
      kind === "if" ? "@if requires parentheses: @if (condition)" : "@elseIf requires parentheses: @elseIf (condition)",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || token.length
    );
    return null;
  }
  
  let testRaw = "";
  let remainderRaw = "";

  const openIndex = trimmed.indexOf("(", token.length);
  const closeIndex = trimmed.lastIndexOf(")");
  if (openIndex === -1 || closeIndex <= openIndex) {
    pushDiag(
      diagnostics,
      "COLLIE212",
      kind === "if" ? "Unclosed parentheses in @if ( ... )" : "Unclosed parentheses in @elseIf ( ... )",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || token.length
    );
    return null;
  }
  testRaw = trimmed.slice(openIndex + 1, closeIndex);
  remainderRaw = trimmed.slice(closeIndex + 1);

  const test = testRaw.trim();
  if (!test) {
    pushDiag(
      diagnostics,
      "COLLIE201",
      kind === "if" ? "@if condition cannot be empty." : "@elseIf condition cannot be empty.",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 3
    );
    return null;
  }
  const testLeadingWhitespace = testRaw.length - testRaw.trimStart().length;
  const testColumn = usesParens
    ? column + trimmed.indexOf("(", token.length) + 1 + testLeadingWhitespace
    : column + token.length + (remainder.length - remainder.trimStart().length) + testLeadingWhitespace;
  const testSpan = createSpan(lineNumber, testColumn, test.length, lineOffset);
  const inlineBody = remainderRaw.trim();
  const remainderOffset = trimmed.length - remainderRaw.length;
  const leadingWhitespace = remainderRaw.length - inlineBody.length;
  const inlineColumn =
    inlineBody.length > 0 ? column + remainderOffset + leadingWhitespace : undefined;
  return {
    test,
    inlineBody: inlineBody.length ? inlineBody : undefined,
    inlineColumn,
    directiveLength: trimmed.length || 3,
    token,
    tokenSpan,
    testSpan
  };
}

function parseElseHeader(
  lineContent: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ConditionalHeaderResult | null {
  const trimmed = lineContent.trimEnd();
  const match = trimmed.match(/^@else\b(.*)$/);
  if (!match) {
    pushDiag(
      diagnostics,
      "COLLIE203",
      "Invalid @else syntax.",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  const token = "@else";
  const tokenSpan = createSpan(lineNumber, column, token.length, lineOffset);
  const remainderRaw = match[1] ?? "";
  const remainderTrimmed = remainderRaw.trim();
  
  // Reject @else with condition (parentheses)
  if (remainderTrimmed.startsWith("(")) {
    pushDiag(
      diagnostics,
      "COLLIE213",
      "@else does not accept a condition",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  
  const inlineBody = remainderTrimmed;
  const remainderOffset = trimmed.length - remainderRaw.length;
  const leadingWhitespace = remainderRaw.length - inlineBody.length;
  const inlineColumn =
    inlineBody.length > 0 ? column + remainderOffset + leadingWhitespace : undefined;
  return {
    inlineBody: inlineBody.length ? inlineBody : undefined,
    inlineColumn,
    directiveLength: trimmed.length || 4,
    token,
    tokenSpan
  };
}

interface ForHeaderResult {
  itemName: string;
  arrayExpr: string;
  token: string;
  tokenSpan?: SourceSpan;
  arrayExprSpan?: SourceSpan;
}

function parseForHeader(
  lineContent: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ForHeaderResult | null {
  const trimmed = lineContent.trimEnd();
  const token = "@for";
  
  if (!trimmed.startsWith(token)) {
    pushDiag(
      diagnostics,
      "COLLIE210",
      "Invalid @for syntax. Use @for (item in array).",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  
  const tokenSpan = createSpan(lineNumber, column, token.length, lineOffset);
  const remainder = trimmed.slice(token.length).trimStart();
  
  // Require parentheses
  if (!remainder.startsWith("(")) {
    pushDiag(
      diagnostics,
      "COLLIE211",
      "@for requires parentheses: @for (item in array)",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  
  const openIndex = trimmed.indexOf("(", token.length);
  const closeIndex = trimmed.lastIndexOf(")");
  
  if (openIndex === -1 || closeIndex <= openIndex) {
    pushDiag(
      diagnostics,
      "COLLIE212",
      "Unclosed parentheses in @for ( ... )",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  
  const content = trimmed.slice(openIndex + 1, closeIndex).trim();
  const match = content.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+)$/);
  
  if (!match) {
    pushDiag(
      diagnostics,
      "COLLIE210",
      "Invalid @for syntax. Use @for (item in array).",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  
  const itemName = match[1];
  const arrayExprRaw = match[2];
  
  if (!itemName || !arrayExprRaw) {
    pushDiag(
      diagnostics,
      "COLLIE210",
      "Invalid @for syntax. Use @for (item in array).",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  
  const arrayExpr = arrayExprRaw.trim();
  if (!arrayExpr) {
    pushDiag(
      diagnostics,
      "COLLIE210",
      "@for array expression cannot be empty.",
      lineNumber,
      column,
      lineOffset,
      trimmed.length || 4
    );
    return null;
  }
  
  const arrayExprLeadingWhitespace = arrayExprRaw.length - arrayExprRaw.trimStart().length;
  const contentStart = openIndex + 1;
  const arrayExprStartInContent = content.length - arrayExprRaw.length;
  const arrayExprColumn = column + contentStart + arrayExprStartInContent + arrayExprLeadingWhitespace;
  const arrayExprSpan = createSpan(lineNumber, arrayExprColumn, arrayExpr.length, lineOffset);
  
  return { itemName, arrayExpr, token, tokenSpan, arrayExprSpan };
}

function parseInlineNode(
  source: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): Node | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("|")) {
    return parseTextLine(trimmed, lineNumber, column, lineOffset, diagnostics);
  }

  if (trimmed.startsWith("{{")) {
    return parseExpressionLine(trimmed, lineNumber, column, lineOffset, diagnostics);
  }

  if (trimmed.startsWith("@")) {
    pushDiag(
      diagnostics,
      "COLLIE209",
      "Inline conditional bodies may only contain elements, text, or expressions.",
      lineNumber,
      column,
      lineOffset,
      trimmed.length
    );
    return null;
  }

  return parseElement(trimmed, lineNumber, column, lineOffset, diagnostics);
}

function createConditionalBranchContext(
  owner: ConditionalNode,
  branch: ConditionalBranch
): ConditionalBranchContext {
  return {
    kind: "ConditionalBranch",
    owner,
    branch,
    children: branch.body
  };
}

function createSlotContext(owner: ComponentNode, slot: SlotBlock): SlotContext {
  return {
    kind: "Slot",
    owner,
    slot,
    children: slot.children
  };
}

function createStandaloneSlotContext(name: string): SlotContext {
  const owner: ComponentNode = {
    type: "Component",
    name: "__invalid_slot__",
    attributes: [],
    children: []
  };
  const slot: SlotBlock = { type: "Slot", name, children: [] };
  return createSlotContext(owner, slot);
}

function parseTextLine(
  lineContent: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): TextNode | null {
  const trimmed = lineContent.trimEnd();
  let payload = trimmed;
  let payloadColumn = column;

  if (payload.startsWith("|")) {
    payload = payload.slice(1);
    payloadColumn += 1;

    if (payload.startsWith(" ")) {
      payload = payload.slice(1);
      payloadColumn += 1;
    }
  }

  return parseTextPayload(payload, lineNumber, payloadColumn, lineOffset, diagnostics);
}

function parseTextPayload(
  payload: string,
  lineNumber: number,
  payloadColumn: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): TextNode | null {
  const parts: TextNode["parts"] = [];
  let cursor = 0;
  let textBuffer = "";

  const flushText = (): void => {
    if (textBuffer.length) {
      parts.push({ type: "text", value: textBuffer });
      textBuffer = "";
    }
  };

  while (cursor < payload.length) {
    const ch = payload[cursor];

    if (ch === "{") {
      flushText();
      if (payload[cursor + 1] === "{") {
        const exprStart = cursor;
        const exprEnd = payload.indexOf("}}", cursor + 2);
        if (exprEnd === -1) {
          pushDiag(
            diagnostics,
            "COLLIE005",
            "Inline expression must end with }}.",
            lineNumber,
            payloadColumn + exprStart,
            lineOffset
          );
          textBuffer += payload.slice(exprStart);
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
          const innerRaw = payload.slice(exprStart + 2, exprEnd);
          const leadingWhitespace = innerRaw.length - innerRaw.trimStart().length;
          const exprColumn = payloadColumn + exprStart + 2 + leadingWhitespace;
          parts.push({
            type: "expr",
            value: inner,
            span: createSpan(lineNumber, exprColumn, inner.length, lineOffset)
          });
        }
        cursor = exprEnd + 2;
        continue;
      }

      const exprStart = cursor;
      const exprEnd = payload.indexOf("}", cursor + 1);
      if (exprEnd === -1) {
        pushDiag(
          diagnostics,
          "COLLIE005",
          "Inline expression must end with }.",
          lineNumber,
          payloadColumn + exprStart,
          lineOffset
        );
        textBuffer += payload.slice(exprStart);
        break;
      }
      const inner = payload.slice(exprStart + 1, exprEnd).trim();
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
        const innerRaw = payload.slice(exprStart + 1, exprEnd);
        const leadingWhitespace = innerRaw.length - innerRaw.trimStart().length;
        const exprColumn = payloadColumn + exprStart + 1 + leadingWhitespace;
        parts.push({
          type: "expr",
          value: inner,
          span: createSpan(lineNumber, exprColumn, inner.length, lineOffset)
        });
      }
      cursor = exprEnd + 1;
      continue;
    }

    if (ch === "}") {
      flushText();
      if (payload[cursor + 1] === "}") {
        pushDiag(
          diagnostics,
          "COLLIE005",
          "Inline expression closing }} must follow an opening {{.",
          lineNumber,
          payloadColumn + cursor,
          lineOffset,
          2
        );
        cursor += 2;
        continue;
      }
      pushDiag(
        diagnostics,
        "COLLIE005",
        "Inline expression closing } must follow an opening {.",
        lineNumber,
        payloadColumn + cursor,
        lineOffset
      );
      cursor += 1;
      continue;
    }

    textBuffer += ch;
    cursor += 1;
  }

  flushText();

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
  const innerRaw = trimmed.slice(2, closeIndex);
  const leadingWhitespace = innerRaw.length - innerRaw.trimStart().length;
  const exprColumn = column + 2 + leadingWhitespace;
  return {
    type: "Expression",
    value: inner,
    span: createSpan(lineNumber, exprColumn, inner.length, lineOffset)
  };
}

function parseJSXPassthrough(
  line: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): JSXPassthroughNode | null {
  if (!line.startsWith("=")) {
    return null;
  }
  
  const payload = line.slice(1).trim();
  if (!payload) {
    pushDiag(
      diagnostics,
      "COLLIE005",
      "JSX passthrough expression cannot be empty.",
      lineNumber,
      column,
      lineOffset
    );
    return null;
  }

  const rawPayload = line.slice(1);
  const leadingWhitespace = rawPayload.length - rawPayload.trimStart().length;
  const exprColumn = column + 1 + leadingWhitespace;

  return {
    type: "JSXPassthrough",
    expression: payload,
    span: createSpan(lineNumber, exprColumn, payload.length, lineOffset)
  };
}

function parseClassAliasLine(
  line: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ClassAliasDecl | null {
  const match = line.match(/^([^=]+?)\s*=\s*(.+)$/);
  if (!match) {
    pushDiag(
      diagnostics,
      "COLLIE304",
      "Classes lines must be in the form `name = class.tokens`.",
      lineNumber,
      column,
      lineOffset,
      Math.max(line.length, 1)
    );
    return null;
  }

  const rawName = match[1].trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawName)) {
    pushDiag(
      diagnostics,
      "COLLIE305",
      `Class alias name '${rawName}' must be a valid identifier.`,
      lineNumber,
      column,
      lineOffset,
      Math.max(rawName.length, 1)
    );
    return null;
  }

  const rhs = match[2];
  const rhsIndex = line.indexOf(rhs);
  const rhsColumn = rhsIndex >= 0 ? column + rhsIndex : column;
  const classes = parseAliasClasses(rhs, lineNumber, rhsColumn, lineOffset, diagnostics);
  if (!classes.length) {
    return null;
  }

  const nameIndex = line.indexOf(rawName);
  const nameColumn = nameIndex >= 0 ? column + nameIndex : column;
  const span = createSpan(lineNumber, nameColumn, rawName.length, lineOffset);

  return { name: rawName, classes, span };
}

function parseAliasClasses(
  rhs: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): string[] {
  const trimmed = rhs.trim();
  if (!trimmed) {
    pushDiag(
      diagnostics,
      "COLLIE304",
      "Classes lines must provide one or more class tokens after '='.",
      lineNumber,
      column,
      lineOffset,
      Math.max(rhs.length, 1)
    );
    return [];
  }

  const withoutDotPrefix = trimmed.startsWith(".") ? trimmed.slice(1) : trimmed;
  const parts = withoutDotPrefix.split(".");
  const classes: string[] = [];
  for (const part of parts) {
    const token = part.trim();
    if (!token) {
      pushDiag(
        diagnostics,
        "COLLIE304",
        "Classes lines must provide one or more class tokens after '='.",
        lineNumber,
        column,
        lineOffset,
        Math.max(rhs.length, 1)
      );
      return [];
    }
    classes.push(token);
  }

  return classes;
}

function validateClassAliasDefinitions(
  classAliases: ClassAliasesDecl,
  diagnostics: Diagnostic[]
): void {
  const seen = new Map<string, ClassAliasDecl>();
  for (const alias of classAliases.aliases) {
    const previous = seen.get(alias.name);
    if (previous) {
      if (alias.span) {
        diagnostics.push({
          severity: "error",
          code: "COLLIE306",
          message: `Duplicate class alias '${alias.name}'.`,
          span: alias.span
        });
      } else {
        pushDiag(diagnostics, "COLLIE306", `Duplicate class alias '${alias.name}'.`, 1, 1, 0);
      }
      continue;
    }
    seen.set(alias.name, alias);
  }
}

function validateClassAliasUsages(root: RootNode, diagnostics: Diagnostic[]): void {
  const defined = new Set<string>(root.classAliases?.aliases.map((alias) => alias.name) ?? []);
  for (const child of root.children) {
    validateNodeClassAliases(child, defined, diagnostics);
  }
}

function validateNodeClassAliases(
  node: Node,
  defined: Set<string>,
  diagnostics: Diagnostic[]
): void {
  if (node.type === "Element" || node.type === "Component") {
    const spans = node.type === "Element" ? (node.classSpans ?? []) : [];
    const classes = node.type === "Element" ? node.classes : [];
    classes.forEach((cls, index) => {
      const match = cls.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!match) {
        return;
      }
      const aliasName = match[1];
      if (defined.has(aliasName)) {
        return;
      }
      const span = spans[index];
      if (span) {
        diagnostics.push({
          severity: "error",
          code: "COLLIE307",
          message: `Undefined class alias '${aliasName}'.`,
          span
        });
      } else {
        pushDiag(diagnostics, "COLLIE307", `Undefined class alias '${aliasName}'.`, 1, 1, 0);
      }
    });
    for (const child of node.children) {
      validateNodeClassAliases(child, defined, diagnostics);
    }
    if (node.type === "Component" && node.slots) {
      for (const slot of node.slots) {
        for (const child of slot.children) {
          validateNodeClassAliases(child, defined, diagnostics);
        }
      }
    }
    return;
  }

  if (node.type === "Conditional") {
    for (const branch of node.branches) {
      for (const child of branch.body) {
        validateNodeClassAliases(child, defined, diagnostics);
      }
    }
  }

  if (node.type === "For") {
    for (const child of node.body) {
      validateNodeClassAliases(child, defined, diagnostics);
    }
  }
}

interface ParsedElementResult {
  node: ElementNode | ComponentNode;
  hasAttributeGroup: boolean;
}

interface AttributeTokenParseResult {
  attributes: Attribute[];
  rest: string;
  restColumn: number;
}

function parseAttributeTokensFromStart(
  source: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): AttributeTokenParseResult | null {
  let remaining = source;
  let consumed = 0;
  let parsedAny = false;
  const attributes: Attribute[] = [];

  while (remaining.length > 0) {
    if (!/^([A-Za-z][A-Za-z0-9_-]*)\s*=/.test(remaining)) {
      break;
    }
    parsedAny = true;
    const before = remaining;
    const next = parseAndAddAttribute(
      remaining,
      attributes,
      diagnostics,
      lineNumber,
      column + consumed,
      lineOffset
    );
    if (next.length === before.length) {
      break;
    }
    consumed += before.length - next.length;
    remaining = next;
  }

  if (!parsedAny) {
    return null;
  }

  return {
    attributes,
    rest: remaining,
    restColumn: column + consumed
  };
}

function parseAttributeLine(
  source: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): Attribute[] | null {
  const result = parseAttributeTokensFromStart(
    source,
    lineNumber,
    column,
    lineOffset,
    diagnostics
  );
  if (!result || result.rest.length > 0) {
    return null;
  }
  return result.attributes;
}

function parseElementWithInfo(
  line: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ParsedElementResult | null {
  let name: string;
  let cursor = 0;
  let hasAttributeGroup = false;

  if (line[cursor] === ".") {
    // Implicit div shorthand (e.g. `.foo` -> `div.foo`)
    name = "div";
  } else {
    const nameMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*)/);
    if (!nameMatch) {
      // Don't push diagnostic here - let the caller handle fallback to text
      return null;
    }
    name = nameMatch[1];
    cursor = name.length;
  }

  // Check what follows the name
  const nextPart = line.slice(cursor);
  const isComponent = /^[A-Z]/.test(name);
  
  // Components must have parentheses or be at EOL
  if (isComponent && nextPart.length > 0) {
    const trimmedNext = nextPart.trimStart();
    if (trimmedNext.length > 0 && !trimmedNext.startsWith("(")) {
      // This looks like a component name but has no parentheses - probably text
      return null;
    }
  }
  
  // If it's something other than '.', '(', whitespace, or EOL, it's probably not an element
  if (cursor < line.length) {
    const nextChar = line[cursor];
    if (nextChar !== "." && nextChar !== "(" && !/\s/.test(nextChar)) {
      // This is probably text, not an element
      return null;
    }
  }

  // Parse classes (only for elements, not components)
  const classes: string[] = [];
  const classSpans: SourceSpan[] = [];

  if (!isComponent) {
    while (cursor < line.length && line[cursor] === ".") {
      cursor++; // skip the dot
      const classMatch = line.slice(cursor).match(/^([A-Za-z0-9_$-]+)/);
      if (!classMatch) {
        pushDiag(
          diagnostics,
          "COLLIE004",
          "Class names must contain only letters, numbers, underscores, hyphens, or `$` (for aliases).",
          lineNumber,
          column + cursor,
          lineOffset
        );
        return null;
      }
      const className = classMatch[1];
      classes.push(className);
      classSpans.push(createSpan(lineNumber, column + cursor, className.length, lineOffset));
      cursor += className.length;
    }
  }

  // Parse attributes if parentheses are present
  const attributes: Attribute[] = [];
  if (cursor < line.length && line[cursor] === "(") {
    const attrResult = parseAttributes(line, cursor, lineNumber, column, lineOffset, diagnostics);
    if (!attrResult) {
      return null;
    }
    attributes.push(...attrResult.attributes);
    hasAttributeGroup = true;
    cursor = attrResult.endIndex;
  }

  // Parse optional guard expression
  let guard: string | undefined;
  let guardSpan: SourceSpan | undefined;
  const guardProbeStart = cursor;
  while (cursor < line.length && /\s/.test(line[cursor])) {
    cursor++;
  }
  if (cursor < line.length && line[cursor] === "?") {
    const guardColumn = column + cursor;
    cursor++;
    const guardRaw = line.slice(cursor);
    const guardExpr = guardRaw.trim();
    if (!guardExpr) {
      pushDiag(
        diagnostics,
        "COLLIE601",
        "Guard expressions require a condition after '?'.",
        lineNumber,
        guardColumn,
        lineOffset
      );
    } else {
      guard = guardExpr;
      const leadingWhitespace = guardRaw.length - guardRaw.trimStart().length;
      const guardExprColumn = column + cursor + leadingWhitespace;
      guardSpan = createSpan(lineNumber, guardExprColumn, guardExpr.length, lineOffset);
    }
    cursor = line.length;
  } else {
    cursor = guardProbeStart;
  }

  // Parse inline text or children
  const restRaw = line.slice(cursor);
  let rest = restRaw.trimStart();
  let restColumn = column + cursor + (restRaw.length - rest.length);
  const children: Node[] = [];

  if (rest.length > 0) {
    const inlineAttrs = parseAttributeTokensFromStart(
      rest,
      lineNumber,
      restColumn,
      lineOffset,
      diagnostics
    );
    if (inlineAttrs) {
      attributes.push(...inlineAttrs.attributes);
      rest = inlineAttrs.rest;
      restColumn = inlineAttrs.restColumn;
    }

    if (rest.length > 0) {
      if (!rest.startsWith("|")) {
        pushDiag(
          diagnostics,
          "COLLIE004",
          "Inline text must start with '|'.",
          lineNumber,
          restColumn,
          lineOffset,
          Math.max(rest.length, 1)
        );
      } else {
        let payload = rest.slice(1);
        let payloadColumn = restColumn + 1;
        if (payload.startsWith(" ")) {
          payload = payload.slice(1);
          payloadColumn += 1;
        }
        const textNode = parseTextPayload(
          payload,
          lineNumber,
          payloadColumn,
          lineOffset,
          diagnostics
        );
        if (textNode) {
          children.push(textNode);
        }
      }
    }
  }

  if (isComponent) {
    const component: ComponentNode = {
      type: "Component",
      name,
      attributes,
      children
    };
    if (guard) {
      component.guard = guard;
      component.guardSpan = guardSpan;
    }
    return { node: component, hasAttributeGroup };
  } else {
    const element: ElementNode = {
      type: "Element",
      name,
      classes,
      attributes,
      children
    };
    if (classSpans.length) {
      element.classSpans = classSpans;
    }
    if (guard) {
      element.guard = guard;
      element.guardSpan = guardSpan;
    }
    return { node: element, hasAttributeGroup };
  }
}

function parseElement(
  line: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ElementNode | ComponentNode | null {
  const result = parseElementWithInfo(line, lineNumber, column, lineOffset, diagnostics);
  return result ? result.node : null;
}

function collectIndentedAttributeLines(
  lines: string[],
  lineOffsets: number[],
  startIndex: number,
  endIndex: number,
  parentLevel: number,
  diagnostics: Diagnostic[]
): { attributes: Attribute[]; nextIndex: number } {
  const attributes: Attribute[] = [];
  let index = startIndex;

  while (index < endIndex) {
    const rawLine = lines[index];
    if (/^\s*$/.test(rawLine)) {
      break;
    }
    if (rawLine.includes("\t")) {
      break;
    }
    const indentMatch = rawLine.match(/^\s*/) ?? [""];
    const indent = indentMatch[0].length;
    if (indent % 2 !== 0) {
      break;
    }
    const level = indent / 2;
    if (level !== parentLevel + 1) {
      break;
    }

    const lineContent = rawLine.slice(indent);
    const trimmed = lineContent.trimEnd();
    const leadingWhitespace = trimmed.length - trimmed.trimStart().length;
    const attrLine = trimmed.trimStart();
    if (!attrLine) {
      break;
    }

    const lineNumber = index + 1;
    const lineOffset = lineOffsets[index];
    const attrColumn = indent + 1 + leadingWhitespace;
    const lineAttributes = parseAttributeLine(
      attrLine,
      lineNumber,
      attrColumn,
      lineOffset,
      diagnostics
    );
    if (!lineAttributes) {
      break;
    }

    attributes.push(...lineAttributes);
    index++;
  }

  return { attributes, nextIndex: index };
}

interface ParseAttributesResult {
  attributes: Attribute[];
  endIndex: number;
}

function parseAttributes(
  line: string,
  startIndex: number,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): ParseAttributesResult | null {
  if (line[startIndex] !== "(") {
    return null;
  }

  const attributes: Attribute[] = [];
  let cursor = startIndex + 1;
  let depth = 1;
  let attrBuffer = "";

  // Find the matching closing parenthesis
  while (cursor < line.length && depth > 0) {
    const ch = line[cursor];
    if (ch === "(") {
      depth++;
      attrBuffer += ch;
    } else if (ch === ")") {
      depth--;
      if (depth > 0) {
        attrBuffer += ch;
      }
    } else {
      attrBuffer += ch;
    }
    cursor++;
  }

  if (depth !== 0) {
    pushDiag(
      diagnostics,
      "COLLIE004",
      "Unclosed attribute parentheses.",
      lineNumber,
      column + startIndex,
      lineOffset
    );
    return null;
  }

  // Now parse the attributes from the buffer
  const trimmedAttrs = attrBuffer.trim();
  if (trimmedAttrs.length === 0) {
    return { attributes: [], endIndex: cursor };
  }

  // Parse each attribute
  // We need to handle multiline attributes properly
  const attrLines = trimmedAttrs.split("\n");
  let currentAttr = "";
  
  for (const attrLine of attrLines) {
    const trimmedLine = attrLine.trim();
    if (trimmedLine.length === 0) continue;

    // Check if this starts a new attribute (has an = sign at the top level)
    // or continues a previous one
    const eqIndex = trimmedLine.indexOf("=");
    if (eqIndex > 0 && /^[A-Za-z][A-Za-z0-9_-]*\s*=/.test(trimmedLine)) {
      // This is a new attribute
      if (currentAttr) {
        // Parse the previous attribute
        let remaining = parseAndAddAttribute(currentAttr, attributes, diagnostics, lineNumber, column, lineOffset);
        // Process any remaining attributes from the previous line
        while (remaining) {
          remaining = parseAndAddAttribute(remaining, attributes, diagnostics, lineNumber, column, lineOffset);
        }
        currentAttr = "";
      }
      currentAttr = trimmedLine;
    } else {
      // Continuation of previous attribute
      if (currentAttr) {
        currentAttr += " " + trimmedLine;
      } else {
        // Boolean attribute
        currentAttr = trimmedLine;
      }
    }
  }

  // Parse the last attribute and any remaining inline attributes
  if (currentAttr) {
    let remaining = parseAndAddAttribute(currentAttr, attributes, diagnostics, lineNumber, column, lineOffset);
    while (remaining) {
      remaining = parseAndAddAttribute(remaining, attributes, diagnostics, lineNumber, column, lineOffset);
    }
  }

  return { attributes, endIndex: cursor };
}

// Scan brace-wrapped attribute values as a single unit, balancing nested delimiters and quoted strings.
function scanBraceAttributeValue(
  source: string,
  diagnostics: Diagnostic[],
  lineNumber: number,
  column: number,
  lineOffset: number
): { value: string; rest: string } | null {
  if (!source.startsWith("{")) {
    return null;
  }

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth++;
      continue;
    }
    if (char === "}") {
      braceDepth--;
      if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
        return { value: source.slice(0, i + 1), rest: source.slice(i + 1).trim() };
      }
      continue;
    }
    if (char === "(") {
      parenDepth++;
      continue;
    }
    if (char === ")") {
      if (parenDepth > 0) {
        parenDepth--;
      }
      continue;
    }
    if (char === "[") {
      bracketDepth++;
      continue;
    }
    if (char === "]") {
      if (bracketDepth > 0) {
        bracketDepth--;
      }
    }
  }

  pushDiag(
    diagnostics,
    "COLLIE004",
    "Unclosed brace in attribute value.",
    lineNumber,
    column,
    lineOffset
  );
  return null;
}

function parseAndAddAttribute(
  attrStr: string,
  attributes: Attribute[],
  diagnostics: Diagnostic[],
  lineNumber: number,
  column: number,
  lineOffset: number
): string {
  const trimmed = attrStr.trim();
  
  // Try to match attribute name and equals sign
  const nameMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*/);
  if (nameMatch) {
    const attrName = nameMatch[1];
    const afterEquals = trimmed.slice(nameMatch[0].length);
    
    if (afterEquals.length === 0) {
      pushDiag(
        diagnostics,
        "COLLIE004",
        `Attribute ${attrName} missing value`,
        lineNumber,
        column,
        lineOffset
      );
      return "";
    }

    const braceValue = scanBraceAttributeValue(afterEquals, diagnostics, lineNumber, column, lineOffset);
    if (braceValue) {
      attributes.push({ name: attrName, value: braceValue.value });
      return braceValue.rest;
    }

    // Extract the quoted value
    const quoteChar = afterEquals[0];
    if (quoteChar === '"' || quoteChar === "'") {
      let i = 1;
      let value = "";
      let escaped = false;
      
      while (i < afterEquals.length) {
        const char = afterEquals[i];
        
        if (escaped) {
          value += char;
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quoteChar) {
          // Found the closing quote
          attributes.push({ name: attrName, value: quoteChar + value + quoteChar });
          // Return remaining text after this attribute
          return afterEquals.slice(i + 1).trim();
        } else {
          value += char;
        }
        i++;
      }
      
      // Unclosed quote
      pushDiag(
        diagnostics,
        "COLLIE004",
        `Unclosed quote in attribute ${attrName}`,
        lineNumber,
        column,
        lineOffset
      );
      return "";
    } else {
      // Unquoted value - take everything until space or end
      const unquotedMatch = afterEquals.match(/^(\S+)/);
      if (unquotedMatch) {
        attributes.push({ name: attrName, value: unquotedMatch[1] });
        return afterEquals.slice(unquotedMatch[1].length).trim();
      }
      return "";
    }
  } else {
    // Boolean attribute
    const boolMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)(\s+.*)?$/);
    if (boolMatch) {
      attributes.push({ name: boolMatch[1], value: null });
      return boolMatch[2] ? boolMatch[2].trim() : "";
    } else {
      pushDiag(
        diagnostics,
        "COLLIE004",
        `Invalid attribute syntax: ${trimmed.slice(0, 30)}`,
        lineNumber,
        column,
        lineOffset
      );
      return "";
    }
  }
}

function parseInputDecl(
  line: string,
  lineNumber: number,
  column: number,
  lineOffset: number,
  diagnostics: Diagnostic[]
): InputDecl | null {
  const trimmed = line.trim();
  
  // Check for type hints (not allowed)
  if (trimmed.includes(":") || trimmed.includes("<") || trimmed.includes("?")) {
    pushDiag(
      diagnostics,
      "COLLIE104",
      'Types are not supported in #inputs yet. Use "name" or "name()".',
      lineNumber,
      column,
      lineOffset,
      trimmed.length
    );
    return null;
  }

  // Check for value form: name
  const valueMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (valueMatch) {
    const name = valueMatch[1];
    const nameStart = line.indexOf(name);
    const nameColumn = column + nameStart;
    return {
      name,
      kind: "value",
      span: createSpan(lineNumber, nameColumn, name.length, lineOffset)
    };
  }

  // Check for function marker form: name()
  const fnMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\(\)$/);
  if (fnMatch) {
    const name = fnMatch[1];
    const nameStart = line.indexOf(name);
    const nameColumn = column + nameStart;
    return {
      name,
      kind: "fn",
      span: createSpan(lineNumber, nameColumn, name.length, lineOffset)
    };
  }
  
  // Invalid syntax
  pushDiag(
    diagnostics,
    "COLLIE105",
    'Invalid #inputs declaration. Use "name" or "name()".',
    lineNumber,
    column,
    lineOffset,
    trimmed.length
  );
  return null;
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
