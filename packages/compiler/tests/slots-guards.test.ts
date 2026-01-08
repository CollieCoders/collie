import assert from "node:assert/strict";
import { compile } from "../src/index";

function withId(source: string, id: string): string {
  return `#id ${id}\n${source}`;
}

interface SuccessCase {
  name: string;
  source: string;
  snippets: string[];
}

interface ErrorCase {
  name: string;
  source: string;
  diagnostics: string[];
}

const successCases: SuccessCase[] = [
  {
    name: "component slots compile to inputs",
    source: `
#inputs
  title
  description

Card
  @header
    h2
      {title}
  @body
    p
      {description}
`.trim(),
    snippets: [
      `header={<><h2>{title}</h2></>}`,
      `body={<><p>{description}</p></>}`
    ]
  },
  {
    name: "element guards short-circuit rendering",
    source: `
#inputs
  isVisible

div?isVisible
  span
    "Hello"
`.trim(),
    snippets: [`return (isVisible) && <div`, `{(isVisible) && <div`]
  },
  {
    name: "nested guards compose correctly",
    source: `
#inputs
  outerCondition
  innerCondition

div?outerCondition
  span?innerCondition
    "Nested"
`.trim(),
    snippets: [
      `(outerCondition) && <div`,
      `{(innerCondition) && <span`
    ]
  },
  {
    name: "component guards work alongside slots",
    source: `
#inputs
  showCard

Card?showCard
  @body
    div.wrapper
      "Hello"
`.trim(),
    snippets: [
      `(showCard) && <Card`,
      `body={<><div className="wrapper">Hello</div></>}`
    ]
  }
];

const errorCases: ErrorCase[] = [
  {
    name: "slot outside component is invalid",
    source: `
@header
  div
    "Nope"
`.trim(),
    diagnostics: ["COLLIE501"]
  },
  {
    name: "duplicate slot names",
    source: `
Card
  @header
    h1
      "One"
  @header
    h2
      "Two"
`.trim(),
    diagnostics: ["COLLIE503"]
  },
  {
    name: "guard requires an expression",
    source: `
div?
  span
    "Missing guard"
`.trim(),
    diagnostics: ["COLLIE601"]
  },
  {
    name: "invalid slot syntax produces diagnostic",
    source: `
Card
  @header extra
    p
      "Nope"
`.trim(),
    diagnostics: ["COLLIE502"]
  }
];

successCases.forEach((test, index) => {
  const result = compile(withId(test.source, `slots.success.${index}`));
  assert.deepEqual(
    result.diagnostics.map((d) => d.code ?? ""),
    [],
    `Unexpected diagnostics for ${test.name}`
  );
  for (const snippet of test.snippets) {
    assert.ok(
      result.code.includes(snippet),
      `Code for "${test.name}" should include ${snippet} but was:\n${result.code}`
    );
  }
  console.log(`✓ ${test.name}`);
});

errorCases.forEach((test, index) => {
  const result = compile(withId(test.source, `slots.error.${index}`));
  const codes = result.diagnostics.map((d) => d.code ?? "");
  assert.deepEqual(
    codes,
    test.diagnostics,
    `Diagnostics for "${test.name}" did not match.\nExpected: ${test.diagnostics.join(", ")}\nReceived: ${codes.join(", ")}`
  );
  console.log(`✓ ${test.name}`);
});

console.log(`✅ Ran ${successCases.length + errorCases.length} slot/guard tests.`);
