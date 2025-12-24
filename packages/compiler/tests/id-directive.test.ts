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

const bareIdResult = compileToHtml(
  `
id homeHero
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(bareIdResult.meta?.id, "homeHero", "id homeHero should match #id behavior");
assert.equal(bareIdResult.meta?.rawId, "homeHero", "id directive should expose rawId");

const bareEqualsSyntaxResult = compileToHtml(
  `
id = homeHero
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(bareEqualsSyntaxResult.meta?.id, "homeHero", "id = homeHero should parse correctly");

const bareColonSyntaxResult = compileToHtml(
  `
id: homeHero
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(bareColonSyntaxResult.meta?.id, "homeHero", "id: homeHero should parse correctly");

const bareSuffixedIdResult = compileToHtml(
  `
id homeHero-collie
div.hero
  "Hi"
`.trim(),
  { filename: "/components/hero.collie" }
);
assert.equal(bareSuffixedIdResult.meta?.id, "homeHero", "id homeHero-collie should strip the -collie suffix");
assert.equal(
  bareSuffixedIdResult.meta?.rawId,
  "homeHero-collie",
  "id homeHero-collie should retain the original rawId"
);

const mixedCaseKeywords = ["id", "Id", "ID", "iD", "#ID", "#Id", "#iD"];
for (const keyword of mixedCaseKeywords) {
  const result = compileToHtml(
    `
${keyword} heroCase
div.hero
  "Hi"
`.trim(),
    { filename: "/components/hero.collie" }
  );
  assert.deepEqual(
    result.diagnostics.map((d) => d.code),
    [],
    `${keyword} heroCase should not produce diagnostics`
  );
  assert.equal(result.meta?.id, "heroCase", `${keyword} heroCase should normalize correctly`);
  assert.equal(result.meta?.rawId, "heroCase", `${keyword} heroCase should retain the rawId`);
}

console.log("✅ id directive metadata tests passed.");
