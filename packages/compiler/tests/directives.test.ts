import assert from "node:assert/strict";
import { compile } from "../src/index";

console.log("▶ directives :: @client");

const good = compile(
  `
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
div
  "Hi"
@client
`.trim()
);

assert.deepEqual(misplaced.diagnostics.map((d) => d.code), ["COLLIE401"]);

const duplicate = compile(
  `
@client
@client
div
  "Hello"
`.trim()
);

assert.deepEqual(duplicate.diagnostics.map((d) => d.code), ["COLLIE402"]);

console.log("✅ @client directive tests passed.");
