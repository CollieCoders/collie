import ts from "typescript";

export interface ConvertTsxOptions {
  filename?: string;
}

export interface ConvertTsxResult {
  collie: string;
  warnings: string[];
}

interface InputField {
  name: string;
  optional: boolean;
  typeText: string;
}

interface ComponentInfo {
  jsxRoot: ts.JsxChild;
  inputsTypeName?: string;
  inlineInputs?: InputField[];
  defaults: Map<string, string>;
}

interface ConverterContext {
  sourceFile: ts.SourceFile;
  warnings: string[];
}

export function convertTsxToCollie(source: string, options: ConvertTsxOptions = {}): ConvertTsxResult {
  const filename = options.filename ?? "input.tsx";
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    inferScriptKind(filename)
  );
  const warnings: string[] = [];
  const ctx: ConverterContext = { sourceFile, warnings };
  const inputDeclarations = collectInputDeclarations(sourceFile);
  const component = findComponentInfo(sourceFile, inputDeclarations, ctx);
  if (!component) {
    throw new Error("Could not find a component that returns JSX in this file.");
  }

  const inputsLines = buildInputsBlock(component, inputDeclarations, ctx);
  const templateLines = convertJsxNode(component.jsxRoot, ctx, 0);
  if (!templateLines.length) {
    throw new Error("Unable to convert JSX tree to Collie template.");
  }

  const sections: string[] = [];
  if (inputsLines.length) {
    sections.push(inputsLines.join("\n"));
  }
  sections.push(templateLines.join("\n"));

  const collie = `${sections.join("\n\n").trimEnd()}\n`;
  return { collie, warnings };
}

function inferScriptKind(filename: string): ts.ScriptKind {
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".ts") return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function collectInputDeclarations(sourceFile: ts.SourceFile): Map<string, InputField[]> {
  const map = new Map<string, InputField[]>();
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name) {
      map.set(statement.name.text, extractInputsFromMembers(statement.members, sourceFile));
    } else if (ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type)) {
      map.set(statement.name.text, extractInputsFromMembers(statement.type.members, sourceFile));
    }
  }
  return map;
}

function extractInputsFromMembers(members: readonly ts.TypeElement[], sourceFile: ts.SourceFile): InputField[] {
  const fields: InputField[] = [];
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
  declarations: Map<string, InputField[]>,
  ctx: ConverterContext
): ComponentInfo | null {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      const jsx = findJsxReturn(statement.body);
      if (jsx) {
        const defaults = extractDefaultsFromParameters(statement.parameters, ctx);
        const inputsInfo = resolveInputsFromParameters(statement.parameters, declarations, ctx);
        return {
          jsxRoot: jsx,
          inputsTypeName: inputsInfo.typeName,
          inlineInputs: inputsInfo.inline,
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
          const inputsInfo = resolveInputsFromParameters(init.parameters, declarations, ctx);
          if (!inputsInfo.typeName && !inputsInfo.inline && decl.type) {
            const inferred = resolveInputsFromTypeAnnotation(decl.type, sourceFile, declarations);
            if (inferred.typeName && !inputsInfo.typeName) {
              inputsInfo.typeName = inferred.typeName;
            }
            if (inferred.inline && !inputsInfo.inline) {
              inputsInfo.inline = inferred.inline;
            }
          }
          return {
            jsxRoot: jsx,
            inputsTypeName: inputsInfo.typeName,
            inlineInputs: inputsInfo.inline,
            defaults
          };
        }
      }
    }
  }
  return null;
}

function resolveInputsFromParameters(
  parameters: readonly ts.ParameterDeclaration[],
  declarations: Map<string, InputField[]>,
  ctx: ConverterContext
): { typeName?: string; inline?: InputField[] } {
  if (!parameters.length) {
    return {};
  }
  const param = parameters[0];
  if (param.type) {
    const inferred = resolveInputsFromTypeAnnotation(param.type, ctx.sourceFile, declarations);
    if (inferred.inline) {
      return inferred;
    }
    if (inferred.typeName) {
      return inferred;
    }
  }
  return {};
}

function resolveInputsFromTypeAnnotation(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
  declarations: Map<string, InputField[]>
): { typeName?: string; inline?: InputField[] } {
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
        return { inline: extractInputsFromMembers(typeArg.members, sourceFile) };
      }
    }
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    return { inline: extractInputsFromMembers(typeNode.members, sourceFile) };
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
    const inputName = getBindingElementInputName(element, ctx.sourceFile);
    if (!inputName) {
      ctx.warnings.push("Skipping complex destructured default value.");
      continue;
    }
    defaults.set(inputName, element.initializer.getText(ctx.sourceFile).trim());
  }
  return defaults;
}

function getBindingElementInputName(element: ts.BindingElement, sourceFile: ts.SourceFile): string | undefined {
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

function buildInputsBlock(
  info: ComponentInfo,
  inputDeclarations: Map<string, InputField[]>,
  ctx: ConverterContext
): string[] {
  const fields =
    info.inlineInputs ??
    (info.inputsTypeName ? inputDeclarations.get(info.inputsTypeName) ?? [] : undefined) ??
    [];
  if (!fields.length && !info.defaults.size) {
    return [];
  }

  const lines = ["#inputs"];
  if (fields.length) {
    for (const field of fields) {
      const def = info.defaults.get(field.name);
      // Emit as bare identifier, not function call
      let line = `  ${field.name}`;
      if (def) {
        ctx.warnings.push(`Default value for "${field.name}" cannot be preserved in Collie #inputs.`);
      }
      lines.push(line);
    }
  } else {
    for (const [name, defValue] of info.defaults.entries()) {
      ctx.warnings.push(`Default value for "${name}" cannot be preserved in Collie #inputs.`);
      lines.push(`  ${name}`);
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
  const fallback = tag.getText(ctx.sourceFile);
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
  return fallback;
}

function convertAttributes(attributes: ts.JsxAttributes, ctx: ConverterContext): {
  classSegments: string[];
  attributes: string[];
} {
  const classSegments: string[] = [];
  const attrs: string[] = [];

  for (const attr of attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const attrName = getAttributeName(attr.name, ctx);
      if (!attrName) {
        ctx.warnings.push("Skipping unsupported attribute name.");
        continue;
      }
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
  ctx.warnings.push("Unsupported class attribute value; leaving as-is.");
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
  initializer: ts.JsxAttributeValue | undefined,
  ctx: ConverterContext
): string {
  if (!initializer) {
    return name;
  }
  if (ts.isStringLiteral(initializer)) {
    return `${name}="${initializer.text}"`;
  }
  if (ts.isJsxExpression(initializer)) {
    if (initializer.expression) {
      const expr = initializer.expression.getText(ctx.sourceFile).trim();
      return `${name}={${expr}}`;
    }
    return name;
  }
  ctx.warnings.push("Unsupported JSX attribute value; leaving as-is.");
  return name;
}

function getAttributeName(name: ts.JsxAttributeName, ctx: ConverterContext): string | null {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  if (ts.isJsxNamespacedName(name)) {
    return `${name.namespace.text}:${name.name.text}`;
  }
  return null;
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
