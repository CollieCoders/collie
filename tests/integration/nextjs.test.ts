import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const shouldRun = process.env.COLLIE_RUN_NEXT_TESTS === "true";
const describeMaybe = shouldRun ? describe : describe.skip;

describeMaybe(
  "Next.js CLI integration",
  () => {
    const cliBin = path.resolve(__dirname, "../../packages/cli/dist/index.js");
    let sandbox: string;

    beforeAll(() => {
      sandbox = mkdtempSync(path.join(tmpdir(), "collie-nextjs-"));
    });

    afterAll(() => {
      rmSync(sandbox, { recursive: true, force: true });
    });

    it("scaffolds a Next.js project with Collie wiring", () => {
      const project = "collie-next-example";
      execSync(
        `node ${JSON.stringify(cliBin)} init --framework nextjs --project ${project} --no-install`,
        {
          cwd: sandbox,
          stdio: "inherit"
        }
      );

      const projectPath = path.join(sandbox, project);
      expect(existsSync(projectPath)).toBe(true);
      expect(existsSync(path.join(projectPath, "next.config.ts")) || existsSync(path.join(projectPath, "next.config.js"))).toBe(true);
      expect(existsSync(path.join(projectPath, "src", "components", "Welcome.collie"))).toBe(true);
    });
  },
  { timeout: 120_000 }
);
