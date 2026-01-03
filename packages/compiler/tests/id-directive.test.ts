import assert from "node:assert/strict";
import { compileToHtml, parseCollie } from "../src/index";

console.log("▶ id directive :: multi-template ids");

const missingIdResult = compileToHtml(
  `
div.wrapper
  "Hello"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.ok(
  missingIdResult.diagnostics.some((diag) => diag.code === "COLLIE701"),
  "Missing #id should report an error"
);
assert.equal(missingIdResult.meta?.id, undefined, "Missing #id should not set meta.id");

const explicitResult = compileToHtml(
  `
#id homeHero
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(explicitResult.meta?.id, "homeHero", "#id homeHero should set meta.id");
assert.equal(explicitResult.meta?.rawId, "homeHero", "#id directive should expose rawId");

const suffixedIdResult = compileToHtml(
  `
#id homeHero-collie
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(
  suffixedIdResult.meta?.id,
  "homeHero-collie",
  "#id homeHero-collie should retain the full id"
);
assert.equal(
  suffixedIdResult.meta?.rawId,
  "homeHero-collie",
  "#id homeHero-collie should retain the original rawId"
);

const equalsSyntaxResult = compileToHtml(
  `
#id = homeHero
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(equalsSyntaxResult.meta?.id, "homeHero", "#id = homeHero should parse correctly");

const colonSyntaxResult = compileToHtml(
  `
#id: homeHero
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(colonSyntaxResult.meta?.id, "homeHero", "#id: homeHero should parse correctly");

const invalidIdResult = compileToHtml(
  `
#id 9bad
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.ok(
  invalidIdResult.diagnostics.some((diag) => diag.code === "COLLIE702"),
  "Invalid #id values should report an error"
);

const duplicateIdResult = compileToHtml(
  `
#id hero
div.hero
  "Hi"

#id hero
div.hero
  "Again"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.ok(
  duplicateIdResult.diagnostics.some((diag) => diag.code === "COLLIE703"),
  "Duplicate #id values should report an error"
);

const multiTemplateResult = parseCollie(
  `
#id one
div
  "First"

#id two
div
  "Second"
`.trim()
);
assert.equal(multiTemplateResult.templates.length, 2, "Should parse multiple #id blocks into templates");

console.log("✅ id directive tests passed.");
