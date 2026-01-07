import type { PropDeclKind } from "./ast.ts";

/**
 * Template environment for tracking prop aliases and local variables during code generation.
 * 
 * This is a pure data structure with no hidden state or side effects.
 * It is created once per template and passed through the rewriting process
 * to enable deterministic identifier resolution.
 * 
 * - propAliases: Map of prop names declared in #props to their kind (value or callable)
 * - localsStack: Stack of local variable scopes (e.g., @for loop variables)
 */
export interface TemplateEnv {
  propAliases: Map<string, PropDeclKind>;
  localsStack: Array<Set<string>>;
}

/**
 * Create a new TemplateEnv from prop declarations.
 */
export function createTemplateEnv(
  propsDecls?: Array<{ name: string; kind: PropDeclKind }>
): TemplateEnv {
  const propAliases = new Map<string, PropDeclKind>();
  if (propsDecls) {
    for (const decl of propsDecls) {
      propAliases.set(decl.name, decl.kind);
    }
  }
  return {
    propAliases,
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
 * Locals shadow prop aliases.
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
 * Check if a name is a prop alias declared in #props.
 * Returns true only if it's in propAliases and not shadowed by a local.
 */
export function isPropAlias(env: TemplateEnv, name: string): boolean {
  if (isLocal(env, name)) {
    return false;
  }
  return env.propAliases.has(name);
}

/**
 * Result of expression rewriting with usage metadata for diagnostics.
 */
export interface RewriteResult {
  code: string;                      // rewritten expression
  usedBare: Set<string>;             // bare identifiers encountered
  usedPropsDot: Set<string>;         // props.<name> occurrences encountered
  callSitesBare: Set<string>;        // bare identifiers used as calls: name(...)
  callSitesPropsDot: Set<string>;    // props.name(...) occurrences
}

const IGNORED_IDENTIFIERS = new Set([
  "null",
  "undefined",
  "true",
  "false",
  "NaN",
  "Infinity",
  "this",
  "props"
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
 * Rewrite expression, converting bare prop aliases to props.<name>.
 * Returns rewritten code plus metadata about identifier usage for diagnostics.
 * 
 * This function is PURE and does not mutate the AST or environment.
 * The output is deterministic TSX with explicit props.<name> references,
 * making it suitable for future Collie → TSX conversion tooling.
 * 
 * @param expression - The original expression string from the template
 * @param env - Template environment with prop aliases and locals
 * @returns RewriteResult with rewritten code and usage metadata
 */
export function rewriteExpression(expression: string, env: TemplateEnv): RewriteResult {
  let i = 0;
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";
  let output = "";
  
  const usedBare = new Set<string>();
  const usedPropsDot = new Set<string>();
  const callSitesBare = new Set<string>();
  const callSitesPropsDot = new Set<string>();

  while (i < expression.length) {
    const ch = expression[i];

    if (state === "code") {
      if (ch === "'" || ch === "\"") {
        state = ch === "'" ? "single" : "double";
        output += ch;
        i++;
        continue;
      }
      if (ch === "`") {
        state = "template";
        output += ch;
        i++;
        continue;
      }
      if (ch === "/" && expression[i + 1] === "/") {
        state = "line";
        output += ch;
        i++;
        continue;
      }
      if (ch === "/" && expression[i + 1] === "*") {
        state = "block";
        output += ch;
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
        const isMemberAccess = prevNonSpace === "." || prevNonSpace === "?";
        const isObjectKey = nextNonSpace === ":" && (prevNonSpace === "{" || prevNonSpace === ",");
        const isCall = nextNonSpace === "(";

        // Track props.<name> usage
        if (prevNonSpace === "." && start >= 2) {
          const propsStart = findPreviousIdentifierStart(expression, start - 2);
          if (propsStart !== null) {
            const possibleProps = expression.slice(propsStart, start - 1).trim();
            if (possibleProps === "props") {
              usedPropsDot.add(name);
              if (isCall) {
                callSitesPropsDot.add(name);
              }
            }
          }
        }

        if (
          isMemberAccess ||
          isObjectKey ||
          isLocal(env, name) ||
          shouldIgnoreIdentifier(name)
        ) {
          output += name;
          continue;
        }

        // Check if this identifier is a prop alias
        if (isPropAlias(env, name)) {
          // Rewrite to props.<name>
          output += `props.${name}`;
          if (isCall) {
            callSitesBare.add(name);
          }
          continue;
        }

        // Not a prop alias, track as bare identifier
        usedBare.add(name);
        if (isCall) {
          callSitesBare.add(name);
        }
        output += name;
        continue;
      }

      output += ch;
      i++;
      continue;
    }

    if (state === "line") {
      output += ch;
      if (ch === "\n") {
        state = "code";
      }
      i++;
      continue;
    }

    if (state === "block") {
      output += ch;
      if (ch === "*" && expression[i + 1] === "/") {
        output += "/";
        i += 2;
        state = "code";
        continue;
      }
      i++;
      continue;
    }

    if (state === "single") {
      output += ch;
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          output += expression[i + 1];
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
      output += ch;
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          output += expression[i + 1];
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
      output += ch;
      if (ch === "\\") {
        if (i + 1 < expression.length) {
          output += expression[i + 1];
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

  return { code: output, usedBare, usedPropsDot, callSitesBare, callSitesPropsDot };
}

/**
 * Rewrite JSX expression containing embedded braces.
 * 
 * This function is PURE and does not mutate the AST or environment.
 * Recursively processes expressions within braces, maintaining deterministic output.
 * 
 * @param expression - The JSX expression string with potential {...} sections
 * @param env - Template environment with prop aliases and locals
 * @returns RewriteResult with rewritten code and aggregated usage metadata
 */
export function rewriteJsxExpression(expression: string, env: TemplateEnv): RewriteResult {
  let output = "";
  let i = 0;
  
  const usedBare = new Set<string>();
  const usedPropsDot = new Set<string>();
  const callSitesBare = new Set<string>();
  const callSitesPropsDot = new Set<string>();

  while (i < expression.length) {
    const ch = expression[i];
    if (ch === "{") {
      const braceResult = readBalancedBraces(expression, i + 1);
      if (!braceResult) {
        output += expression.slice(i);
        break;
      }
      const result = rewriteExpression(braceResult.content, env);
      output += `{${result.code}}`;
      
      // Merge metadata
      for (const name of result.usedBare) usedBare.add(name);
      for (const name of result.usedPropsDot) usedPropsDot.add(name);
      for (const name of result.callSitesBare) callSitesBare.add(name);
      for (const name of result.callSitesPropsDot) callSitesPropsDot.add(name);
      
      i = braceResult.endIndex + 1;
      continue;
    }
    output += ch;
    i++;
  }

  return { code: output, usedBare, usedPropsDot, callSitesBare, callSitesPropsDot };
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

function findPreviousIdentifierStart(text: string, index: number): number | null {
  // Skip backwards over whitespace
  let i = index;
  while (i >= 0 && /\s/.test(text[i])) {
    i--;
  }
  if (i < 0) return null;
  
  // Now we should be at the end of an identifier, walk back to find its start
  if (!isIdentifierPart(text[i])) {
    return null;
  }
  
  while (i > 0 && isIdentifierPart(text[i - 1])) {
    i--;
  }
  
  return i;
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
