import assert from "node:assert/strict";
import { compileToHtml } from "../src/index";

console.log("▶ html-codegen :: implicit div shorthand");

const source = `
#id html.codegen
section.hero
  .hero-inner
    p Hello, world!
`.trim();

const result = compileToHtml(source);

assert.deepEqual(result.diagnostics, [], "implicit div shorthand should not produce diagnostics");
assert.ok(
  result.code.includes('<section class="hero">'),
  "section should be rendered with its class attribute"
);
assert.ok(
  result.code.includes('<div class="hero-inner">'),
  "implicit div shorthand should render a div with the collected classes"
);
assert.ok(result.code.includes("<p>Hello, world!</p>"), "child content should render inline text");

console.log("✅ html-codegen implicit div shorthand test passed.");
