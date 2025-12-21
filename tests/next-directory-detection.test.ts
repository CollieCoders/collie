import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setupNextJs } from "../packages/cli/src/nextjs-setup";

const sandboxes: string[] = [];

afterEach(() => {
  while (sandboxes.length) {
    const dir = sandboxes.pop();
    if (dir && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

interface Scenario {
  name: string;
  baseDir: string[];
  routerType: "app" | "pages";
}

const scenarios: Scenario[] = [
  { name: "app/ at project root", baseDir: ["app"], routerType: "app" },
  { name: "src/app/", baseDir: ["src", "app"], routerType: "app" },
  { name: "pages/ at project root", baseDir: ["pages"], routerType: "pages" },
  { name: "src/pages/", baseDir: ["src", "pages"], routerType: "pages" }
];

describe("setupNextJs directory detection", () => {
  for (const scenario of scenarios) {
    it(`writes files under ${scenario.name}`, async () => {
      const projectRoot = createProject(scenario.baseDir);
      const info = await setupNextJs(projectRoot, { skipDetectionLog: true, collieNextVersion: "0.0.0-test" });
      const expectedBase = path.join(...scenario.baseDir);
      const normalizedBase = normalizePath(info.baseDir);

      expect(info.detected).toBe(true);
      expect(info.routerType).toBe(scenario.routerType);
      expect(normalizedBase).toBe(normalizePath(expectedBase));

      const declPath = path.join(projectRoot, expectedBase, "collie.d.ts");
      const examplePath = path.join(projectRoot, expectedBase, "components", "Welcome.collie");
      expect(existsSync(declPath)).toBe(true);
      expect(existsSync(examplePath)).toBe(true);
    });
  }

  it("skips writing files when no supported directory exists", async () => {
    const projectRoot = createProjectWithoutDir();
    const info = await setupNextJs(projectRoot, { skipDetectionLog: true, collieNextVersion: "0.0.0-test" });

    expect(info.detected).toBe(false);
    expect(existsSync(path.join(projectRoot, "app", "collie.d.ts"))).toBe(false);
    expect(existsSync(path.join(projectRoot, "app", "components", "Welcome.collie"))).toBe(false);
  });
});

function createProject(dirParts: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "collie-next-setup-"));
  sandboxes.push(root);
  const pkg = {
    name: "collie-next-temp",
    version: "0.0.0",
    dependencies: {
      next: "14.0.0"
    }
  };
  writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg, null, 2));
  mkdirSync(path.join(root, ...dirParts), { recursive: true });
  // Seed an initial next.config.js so patcher exercises the patch path.
  writeFileSync(path.join(root, "next.config.js"), "module.exports = {};\n");
  return root;
}

function createProjectWithoutDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), "collie-next-missing-"));
  sandboxes.push(root);
  const pkg = {
    name: "collie-next-temp",
    version: "0.0.0",
    dependencies: {
      next: "14.0.0"
    }
  };
  writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg, null, 2));
  writeFileSync(path.join(root, "next.config.js"), "module.exports = {};\n");
  return root;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
