import path from "node:path";

import type {
  CollieConfig,
  CollieCssOptions,
  CollieDialectOptions,
  CollieDialectTokenRule,
  CollieDialectTokenKind,
  CollieDiagnosticLevel,
  CollieProjectConfig,
  NormalizedCollieConfig,
  NormalizedCollieCssOptions,
  NormalizedCollieDialectOptions,
  NormalizedCollieDialectPropsOptions,
  NormalizedCollieDialectTokenRule,
  NormalizedCollieDialectTokens,
  NormalizedCollieProjectConfig
} from "./types";

interface NormalizeOptions {
  cwd?: string;
}

export function normalizeConfig(
  config: CollieConfig,
  options: NormalizeOptions = {}
): NormalizedCollieConfig {
  const cwd = options.cwd ?? process.cwd();
  const normalizedProjects = config.projects.map((project, index) =>
    normalizeProject(project, index, cwd)
  );
  const normalizedCss = normalizeCssOptions(config.css);
  const normalizedDialect = normalizeDialectOptions(config.dialect);

  return {
    ...config,
    css: normalizedCss,
    dialect: normalizedDialect,
    projects: normalizedProjects
  };
}

function normalizeProject(
  project: CollieProjectConfig,
  index: number,
  cwd: string
): NormalizedCollieProjectConfig {
  const name = project.name ?? `${project.type}-${index}`;
  const root = project.root
    ? path.isAbsolute(project.root)
      ? project.root
      : path.resolve(cwd, project.root)
    : cwd;
  const input = Array.isArray(project.input) ? project.input : [project.input];

  return {
    ...project,
    name,
    root,
    input,
    output: project.output ?? {},
    html: project.html,
    react: project.react
  };
}

const CSS_STRATEGIES = ["tailwind", "global", "unknown"] as const;
const DIAGNOSTIC_LEVELS = ["off", "info", "warn", "error"] as const;
const ACCESS_STYLES = ["locals", "namespace", "either"] as const;

const DEFAULT_DIALECT_TOKENS: NormalizedCollieDialectTokens = {
  if: { preferred: "@if", allow: ["@if"], onDisallowed: "error" },
  else: { preferred: "@else", allow: ["@else"], onDisallowed: "error" },
  elseIf: { preferred: "@elseIf", allow: ["@elseIf"], onDisallowed: "error" },
  for: { preferred: "@for", allow: ["@for"], onDisallowed: "error" },
  id: {
    preferred: "id",
    allow: ["#id", "#id:", "#id=", "id", "id:", "id="],
    onDisallowed: "warn"
  }
};

function normalizeCssOptions(input: CollieCssOptions | undefined): NormalizedCollieCssOptions {
  if (input !== undefined && !isPlainObject(input)) {
    throw new Error(`Invalid "css": expected an object.`);
  }
  const strategy = normalizeEnum(input?.strategy, "css.strategy", CSS_STRATEGIES, "unknown");
  if (input?.diagnostics !== undefined && !isPlainObject(input.diagnostics)) {
    throw new Error(`Invalid "css.diagnostics": expected an object.`);
  }
  const unknownClassDefault = strategy === "global" ? "warn" : "off";
  const unknownClass = normalizeDiagnosticLevel(
    input?.diagnostics?.unknownClass,
    "css.diagnostics.unknownClass",
    unknownClassDefault
  );

  return {
    strategy,
    diagnostics: {
      unknownClass
    }
  };
}

function normalizeDialectOptions(input: CollieDialectOptions | undefined): NormalizedCollieDialectOptions {
  if (input !== undefined && !isPlainObject(input)) {
    throw new Error(`Invalid "dialect": expected an object.`);
  }

  const tokens = normalizeTokenRules(input?.tokens);
  const normalizeOnFormat = normalizeBoolean(input?.normalizeOnFormat, "dialect.normalizeOnFormat", true);
  const normalizeOnBuild = normalizeBoolean(input?.normalizeOnBuild, "dialect.normalizeOnBuild", false);
  const props = normalizeDialectProps(input?.props);

  return {
    tokens,
    normalizeOnFormat,
    normalizeOnBuild,
    props
  };
}

function normalizeTokenRules(input: CollieDialectOptions["tokens"] | undefined): NormalizedCollieDialectTokens {
  if (input !== undefined && !isPlainObject(input)) {
    throw new Error(`Invalid "dialect.tokens": expected an object.`);
  }

  const normalized = {} as NormalizedCollieDialectTokens;
  const kinds = Object.keys(DEFAULT_DIALECT_TOKENS) as CollieDialectTokenKind[];

  for (const kind of kinds) {
    const rule = input?.[kind];
    normalized[kind] = normalizeTokenRule(kind, rule, DEFAULT_DIALECT_TOKENS[kind]);
  }

  return normalized;
}

function normalizeTokenRule(
  kind: CollieDialectTokenKind,
  rule: CollieDialectTokenRule | undefined,
  defaults: NormalizedCollieDialectTokenRule
): NormalizedCollieDialectTokenRule {
  if (rule !== undefined && !isPlainObject(rule)) {
    throw new Error(`Invalid "dialect.tokens.${kind}": expected an object.`);
  }

  const preferred = normalizeString(
    rule?.preferred,
    `dialect.tokens.${kind}.preferred`,
    defaults.preferred
  );
  const allow = normalizeStringArray(
    rule?.allow,
    `dialect.tokens.${kind}.allow`,
    defaults.allow
  );
  const onDisallowed = normalizeDiagnosticLevel(
    rule?.onDisallowed,
    `dialect.tokens.${kind}.onDisallowed`,
    defaults.onDisallowed
  );
  const normalizedAllow = normalizeAllowList(allow, preferred);

  return {
    preferred,
    allow: normalizedAllow,
    onDisallowed
  };
}

function normalizeDialectProps(
  input: CollieDialectOptions["props"] | undefined
): NormalizedCollieDialectPropsOptions {
  if (input !== undefined && !isPlainObject(input)) {
    throw new Error(`Invalid "dialect.props": expected an object.`);
  }

  const allowPropsNamespace = normalizeBoolean(
    input?.allowPropsNamespace,
    "dialect.props.allowPropsNamespace",
    true
  );
  const allowDeclaredLocals = normalizeBoolean(
    input?.allowDeclaredLocals,
    "dialect.props.allowDeclaredLocals",
    true
  );
  const requireDeclarationForLocals = normalizeBoolean(
    input?.requireDeclarationForLocals,
    "dialect.props.requireDeclarationForLocals",
    allowDeclaredLocals
  );
  if (!allowDeclaredLocals && requireDeclarationForLocals) {
    throw new Error(
      `Invalid "dialect.props.requireDeclarationForLocals": cannot be true when allowDeclaredLocals is false.`
    );
  }

  if (input?.requirePropsBlockWhen !== undefined && !isPlainObject(input.requirePropsBlockWhen)) {
    throw new Error(`Invalid "dialect.props.requirePropsBlockWhen": expected an object.`);
  }
  const requirePropsBlockWhenEnabled = normalizeBoolean(
    input?.requirePropsBlockWhen?.enabled,
    "dialect.props.requirePropsBlockWhen.enabled",
    false
  );
  const requirePropsBlockWhenMin = normalizePositiveInteger(
    input?.requirePropsBlockWhen?.minUniquePropsUsed,
    "dialect.props.requirePropsBlockWhen.minUniquePropsUsed",
    2
  );
  const requirePropsBlockWhenSeverity = normalizeDiagnosticLevel(
    input?.requirePropsBlockWhen?.severity,
    "dialect.props.requirePropsBlockWhen.severity",
    "warn"
  );

  const preferAccessStyle = normalizeEnum(
    input?.preferAccessStyle,
    "dialect.props.preferAccessStyle",
    ACCESS_STYLES,
    "either"
  );

  if (input?.diagnostics !== undefined && !isPlainObject(input.diagnostics)) {
    throw new Error(`Invalid "dialect.props.diagnostics": expected an object.`);
  }
  const missingDeclaration = normalizeDiagnosticLevel(
    input?.diagnostics?.missingDeclaration,
    "dialect.props.diagnostics.missingDeclaration",
    "error"
  );
  const unusedDeclaration = normalizeDiagnosticLevel(
    input?.diagnostics?.unusedDeclaration,
    "dialect.props.diagnostics.unusedDeclaration",
    "warn"
  );
  const style = normalizeDiagnosticLevel(
    input?.diagnostics?.style,
    "dialect.props.diagnostics.style",
    "info"
  );

  return {
    allowPropsNamespace,
    allowDeclaredLocals,
    requireDeclarationForLocals,
    requirePropsBlockWhen: {
      enabled: requirePropsBlockWhenEnabled,
      minUniquePropsUsed: requirePropsBlockWhenMin,
      severity: requirePropsBlockWhenSeverity
    },
    preferAccessStyle,
    diagnostics: {
      missingDeclaration,
      unusedDeclaration,
      style
    }
  };
}

function normalizeBoolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid "${path}": expected a boolean.`);
  }
  return value;
}

function normalizePositiveInteger(value: unknown, path: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) {
    throw new Error(`Invalid "${path}": expected a positive integer.`);
  }
  return value;
}

function normalizeEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  fallback: T
): T {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Invalid "${path}": expected one of ${allowed.join(", ")}.`);
  }
  return value as T;
}

function normalizeDiagnosticLevel(
  value: unknown,
  path: string,
  fallback: CollieDiagnosticLevel
): CollieDiagnosticLevel {
  return normalizeEnum(value, path, DIAGNOSTIC_LEVELS, fallback);
}

function normalizeString(value: unknown, path: string, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid "${path}": expected a non-empty string.`);
  }
  return value;
}

function normalizeStringArray(value: unknown, path: string, fallback: string[]): string[] {
  if (value === undefined) {
    return [...fallback];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Invalid "${path}": expected an array of strings.`);
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error(`Invalid "${path}": entries must be non-empty strings.`);
    }
  }
  return [...value];
}

function normalizeAllowList(allow: string[], preferred: string): string[] {
  const allowSet = new Set(allow);
  allowSet.add(preferred);
  const normalized = Array.from(allowSet);
  normalized.sort();
  return normalized;
}

function isPlainObject(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
