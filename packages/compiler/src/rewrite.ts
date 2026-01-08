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
  let i = 0;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";
  
  const usedBare = new Set<string>();
  const callSitesBare = new Set<string>();

  while (i < expression.length) {
    const ch = expression[i];

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
      if (ch === "/" && expression[i + 1] === "/") {
        state = "line";
        i++;
        continue;
      }
      if (ch === "/" && expression[i + 1] === "*") {
        state = "block";
        i++;
        continue;
      }
      if (isIdentifierStart(ch)) {
        const start = i;
        i++;
        while (i < expression.length && isIdentifierPart(expression[i])) {
          i++;
        }
        const name = expression.slice(start, i);
        const prevNonSpace = findPreviousNonSpace(expression, start - 1);
        const nextNonSpace = findNextNonSpace(expression, i);
        const isMemberAccess = prevNonSpace === ".";
        const isObjectKey = nextNonSpace === ":" && (prevNonSpace === "{" || prevNonSpace === ",");
        const isCall = nextNonSpace === "(";

        if (
          isMemberAccess ||
          isObjectKey ||
          isLocal(env, name) ||
          shouldIgnoreIdentifier(name)
        ) {
          continue;
        }

        // Track bare identifier usage
        usedBare.add(name);
        if (isCall) {
          callSitesBare.add(name);
        }
        continue;
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
      if (ch === "*" && expression[i + 1] === "/") {
        i += 2;
        state = "code";
        continue;
      }
      i++;
      continue;
    }

    if (state === "single") {
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          i += 2;
          continue;
        }
      }
      if (ch === "'") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "double") {
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          i += 2;
          continue;
        }
      }
      if (ch === "\"") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "template") {
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          i += 2;
          continue;
        }
      }
      if (ch === "`") {
        state = "code";
      }
      i++;
      continue;
    }
  }

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

function findPreviousNonSpace(text: string, index: number): string | null {
  for (let i = index; i >= 0; i--) {
    const ch = text[i];
    if (!/\s/.test(ch)) {
      return ch;
    }
  }
  return null;
}

function findNextNonSpace(text: string, index: number): string | null {
  for (let i = index; i < text.length; i++) {
    const ch = text[i];
    if (!/\s/.test(ch)) {
      return ch;
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
