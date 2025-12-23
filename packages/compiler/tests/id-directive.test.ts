import assert from "node:assert/strict";
import { compileToHtml } from "../src/index";

console.log("▶ id directive :: metadata resolution");

const baseTemplate = `
div.wrapper
  "Hello"
`.trim();

const fallbackResult = compileToHtml(baseTemplate, { filename: "/components/hero.collie" });
assert.deepEqual(
  fallbackResult.diagnostics.map((d) => d.code),
  [],
  "fallback identifier compile should not produce diagnostics"
);
assert.equal(fallbackResult.meta?.id, "hero", "filename-only compile should derive id from basename");
assert.equal(fallbackResult.meta?.rawId, undefined, "fallback identifier should not expose rawId");
assert.equal(
  fallbackResult.meta?.filename,
  "/components/hero.collie",
  "meta.filename should echo the provided filename"
);

const explicitResult = compileToHtml(
  `
#id homeHero
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(explicitResult.meta?.id, "homeHero", "#id homeHero should override filename");
assert.equal(explicitResult.meta?.rawId, "homeHero", "#id directive should expose rawId");

const suffixedIdResult = compileToHtml(
  `
#id homeHero-collie
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(suffixedIdResult.meta?.id, "homeHero", "#id homeHero-collie should strip the -collie suffix");
assert.equal(
  suffixedIdResult.meta?.rawId,
  "homeHero-collie",
  "#id homeHero-collie should retain the original rawId"
);

const suffixedFilenameResult = compileToHtml(baseTemplate, { filename: "/components/header-collie.collie" });
assert.equal(
  suffixedFilenameResult.meta?.id,
  "header",
  "header-collie.collie should derive identifier header"
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

console.log("✅ id directive metadata tests passed.");
