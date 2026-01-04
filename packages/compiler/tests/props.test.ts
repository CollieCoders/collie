import assert from "node:assert/strict";
import { compile, parseCollie } from "../src/index";

const defaultDialect = {
  tokens: {
    if: { preferred: "@if", allow: ["@if"], onDisallowed: "error" },
    else: { preferred: "@else", allow: ["@else"], onDisallowed: "error" },
    elseIf: { preferred: "@elseIf", allow: ["@elseIf"], onDisallowed: "error" },
    for: { preferred: "@for", allow: ["@for"], onDisallowed: "error" },
    id: {
      preferred: "id",
      allow: ["#id", "#id:", "#id=", "id", "id:", "id="],
      onDisallowed: "warn"
    }
  },
  normalizeOnFormat: true,
  normalizeOnBuild: false,
  props: {
    allowPropsNamespace: true,
    allowDeclaredLocals: true,
    requireDeclarationForLocals: true,
    requirePropsBlockWhen: {
      enabled: false,
      minUniquePropsUsed: 2,
      severity: "warn"
    },
    preferAccessStyle: "either",
    diagnostics: {
      missingDeclaration: "error",
      unusedDeclaration: "warn",
      style: "info"
    }
  }
} as const;

function expectNoDiagnostics(result: ReturnType<typeof compile>, name: string): void {
  const codes = result.diagnostics.map((d) => d.code ?? "");
  assert.deepEqual(
    codes,
    [],
    `Expected no diagnostics for "${name}", but received: ${codes.join(", ")}`
  );
}

const typedResult = compile(
  `
#id props.typed
#props
  name: string

div
  h3 Hello, {{ name }}!
`.trim()
);
expectNoDiagnostics(typedResult, "typed props");
assert.ok(
  typedResult.code.includes("/** @typedef {{ name: string }} Props */"),
  "Typed props result should emit the Props typedef"
);
assert.ok(
  typedResult.code.includes("const { name } = props ?? {};"),
  "Typed props result should destructure props for bare identifiers"
);
assert.ok(
  typedResult.code.includes("props?.name"),
  "Typed props result should reference props-backed identifiers"
);

const looseResult = compile(
  `
#id props.loose
div
  h3 Hello, {{ props.name }}!
`.trim()
);
expectNoDiagnostics(looseResult, "loose props");
assert.ok(
  looseResult.code.includes("/** @typedef {any} Props */"),
  "Loose props mode should emit an any-typed Props typedef"
);
assert.ok(
  looseResult.code.includes("props.name"),
  "Loose props mode should preserve explicit props member access"
);
assert.ok(
  !looseResult.code.includes("const {"),
  "Loose props mode should not destructure props automatically"
);

const bareIdentifierResult = compile(
  `
#id props.bare
div
  h3 Hello, {{ name }}!
`.trim()
);
expectNoDiagnostics(bareIdentifierResult, "bare identifier without props");
assert.ok(
  bareIdentifierResult.code.includes("{props?.name}"),
  "Bare identifier usage without props should resolve via props"
);
assert.ok(
  bareIdentifierResult.code.includes("props?.name"),
  "Bare identifier usage without props should use optional chaining"
);

const conditionalPropsResult = compile(
  `
#id props.conditional

#props
  loggedIn: boolean

@if loggedIn
  div | Hi
`.trim(),
  { dialect: defaultDialect }
);
assert.deepEqual(
  conditionalPropsResult.diagnostics.map((diag) => diag.code),
  [],
  "Props declared in #props should be valid in @if conditions"
);

const conditionalMissingResult = compile(
  `
#id props.conditionalMissing

@if loggedIn
  div | Hi
`.trim(),
  { dialect: defaultDialect }
);
assert.ok(
  conditionalMissingResult.diagnostics.some((diag) => diag.code === "props.missingDeclaration"),
  "Missing props in @if conditions should be reported"
);
assert.ok(
  conditionalMissingResult.diagnostics[0]?.message.includes("`#props`"),
  "Missing props diagnostics should reference #props"
);

const namespaceMissingResult = compile(
  `
#id props.namespaceMissing

div | {{ props.loggedIn }}
`.trim(),
  { dialect: defaultDialect }
);
assert.ok(
  namespaceMissingResult.diagnostics.some((diag) => diag.code === "props.missingDeclaration"),
  "Missing props namespace usages should be reported"
);

const legacyResult = compile(
  `
#id props.legacy
props
  message: string
`.trim()
);
assert.equal(legacyResult.diagnostics.length, 1, "Legacy props syntax should be rejected");
assert.equal(legacyResult.diagnostics[0]?.code, "COLLIE103");
assert.ok(
  legacyResult.diagnostics[0]?.message.includes("`props` must be declared using `#props`"),
  "Legacy props syntax should require the #props directive"
);

const multiTemplate = parseCollie(
  `
#id props.multiA
#props
  foo: string

div | {{ foo }}

#id props.multiB
div | {{ foo }}
`.trim(),
  { dialect: defaultDialect }
);
assert.equal(multiTemplate.templates.length, 2, "Multi-template parse should return two templates");
const multiA = multiTemplate.templates.find((template) => template.id === "props.multiA");
const multiB = multiTemplate.templates.find((template) => template.id === "props.multiB");
assert.ok(multiA, "Template props.multiA should be present");
assert.ok(multiB, "Template props.multiB should be present");
assert.deepEqual(
  multiA?.diagnostics.map((diag) => diag.code),
  [],
  "Declared props should be valid inside their own template"
);
assert.ok(
  multiB?.diagnostics.some((diag) => diag.code === "props.missingDeclaration"),
  "Props used in another template should not be treated as declared"
);

console.log("✅ props tests passed.");
