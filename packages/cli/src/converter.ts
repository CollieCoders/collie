import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { convertTsxToCollie } from "@collie-lang/compiler";

export interface ConvertOptions {
  write?: boolean;
  overwrite?: boolean;
  removeOriginal?: boolean;
}

export interface ConvertResult {
  collie: string;
  outputPath?: string;
  warnings: string[];
}

export async function convertFile(filepath: string, options: ConvertOptions = {}): Promise<ConvertResult> {
  const source = await fs.readFile(filepath, "utf8");
  const result = convertTsxToCollie(source, { filename: filepath });
  const collie = normalizeConvertedCollie(result.collie, source, filepath);
  const { warnings } = result;
  let outputPath: string | undefined;

  if (options.write) {
    outputPath = resolveOutputPath(filepath);
    if (!options.overwrite) {
      const exists = await fileExists(outputPath);
      if (exists) {
        throw new Error(`${path.relative(process.cwd(), outputPath)} already exists. Use --overwrite to replace.`);
      }
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, collie, "utf8");
    if (options.removeOriginal) {
      await fs.unlink(filepath);
    }
  }

  return { collie, warnings, outputPath };
}

function normalizeConvertedCollie(collie: string, source: string, filename: string): string {
  const { localParamNames, componentParamNames } = collectLocalFunctionParams(source, filename);
  const lines = collie.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];
  let inInputs = false;
  let inputsIndent = 0;
  let inputsHeader = "";
  let inputLines: string[] = [];
  let seenInputs = new Set<string>();

  const flushInputsBlock = (): void => {
    if (!inInputs) {
      return;
    }
    if (inputLines.length > 0) {
      normalized.push(inputsHeader, ...inputLines);
    }
    inInputs = false;
    inputsHeader = "";
    inputLines = [];
    seenInputs = new Set<string>();
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const indentMatch = rawLine.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const trimmed = rawLine.trimEnd();

    if (!inInputs) {
      if (trimmed === "#props" || trimmed === "#inputs") {
        inInputs = true;
        inputsIndent = indent;
        inputsHeader = trimmed === "#props" ? rawLine.replace("#props", "#inputs") : rawLine;
        inputLines = [];
        seenInputs = new Set<string>();
        i++;
        continue;
      }
      normalized.push(rawLine);
      i++;
      continue;
    }

    if (trimmed !== "" && indent <= inputsIndent) {
      flushInputsBlock();
      continue;
    }

    if (trimmed === "") {
      i++;
      continue;
    }

    const content = trimmed.trim();
    const nameMatch = content.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (!nameMatch) {
      i++;
      continue;
    }
    const name = nameMatch[1];
    if (localParamNames.has(name) && !componentParamNames.has(name)) {
      i++;
      continue;
    }
    if (!seenInputs.has(name)) {
      const lineIndent = rawLine.slice(0, indent);
      inputLines.push(`${lineIndent}${name}`);
      seenInputs.add(name);
    }
    i++;
  }

  flushInputsBlock();
  return normalized.join("\n");
}

function collectLocalFunctionParams(
  source: string,
  filename: string
): { localParamNames: Set<string>; componentParamNames: Set<string> } {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    inferScriptKind(filename)
  );
  const componentNode = findComponentFunction(sourceFile);
  const componentParamNames = new Set<string>();
  if (componentNode) {
    collectParamNames(componentNode.parameters, componentParamNames, sourceFile);
  }

  const localParamNames = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (isFunctionNode(node) && node !== componentNode) {
      collectParamNames(node.parameters, localParamNames, sourceFile);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { localParamNames, componentParamNames };
}

function isFunctionNode(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function collectParamNames(
  params: readonly ts.ParameterDeclaration[],
  names: Set<string>,
  sourceFile: ts.SourceFile
): void {
  for (const param of params) {
    collectBindingNames(param.name, names, sourceFile);
  }
}

function collectBindingNames(
  name: ts.BindingName,
  names: Set<string>,
  sourceFile: ts.SourceFile
): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (element.propertyName) {
        const propName = getPropertyNameText(element.propertyName, sourceFile);
        if (propName) {
          names.add(propName);
        }
      }
      collectBindingNames(element.name, names, sourceFile);
    }
    return;
  }
  if (ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, names, sourceFile);
      }
    }
  }
}

function getPropertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  const raw = name.getText(sourceFile);
  return raw ? raw : null;
}

function findComponentFunction(sourceFile: ts.SourceFile): ts.FunctionLikeDeclaration | null {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      if (findJsxReturn(statement.body)) {
        return statement;
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        const init = decl.initializer;
        if (!init) continue;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          if (findJsxInFunctionBody(init.body)) {
            return init;
          }
        }
      }
    }
  }
  return null;
}

function findJsxReturn(body: ts.Block): ts.JsxChild | undefined {
  for (const statement of body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression) {
      const jsx = unwrapJsx(statement.expression);
      if (jsx) {
        return jsx;
      }
    }
  }
  return undefined;
}

function findJsxInFunctionBody(body: ts.ConciseBody): ts.JsxChild | undefined {
  if (ts.isBlock(body)) {
    return findJsxReturn(body);
  }
  return unwrapJsx(body);
}

function unwrapJsx(expression: ts.Expression): ts.JsxChild | undefined {
  let current: ts.Expression = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  if (ts.isJsxElement(current) || ts.isJsxFragment(current) || ts.isJsxSelfClosingElement(current)) {
    return current;
  }
  return undefined;
}

function inferScriptKind(filename: string): ts.ScriptKind {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".ts") return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function resolveOutputPath(filepath: string): string {
  return filepath.replace(/\.[tj]sx?$/, "") + ".collie";
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}
