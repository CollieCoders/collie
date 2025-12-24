import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

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

interface PropField {
  name: string;
  optional: boolean;
  typeText: string;
}

interface ComponentInfo {
  jsxRoot: ts.JsxChild;
  propsTypeName?: string;
  inlineProps?: PropField[];
  defaults: Map<string, string>;
}

interface ConverterContext {
  sourceFile: ts.SourceFile;
  warnings: string[];
}

export async function convertFile(filepath: string, options: ConvertOptions = {}): Promise<ConvertResult> {
  const source = await fs.readFile(filepath, "utf8");
  const sourceFile = ts.createSourceFile(
    filepath,
    source,
    ts.ScriptTarget.Latest,
    true,
    inferScriptKind(filepath)
  );
  const warnings: string[] = [];
  const ctx: ConverterContext = { sourceFile, warnings };
  const propDeclarations = collectPropDeclarations(sourceFile);
  const component = findComponentInfo(sourceFile, propDeclarations, ctx);
  if (!component) {
    throw new Error("Could not find a component that returns JSX in this file.");
  }

  const propsLines = buildPropsBlock(component, propDeclarations, ctx);
  const templateLines = convertJsxNode(component.jsxRoot, ctx, 0);
  if (!templateLines.length) {
    throw new Error("Unable to convert JSX tree to Collie template.");
  }

  const sections: string[] = [];
  if (propsLines.length) {
    sections.push(propsLines.join("\n"));
  }
  sections.push(templateLines.join("\n"));

  const collie = `${sections.join("\n\n").trimEnd()}\n`;
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

function inferScriptKind(filepath: string): ts.ScriptKind {
  const ext = path.extname(filepath).toLowerCase();
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

function collectPropDeclarations(sourceFile: ts.SourceFile): Map<string, PropField[]> {
  const map = new Map<string, PropField[]>();
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name) {
      map.set(statement.name.text, extractPropsFromMembers(statement.members, sourceFile));
    } else if (ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type)) {
      map.set(statement.name.text, extractPropsFromMembers(statement.type.members, sourceFile));
    }
  }
  return map;
}

function extractPropsFromMembers(members: readonly ts.TypeElement[], sourceFile: ts.SourceFile): PropField[] {
  const fields: PropField[] = [];
  for (const member of members) {
    if (!ts.isPropertySignature(member) || member.name === undefined) {
      continue;
    }
    const name = getPropertyName(member.name, sourceFile);
    if (!name) {
      continue;
    }
    const typeText = member.type ? member.type.getText(sourceFile).trim() : "any";
    fields.push({
      name,
      optional: Boolean(member.questionToken),
      typeText
    });
  }
  return fields;
}

function findComponentInfo(
  sourceFile: ts.SourceFile,
  declarations: Map<string, PropField[]>,
  ctx: ConverterContext
): ComponentInfo | null {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      const jsx = findJsxReturn(statement.body);
      if (jsx) {
        const defaults = extractDefaultsFromParameters(statement.parameters, ctx);
        const propsInfo = resolvePropsFromParameters(statement.parameters, declarations, ctx);
        return {
          jsxRoot: jsx,
          propsTypeName: propsInfo.typeName,
          inlineProps: propsInfo.inline,
          defaults
        };
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        const init = decl.initializer;
        if (!init) continue;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          const jsx = init.body ? findJsxInFunctionBody(init.body) : undefined;
          if (!jsx) {
            continue;
          }
          const defaults = extractDefaultsFromParameters(init.parameters, ctx);
          const propsInfo = resolvePropsFromParameters(init.parameters, declarations, ctx);
          if (!propsInfo.typeName && !propsInfo.inline && decl.type) {
            const inferred = resolvePropsFromTypeAnnotation(decl.type, sourceFile, declarations);
            if (inferred.typeName && !propsInfo.typeName) {
              propsInfo.typeName = inferred.typeName;
            }
            if (inferred.inline && !propsInfo.inline) {
              propsInfo.inline = inferred.inline;
            }
          }
          return {
            jsxRoot: jsx,
            propsTypeName: propsInfo.typeName,
            inlineProps: propsInfo.inline,
            defaults
          };
        }
      }
    }
  }
  return null;
}

function resolvePropsFromParameters(
  parameters: readonly ts.ParameterDeclaration[],
  declarations: Map<string, PropField[]>,
  ctx: ConverterContext
): { typeName?: string; inline?: PropField[] } {
  if (!parameters.length) {
    return {};
  }
  const param = parameters[0];
  if (param.type) {
    const inferred = resolvePropsFromTypeAnnotation(param.type, ctx.sourceFile, declarations);
    if (inferred.inline) {
      return inferred;
    }
    if (inferred.typeName) {
      return inferred;
    }
  }
  return {};
}

function resolvePropsFromTypeAnnotation(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
  declarations: Map<string, PropField[]>
): { typeName?: string; inline?: PropField[] } {
  if (ts.isTypeReferenceNode(typeNode)) {
    const referenced = getTypeReferenceName(typeNode.typeName);
    if (referenced && declarations.has(referenced)) {
      return { typeName: referenced };
    }
    const typeArg = typeNode.typeArguments?.[0];
    if (typeArg) {
      if (ts.isTypeReferenceNode(typeArg)) {
        const nested = getTypeReferenceName(typeArg.typeName);
        if (nested && declarations.has(nested)) {
          return { typeName: nested };
        }
      } else if (ts.isTypeLiteralNode(typeArg)) {
        return { inline: extractPropsFromMembers(typeArg.members, sourceFile) };
      }
    }
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    return { inline: extractPropsFromMembers(typeNode.members, sourceFile) };
  }
  return {};
}

function getTypeReferenceName(typeName: ts.EntityName | ts.Expression): string | undefined {
  if (ts.isIdentifier(typeName)) {
    return typeName.text;
  }
  if (ts.isQualifiedName(typeName)) {
    return typeName.right.text;
  }
  if (ts.isPropertyAccessExpression(typeName)) {
    return getTypeReferenceName(typeName.name);
  }
  return undefined;
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

function extractDefaultsFromParameters(
  parameters: readonly ts.ParameterDeclaration[],
  ctx: ConverterContext
): Map<string, string> {
  const defaults = new Map<string, string>();
  if (!parameters.length) {
    return defaults;
  }
  const param = parameters[0];
  if (!ts.isObjectBindingPattern(param.name)) {
    return defaults;
  }
  for (const element of param.name.elements) {
    if (!element.initializer) {
      continue;
    }
    const propName = getBindingElementPropName(element, ctx.sourceFile);
    if (!propName) {
      ctx.warnings.push("Skipping complex destructured default value.");
      continue;
    }
    defaults.set(propName, element.initializer.getText(ctx.sourceFile).trim());
  }
  return defaults;
}

function getBindingElementPropName(element: ts.BindingElement, sourceFile: ts.SourceFile): string | undefined {
  const prop = element.propertyName;
  if (prop) {
    if (ts.isIdentifier(prop) || ts.isStringLiteral(prop) || ts.isNumericLiteral(prop)) {
      return prop.text;
    }
    return prop.getText(sourceFile);
  }
  if (ts.isIdentifier(element.name)) {
    return element.name.text;
  }
  return undefined;
}

function getPropertyName(name: ts.PropertyName, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText(sourceFile);
}

function buildPropsBlock(
  info: ComponentInfo,
  propDeclarations: Map<string, PropField[]>,
  ctx: ConverterContext
): string[] {
  const fields =
    info.inlineProps ??
    (info.propsTypeName ? propDeclarations.get(info.propsTypeName) ?? [] : undefined) ??
    [];
  if (!fields.length && !info.defaults.size) {
    return [];
  }

  const lines = ["props"];
  if (fields.length) {
    for (const field of fields) {
      const def = info.defaults.get(field.name);
      let line = `  ${field.name}${field.optional ? "?" : ""}: ${field.typeText}`;
      if (def) {
        line += ` = ${def}`;
      }
      lines.push(line);
    }
  } else {
    for (const [name, defValue] of info.defaults.entries()) {
      lines.push(`  ${name}: any = ${defValue}`);
    }
  }
  return lines;
}

function convertJsxNode(node: ts.JsxChild, ctx: ConverterContext, indent: number): string[] {
  if (ts.isJsxElement(node)) {
    return convertJsxElement(node, ctx, indent);
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return convertJsxSelfClosing(node, ctx, indent);
  }
  if (ts.isJsxFragment(node)) {
    return convertJsxFragment(node, ctx, indent);
  }
  if (ts.isJsxText(node)) {
    return convertJsxText(node, ctx, indent);
  }
  if (ts.isJsxExpression(node)) {
    return convertJsxExpression(node, ctx, indent);
  }
  return [];
}

function convertJsxFragment(fragment: ts.JsxFragment, ctx: ConverterContext, indent: number): string[] {
  const lines: string[] = [];
  for (const child of fragment.children) {
    lines.push(...convertJsxNode(child, ctx, indent));
  }
  return lines;
}

function convertJsxElement(element: ts.JsxElement, ctx: ConverterContext, indent: number): string[] {
  const line = buildElementLine(element.openingElement, ctx, indent);
  const children: string[] = [];
  for (const child of element.children) {
    children.push(...convertJsxNode(child, ctx, indent + 1));
  }
  if (!children.length) {
    return [line];
  }
  return [line, ...children];
}

function convertJsxSelfClosing(element: ts.JsxSelfClosingElement, ctx: ConverterContext, indent: number): string[] {
  return [buildElementLine(element, ctx, indent)];
}

function buildElementLine(element: ts.JsxOpeningLikeElement, ctx: ConverterContext, indent: number): string {
  const indentStr = "  ".repeat(indent);
  const tagName = getTagName(element.tagName, ctx);
  const { classSegments, attributes } = convertAttributes(element.attributes, ctx);
  const classes = classSegments.length ? classSegments.map((cls) => `.${cls}`).join("") : "";
  const attrString = attributes.length ? `(${attributes.join(" ")})` : "";
  return `${indentStr}${tagName}${classes}${attrString}`;
}

function getTagName(tag: ts.JsxTagNameExpression, ctx: ConverterContext): string {
  if (ts.isIdentifier(tag)) {
    return tag.text;
  }
  if (ts.isPropertyAccessExpression(tag)) {
    const left = getTagName(tag.expression as ts.JsxTagNameExpression, ctx);
    return `${left}.${tag.name.text}`;
  }
  if (tag.kind === ts.SyntaxKind.ThisKeyword) {
    return "this";
  }
  if (ts.isJsxNamespacedName(tag)) {
    return `${tag.namespace.text}:${tag.name.text}`;
  }
  return tag.getText(ctx.sourceFile);
}

function convertAttributes(attributes: ts.JsxAttributes, ctx: ConverterContext): {
  classSegments: string[];
  attributes: string[];
} {
  const classSegments: string[] = [];
  const attrs: string[] = [];

  for (const attr of attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const attrName = attr.name.text;
      if (attrName === "className" || attrName === "class") {
        const handled = handleClassAttribute(attr, ctx, classSegments, attrs);
        if (!handled) {
          attrs.push(formatAttribute(attrName === "className" ? "className" : attrName, attr.initializer, ctx));
        }
        continue;
      }
      attrs.push(formatAttribute(attrName, attr.initializer, ctx));
    } else if (ts.isJsxSpreadAttribute(attr)) {
      ctx.warnings.push("Spread attributes are not supported and were skipped.");
    }
  }

  return { classSegments, attributes: attrs.filter(Boolean) };
}

function handleClassAttribute(
  attr: ts.JsxAttribute,
  ctx: ConverterContext,
  classSegments: string[],
  attrs: string[]
): boolean {
  if (!attr.initializer) {
    return false;
  }
  if (ts.isStringLiteral(attr.initializer)) {
    classSegments.push(...splitClassNames(attr.initializer.text));
    return true;
  }
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expressionText = attr.initializer.expression.getText(ctx.sourceFile).trim();
    attrs.push(`className={${expressionText}}`);
    return true;
  }
  return false;
}

function splitClassNames(value: string): string[] {
  return value
    .split(/\s+/)
    .map((cls) => cls.trim())
    .filter(Boolean);
}

function formatAttribute(
  name: string,
  initializer: ts.StringLiteral | ts.JsxExpression | undefined,
  ctx: ConverterContext
): string {
  if (!initializer) {
    return name;
  }
  if (ts.isStringLiteral(initializer)) {
    return `${name}="${initializer.text}"`;
  }
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expr = initializer.expression.getText(ctx.sourceFile).trim();
    return `${name}={${expr}}`;
  }
  return name;
}

function convertJsxText(textNode: ts.JsxText, ctx: ConverterContext, indent: number): string[] {
  const text = textNode.getText(ctx.sourceFile).replace(/\s+/g, " ").trim();
  if (!text) {
    return [];
  }
  return [`${"  ".repeat(indent)}| ${text}`];
}

function convertJsxExpression(expressionNode: ts.JsxExpression, ctx: ConverterContext, indent: number): string[] {
  if (!expressionNode.expression) {
    return [];
  }
  const exprText = expressionNode.expression.getText(ctx.sourceFile).trim();
  if (!exprText) {
    return [];
  }
  return [`${"  ".repeat(indent)}{{ ${exprText} }}`];
}
