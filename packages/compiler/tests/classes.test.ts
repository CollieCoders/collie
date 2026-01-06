import assert from "node:assert/strict";
import { compile } from "../src/index";

function withId(source: string, id: string): string {
  return `#id ${id}\n${source}`;
}

interface SuccessCase {
  name: string;
  source: string;
  snippets?: string[];
}

interface ErrorCase {
  name: string;
  source: string;
  diagnostics: string[];
}

const successCases: SuccessCase[] = [
  {
    name: "expands aliases inside selectors and preserves literal classes",
    source: `
classes
  viewContainer = container.mx-auto.p-6
  adminPanel    = mt-4.bg-red-100.text-red-700

div.$viewContainer.flex
  @if isAdmin
    div.$adminPanel.rounded
      "Yo"
`.trim(),
    snippets: [
      `className="container mx-auto p-6 flex"`,
      `className="mt-4 bg-red-100 text-red-700 rounded"`
    ]
  },
  {
    name: "merges multiple classes blocks around props",
    source: `
classes
  base = container.mx-auto

props
  user: User

classes
  adminPanel = mt-4.bg-red-100

div.$base.$adminPanel.text-sm
  "Hello"
`.trim(),
    snippets: [`className="container mx-auto mt-4 bg-red-100 text-sm"`]
  },
  {
    name: "allows props before classes",
    source: `
props
  user: User

classes
  badge = rounded-full.bg-slate-100

div.$badge.font-bold
  "User"
`.trim(),
    snippets: [`className="rounded-full bg-slate-100 font-bold"`]
  }
];

const errorCases: ErrorCase[] = [
  {
    name: "classes after template nodes",
    source: `
div.box
  "Hi"

classes
  foo = bar
`.trim(),
    diagnostics: ["COLLIE302"]
  },
  {
    name: "classes block must be top level",
    source: `
div
  classes
    foo = bar
`.trim(),
    diagnostics: ["COLLIE301"]
  },
  {
    name: "classes lines must be indented exactly one level",
    source: `
classes
    foo = bar
`.trim(),
    diagnostics: ["COLLIE303"]
  },
  {
    name: "duplicate alias names",
    source: `
classes
  foo = bar
  foo = baz

div.$foo
  "Hi"
`.trim(),
    diagnostics: ["COLLIE306"]
  },
  {
    name: "undefined alias usage",
    source: `
div.$missing
  "Hi"
`.trim(),
    diagnostics: ["COLLIE307"]
  }
];

runSuccessCases();
runErrorCases();

function runSuccessCases(): void {
  successCases.forEach((test, index) => {
    const result = compile(withId(test.source, `classes.success.${index}`));
    assert.deepEqual(result.diagnostics.map((d) => d.code ?? ""), [], `Unexpected diagnostics for ${test.name}`);
    for (const snippet of test.snippets ?? []) {
      assert.ok(
        result.code.includes(snippet),
        `Code for "${test.name}" should include ${snippet} but was:\n${result.code}`
      );
    }
    console.log(`✓ ${test.name}`);
  });
}

function runErrorCases(): void {
  errorCases.forEach((test, index) => {
    const result = compile(withId(test.source, `classes.error.${index}`));
    const codes = result.diagnostics.map((d) => d.code ?? "");
    assert.deepEqual(
      codes,
      test.diagnostics,
      `Diagnostics for "${test.name}" did not match.\nExpected: ${test.diagnostics.join(", ")}\nReceived: ${codes.join(", ")}`
    );
    console.log(`✓ ${test.name}`);
  });
}

console.log(`✅ Ran ${successCases.length + errorCases.length} class alias tests.`);
