import type { InputDeclKind } from "./ast.ts";

/**
 * Template environment for tracking inputs and local variables during code generation.
 * 
 * This is a pure data structure with no hidden state or side effects.
 * It is created once per template and passed through expression processing.
 * 
 * - inputNames: Set of input names declared in #inputs
 * - localsStack: Stack of local variable scopes (e.g., @for loop variables)
 */
export interface TemplateEnv {
  inputNames: Set<string>;
  localsStack: Array<Set<string>>;
}

/**
 * Create a new TemplateEnv from input declarations.
 */
export function createTemplateEnv(
  inputsDecls?: Array<{ name: string; kind: InputDeclKind }>
): TemplateEnv {
  const inputNames = new Set<string>();
  if (inputsDecls) {
    for (const decl of inputsDecls) {
      inputNames.add(decl.name);
    }
  }
  return {
    inputNames,
    localsStack: []
  };
}

/**
 * Push a new local scope with the given variable names.
 * Call this when entering a new scope (e.g., @for loop).
 */
export function pushLocals(env: TemplateEnv, names: string[]): void {
  const locals = new Set<string>(names);
  env.localsStack.push(locals);
}

/**
 * Pop the most recent local scope.
 * Call this when exiting a scope (e.g., end of @for loop body).
 */
export function popLocals(env: TemplateEnv): void {
  env.localsStack.pop();
}

/**
 * Check if a name is a local variable in the current scope.
 * Locals shadow inputs.
 */
export function isLocal(env: TemplateEnv, name: string): boolean {
  for (let i = env.localsStack.length - 1; i >= 0; i--) {
    if (env.localsStack[i].has(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a name is an input declared in #inputs.
 * Returns true only if it's in inputNames and not shadowed by a local.
 */
export function isInput(env: TemplateEnv, name: string): boolean {
  if (isLocal(env, name)) {
    return false;
  }
  return env.inputNames.has(name);
}

/**
 * Result of expression processing with usage metadata for diagnostics.
 */
export interface RewriteResult {
  code: string;                      // processed expression (unchanged from input)
  usedBare: Set<string>;             // bare identifiers encountered
  callSitesBare: Set<string>;        // bare identifiers used as calls: name(...)
}

const IGNORED_IDENTIFIERS = new Set([
  "null",
  "undefined",
  "true",
  "false",
  "NaN",
  "Infinity",
  "this"
]);

const RESERVED_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);

/**
 * Process expression WITHOUT rewriting identifiers.
 * Returns the original code unchanged, plus metadata about identifier usage for diagnostics.
 * 
 * This function is PURE and does not mutate the AST or environment.
 * Identifiers remain as bare names - JavaScript scoping rules apply naturally.
 * 
 * @param expression - The original expression string from the template
 * @param env - Template environment with inputs and locals
 * @returns RewriteResult with original code and usage metadata
 */
export function rewriteExpression(expression: string, env: TemplateEnv): RewriteResult {
  const tokens = tokenizeExpression(expression);
  const usedBare = new Set<string>();
  const callSitesBare = new Set<string>();
  const localScopes: Array<Set<string>> = [new Set<string>()];

  analyzeTokens(tokens, 0, tokens.length, env, localScopes, usedBare, callSitesBare, false);

  return { code: expression, usedBare, callSitesBare };
}

/**
 * Process JSX expression containing embedded braces WITHOUT rewriting.
 * 
 * This function is PURE and does not mutate the AST or environment.
 * Recursively processes expressions within braces, maintaining original code.
 * 
 * @param expression - The JSX expression string with potential {...} sections
 * @param env - Template environment with inputs and locals
 * @returns RewriteResult with original code and aggregated usage metadata
 */
export function rewriteJsxExpression(expression: string, env: TemplateEnv): RewriteResult {
  let i = 0;
  
  const usedBare = new Set<string>();
  const callSitesBare = new Set<string>();

  while (i < expression.length) {
    const ch = expression[i];
    if (ch === "{") {
      const braceResult = readBalancedBraces(expression, i + 1);
      if (!braceResult) {
        break;
      }
      const result = rewriteExpression(braceResult.content, env);
      
      // Merge metadata
      for (const name of result.usedBare) usedBare.add(name);
      for (const name of result.callSitesBare) callSitesBare.add(name);
      
      i = braceResult.endIndex + 1;
      continue;
    }
    i++;
  }

  return { code: expression, usedBare, callSitesBare };
}

function readBalancedBraces(
  source: string,
  startIndex: number
): { content: string; endIndex: number } | null {
  let i = startIndex;
  let depth = 1;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";

  while (i < source.length) {
    const ch = source[i];

    if (state === "code") {
      if (ch === "'" || ch === "\"") {
        state = ch === "'" ? "single" : "double";
        i++;
        continue;
      }
      if (ch === "`") {
        state = "template";
        i++;
        continue;
      }
      if (ch === "/" && source[i + 1] === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (ch === "/" && source[i + 1] === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          return { content: source.slice(startIndex, i), endIndex: i };
        }
      }
      i++;
      continue;
    }

    if (state === "line") {
      if (ch === "\n") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (ch === "*" && source[i + 1] === "/") {
        i += 2;
        state = "code";
        continue;
      }
      i++;
      continue;
    }

    if (state === "single") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "double") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "\"") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "template") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        state = "code";
      }
      i++;
      continue;
    }
  }

  return null;
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function shouldIgnoreIdentifier(name: string): boolean {
  return IGNORED_IDENTIFIERS.has(name) || RESERVED_KEYWORDS.has(name);
}

type TokenType = "identifier" | "literal" | "punctuator";

interface Token {
  type: TokenType;
  value: string;
}

function tokenizeExpression(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "/" && expression[i + 1] === "/") {
      i += 2;
      while (i < expression.length && expression[i] !== "\n") {
        i++;
      }
      continue;
    }

    if (ch === "/" && expression[i + 1] === "*") {
      i += 2;
      while (i < expression.length && !(expression[i] === "*" && expression[i + 1] === "/")) {
        i++;
      }
      i += 2;
      continue;
    }

    if (ch === "'" || ch === "\"") {
      i = skipStringLiteral(expression, i, ch);
      tokens.push({ type: "literal", value: "string" });
      continue;
    }

    if (ch === "`") {
      i = skipTemplateLiteral(expression, i);
      tokens.push({ type: "literal", value: "template" });
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = i;
      i++;
      while (i < expression.length && isIdentifierPart(expression[i])) {
        i++;
      }
      tokens.push({ type: "identifier", value: expression.slice(start, i) });
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const start = i;
      i++;
      while (i < expression.length && /[0-9._]/.test(expression[i])) {
        i++;
      }
      tokens.push({ type: "literal", value: expression.slice(start, i) });
      continue;
    }

    if (expression.startsWith("...", i)) {
      tokens.push({ type: "punctuator", value: "..." });
      i += 3;
      continue;
    }

    if (expression.startsWith("=>", i)) {
      tokens.push({ type: "punctuator", value: "=>" });
      i += 2;
      continue;
    }

    if (expression.startsWith("?.", i)) {
      tokens.push({ type: "punctuator", value: "?." });
      i += 2;
      continue;
    }

    if (expression.startsWith("??", i)) {
      tokens.push({ type: "punctuator", value: "??" });
      i += 2;
      continue;
    }

    tokens.push({ type: "punctuator", value: ch });
    i++;
  }

  return tokens;
}

function skipStringLiteral(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i++;
  }
  return source.length;
}

function skipTemplateLiteral(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") {
      return i + 1;
    }
    i++;
  }
  return source.length;
}

function analyzeTokens(
  tokens: Token[],
  start: number,
  end: number,
  env: TemplateEnv,
  scopes: Array<Set<string>>,
  usedBare: Set<string>,
  callSitesBare: Set<string>,
  allowStatements: boolean
): void {
  let i = start;
  while (i < end) {
    const token = tokens[i];
    if (token.type === "identifier") {
      if (token.value === "function") {
        const fnResult = parseFunctionExpression(tokens, i, end, env, scopes, usedBare, callSitesBare);
        if (fnResult > i) {
          i = fnResult;
          continue;
        }
      }

      if (allowStatements && (token.value === "const" || token.value === "let" || token.value === "var")) {
        const declResult = parseVariableDeclaration(tokens, i, end, env, scopes, usedBare, callSitesBare);
        if (declResult > i) {
          i = declResult;
          continue;
        }
      }

      if (allowStatements && token.value === "catch") {
        const catchResult = parseCatchClause(tokens, i, end, env, scopes, usedBare, callSitesBare);
        if (catchResult > i) {
          i = catchResult;
          continue;
        }
      }

      const arrowResult = parseArrowFunction(tokens, i, end, env, scopes, usedBare, callSitesBare);
      if (arrowResult > i) {
        i = arrowResult;
        continue;
      }

      if (shouldIgnoreIdentifier(token.value)) {
        i++;
        continue;
      }

      if (isShadowed(env, scopes, token.value)) {
        i++;
        continue;
      }

      if (isMemberAccess(tokens, i) || isObjectKey(tokens, i)) {
        i++;
        continue;
      }

      usedBare.add(token.value);

      if (isCallSite(tokens, i)) {
        callSitesBare.add(token.value);
      }

      i++;
      continue;
    }

    if (token.type === "punctuator" && token.value === "(") {
      const arrowResult = parseArrowFunction(tokens, i, end, env, scopes, usedBare, callSitesBare);
      if (arrowResult > i) {
        i = arrowResult;
        continue;
      }
    }

    i++;
  }
}

function parseArrowFunction(
  tokens: Token[],
  index: number,
  end: number,
  env: TemplateEnv,
  scopes: Array<Set<string>>,
  usedBare: Set<string>,
  callSitesBare: Set<string>
): number {
  const token = tokens[index];
  if (!token) {
    return index;
  }

  if (token.type === "identifier") {
    const next = tokens[index + 1];
    if (next && next.value === "=>") {
      const params = new Set<string>([token.value]);
      return analyzeArrowBody(tokens, index + 2, end, params, env, scopes, usedBare, callSitesBare);
    }
  }

  if (token.type === "punctuator" && token.value === "(") {
    const closeIndex = findMatchingToken(tokens, index, "(", ")");
    if (closeIndex !== -1) {
      const afterClose = tokens[closeIndex + 1];
      if (afterClose && afterClose.value === "=>") {
        const params = new Set<string>();
        collectBindingNamesFromList(tokens, index + 1, closeIndex, params);
        return analyzeArrowBody(tokens, closeIndex + 2, end, params, env, scopes, usedBare, callSitesBare);
      }
    }
  }

  return index;
}

function analyzeArrowBody(
  tokens: Token[],
  start: number,
  end: number,
  params: Set<string>,
  env: TemplateEnv,
  scopes: Array<Set<string>>,
  usedBare: Set<string>,
  callSitesBare: Set<string>
): number {
  const bodyToken = tokens[start];
  if (!bodyToken) {
    return start;
  }

  const scope = new Set<string>(params);
  scopes.push(scope);

  if (bodyToken.type === "punctuator" && bodyToken.value === "{") {
    const closeIndex = findMatchingToken(tokens, start, "{", "}");
    const bodyEnd = closeIndex === -1 ? end : closeIndex;
    analyzeTokens(tokens, start + 1, bodyEnd, env, scopes, usedBare, callSitesBare, true);
    scopes.pop();
    return closeIndex === -1 ? end : closeIndex + 1;
  }

  const bodyEnd = findExpressionEnd(tokens, start, end, EXPRESSION_TERMINATORS);
  analyzeTokens(tokens, start, bodyEnd, env, scopes, usedBare, callSitesBare, false);
  scopes.pop();
  return bodyEnd;
}

function parseFunctionExpression(
  tokens: Token[],
  index: number,
  end: number,
  env: TemplateEnv,
  scopes: Array<Set<string>>,
  usedBare: Set<string>,
  callSitesBare: Set<string>
): number {
  let i = index + 1;
  const nameToken = tokens[i];
  let fnName: string | undefined;

  if (nameToken && nameToken.type === "identifier" && tokens[i + 1]?.value === "(") {
    fnName = nameToken.value;
    i++;
  }

  if (!tokens[i] || tokens[i].value !== "(") {
    return index;
  }

  const closeIndex = findMatchingToken(tokens, i, "(", ")");
  if (closeIndex === -1) {
    return index;
  }

  const params = new Set<string>();
  collectBindingNamesFromList(tokens, i + 1, closeIndex, params);
  if (fnName) {
    params.add(fnName);
  }

  const bodyStart = closeIndex + 1;
  if (!tokens[bodyStart] || tokens[bodyStart].value !== "{") {
    return index;
  }

  const closeBody = findMatchingToken(tokens, bodyStart, "{", "}");
  const bodyEnd = closeBody === -1 ? end : closeBody;

  scopes.push(params);
  analyzeTokens(tokens, bodyStart + 1, bodyEnd, env, scopes, usedBare, callSitesBare, true);
  scopes.pop();

  return closeBody === -1 ? end : closeBody + 1;
}

function parseCatchClause(
  tokens: Token[],
  index: number,
  end: number,
  env: TemplateEnv,
  scopes: Array<Set<string>>,
  usedBare: Set<string>,
  callSitesBare: Set<string>
): number {
  const next = tokens[index + 1];
  if (!next || next.value !== "(") {
    return index;
  }

  const closeIndex = findMatchingToken(tokens, index + 1, "(", ")");
  if (closeIndex === -1) {
    return index;
  }

  const params = new Set<string>();
  collectBindingNamesFromList(tokens, index + 2, closeIndex, params);

  const bodyStart = closeIndex + 1;
  if (!tokens[bodyStart] || tokens[bodyStart].value !== "{") {
    return index;
  }

  const closeBody = findMatchingToken(tokens, bodyStart, "{", "}");
  const bodyEnd = closeBody === -1 ? end : closeBody;

  scopes.push(params);
  analyzeTokens(tokens, bodyStart + 1, bodyEnd, env, scopes, usedBare, callSitesBare, true);
  scopes.pop();

  return closeBody === -1 ? end : closeBody + 1;
}

function parseVariableDeclaration(
  tokens: Token[],
  index: number,
  end: number,
  env: TemplateEnv,
  scopes: Array<Set<string>>,
  usedBare: Set<string>,
  callSitesBare: Set<string>
): number {
  let i = index + 1;
  const scope = scopes[scopes.length - 1];

  while (i < end) {
    const names = new Set<string>();
    const nextIndex = parseBindingPattern(tokens, i, end, names);
    if (nextIndex === i) {
      return index;
    }
    i = nextIndex;

    if (tokens[i] && tokens[i].value === "=") {
      const initStart = i + 1;
      const initEnd = findExpressionEnd(tokens, initStart, end, DECLARATION_TERMINATORS);
      analyzeTokens(tokens, initStart, initEnd, env, scopes, usedBare, callSitesBare, false);
      i = initEnd;
    }

    for (const name of names) {
      scope.add(name);
    }

    if (tokens[i] && tokens[i].value === ",") {
      i++;
      continue;
    }
    break;
  }

  return i;
}

function parseBindingPattern(
  tokens: Token[],
  start: number,
  end: number,
  names: Set<string>
): number {
  const token = tokens[start];
  if (!token) {
    return start;
  }
  if (token.type === "identifier") {
    names.add(token.value);
    return start + 1;
  }
  if (token.value === "{") {
    return parseObjectPattern(tokens, start + 1, end, names);
  }
  if (token.value === "[") {
    return parseArrayPattern(tokens, start + 1, end, names);
  }
  return start + 1;
}

function parseObjectPattern(
  tokens: Token[],
  start: number,
  end: number,
  names: Set<string>
): number {
  let i = start;
  while (i < end) {
    const token = tokens[i];
    if (!token) {
      return i;
    }
    if (token.value === "}") {
      return i + 1;
    }
    if (token.value === ",") {
      i++;
      continue;
    }
    if (token.value === "...") {
      i++;
      i = parseBindingPattern(tokens, i, end, names);
      i = skipDefaultValue(tokens, i, end, OBJECT_PATTERN_TERMINATORS);
      continue;
    }
    if (token.value === "[") {
      const closeIndex = findMatchingToken(tokens, i, "[", "]");
      i = closeIndex === -1 ? end : closeIndex + 1;
      if (tokens[i] && tokens[i].value === ":") {
        i++;
        i = parseBindingPattern(tokens, i, end, names);
        i = skipDefaultValue(tokens, i, end, OBJECT_PATTERN_TERMINATORS);
      }
      continue;
    }
    if (token.type === "identifier" || token.type === "literal") {
      const key = token.value;
      i++;
      if (tokens[i] && tokens[i].value === ":") {
        i++;
        i = parseBindingPattern(tokens, i, end, names);
      } else if (token.type === "identifier") {
        names.add(key);
      }
      i = skipDefaultValue(tokens, i, end, OBJECT_PATTERN_TERMINATORS);
      continue;
    }
    i++;
  }
  return i;
}

function parseArrayPattern(
  tokens: Token[],
  start: number,
  end: number,
  names: Set<string>
): number {
  let i = start;
  while (i < end) {
    const token = tokens[i];
    if (!token) {
      return i;
    }
    if (token.value === "]") {
      return i + 1;
    }
    if (token.value === ",") {
      i++;
      continue;
    }
    if (token.value === "...") {
      i++;
      i = parseBindingPattern(tokens, i, end, names);
      i = skipDefaultValue(tokens, i, end, ARRAY_PATTERN_TERMINATORS);
      continue;
    }
    i = parseBindingPattern(tokens, i, end, names);
    i = skipDefaultValue(tokens, i, end, ARRAY_PATTERN_TERMINATORS);
    if (tokens[i] && tokens[i].value === ",") {
      i++;
    }
  }
  return i;
}

function collectBindingNamesFromList(
  tokens: Token[],
  start: number,
  end: number,
  names: Set<string>
): void {
  let i = start;
  while (i < end) {
    if (tokens[i] && tokens[i].value === ",") {
      i++;
      continue;
    }
    const nextIndex = parseBindingPattern(tokens, i, end, names);
    if (nextIndex === i) {
      i++;
      continue;
    }
    i = skipParameterSuffix(tokens, nextIndex, end);
    if (tokens[i] && tokens[i].value === ",") {
      i++;
    }
  }
}

function skipParameterSuffix(tokens: Token[], start: number, end: number): number {
  if (!tokens[start]) {
    return start;
  }
  if (tokens[start].value === "=" || tokens[start].value === ":") {
    return findExpressionEnd(tokens, start + 1, end, PARAMETER_TERMINATORS);
  }
  return start;
}

function skipDefaultValue(
  tokens: Token[],
  start: number,
  end: number,
  terminators: Set<string>
): number {
  if (!tokens[start] || tokens[start].value !== "=") {
    return start;
  }
  return findExpressionEnd(tokens, start + 1, end, terminators);
}

function findMatchingToken(tokens: Token[], start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const value = tokens[i].value;
    if (value === open) {
      depth++;
    } else if (value === close) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function findExpressionEnd(
  tokens: Token[],
  start: number,
  end: number,
  terminators: Set<string>
): number {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;

  for (let i = start; i < end; i++) {
    const value = tokens[i].value;
    if (value === "(") {
      depthParen++;
    } else if (value === ")") {
      if (depthParen === 0 && terminators.has(value)) {
        return i;
      }
      depthParen = Math.max(0, depthParen - 1);
    } else if (value === "[") {
      depthBracket++;
    } else if (value === "]") {
      if (depthBracket === 0 && terminators.has(value)) {
        return i;
      }
      depthBracket = Math.max(0, depthBracket - 1);
    } else if (value === "{") {
      depthBrace++;
    } else if (value === "}") {
      if (depthBrace === 0 && terminators.has(value)) {
        return i;
      }
      depthBrace = Math.max(0, depthBrace - 1);
    }

    if (depthParen === 0 && depthBracket === 0 && depthBrace === 0 && terminators.has(value)) {
      return i;
    }
  }

  return end;
}

function isMemberAccess(tokens: Token[], index: number): boolean {
  const prev = tokens[index - 1];
  return prev?.value === "." || prev?.value === "?.";
}

function isObjectKey(tokens: Token[], index: number): boolean {
  const next = tokens[index + 1];
  if (!next || next.value !== ":") {
    return false;
  }
  const prev = tokens[index - 1];
  return prev?.value === "{" || prev?.value === ",";
}

function isCallSite(tokens: Token[], index: number): boolean {
  const next = tokens[index + 1];
  return next?.value === "(";
}

function isShadowed(env: TemplateEnv, scopes: Array<Set<string>>, name: string): boolean {
  if (isLocal(env, name)) {
    return true;
  }
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].has(name)) {
      return true;
    }
  }
  return false;
}

const PARAMETER_TERMINATORS = new Set([","]);
const OBJECT_PATTERN_TERMINATORS = new Set([",", "}"]);
const ARRAY_PATTERN_TERMINATORS = new Set([",", "]"]);
const EXPRESSION_TERMINATORS = new Set([",", ")", "]", "}", ";"]);
const DECLARATION_TERMINATORS = new Set([",", ")", "]", "}", ";"]);
