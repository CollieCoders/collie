import assert from "node:assert/strict";
import { compile } from "../src/index";

console.log("▶ directives :: @client");

const good = compile(
  `
#id directives.client
@client
div
  "Hello from client land"
`.trim()
);

assert.deepEqual(good.diagnostics.map((d) => d.code), []);
const occurrences = good.code.match(/"use client";/g) ?? [];
assert.equal(occurrences.length, 1, "should emit \"use client\" exactly once");
assert.ok(
  good.code.startsWith(`"use client";`),
  `compiled code should begin with "use client"; but was:\n${good.code}`
);

const misplaced = compile(
  `
#id directives.misplaced
div
  "Hi"
@client
`.trim()
);

assert.deepEqual(misplaced.diagnostics.map((d) => d.code), ["COLLIE401"]);

const duplicate = compile(
  `
#id directives.duplicate
@client
@client
div
  "Hello"
`.trim()
);

assert.deepEqual(duplicate.diagnostics.map((d) => d.code), ["COLLIE402"]);

console.log("✅ @client directive tests passed.");

console.log("▶ directives :: conditionals");

const conditionalsGood = compile(
  `
#id directives.conditionals
div
  @if loggedIn
    span | Welcome
  @elseIf loading
    span | Loading...
  @else
    span | Please log in
`.trim()
);
assert.deepEqual(conditionalsGood.diagnostics.map((d) => d.code), []);

const elseWithoutIf = compile(
  `
#id directives.elseWithoutIf
@else
  div | Invalid
`.trim()
);
assert.deepEqual(elseWithoutIf.diagnostics.map((d) => d.code), ["COLLIE206"]);

const elseNested = compile(
  `
#id directives.elseNested
@if a
  div
    @else
      span
`.trim()
);
assert.deepEqual(elseNested.diagnostics.map((d) => d.code), ["COLLIE206"]);

console.log("✅ conditional directive tests passed.");
