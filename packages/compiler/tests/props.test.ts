import assert from "node:assert/strict";
import { compile } from "../src/index";

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
props
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
  typedResult.code.includes("const { name } = props;"),
  "Typed props result should destructure props for bare identifiers"
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
  bareIdentifierResult.code.includes("{name}"),
  "Bare identifier usage without props should not be rewritten to props.name"
);
assert.ok(
  !bareIdentifierResult.code.includes("props.name"),
  "Bare identifier usage without props should remain untouched"
);

console.log("✅ props tests passed.");
