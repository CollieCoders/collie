import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { withCollie } from "../src/index";

const webpackOptions = { isServer: false };

describe("withCollie", () => {
  it("adds .collie to resolve extensions", () => {
    const plugin = withCollie();
    const config = { resolve: { extensions: [".js"] }, module: { rules: [] } };
    const result = plugin.webpack?.(config as any, webpackOptions as any);

    expect(result?.resolve?.extensions).toContain(".collie");
  });

  it("injects the loader rule", () => {
    const plugin = withCollie();
    const config = { resolve: { extensions: [] }, module: { rules: [] } };
    const result = plugin.webpack?.(config as any, webpackOptions as any);

    expect(result?.module?.rules?.some((rule) => String(rule.test) === "/\\.collie$/")).toBe(true);
  });

  it("avoids duplicating loader rules", () => {
    const plugin = withCollie();
    const config = {
      resolve: { extensions: [".js", ".collie"] },
      module: {
        rules: [
          {
            test: /\.collie$/,
            use: [{ loader: require.resolve("@collie-lang/webpack") }]
          }
        ]
      }
    };
    const result = plugin.webpack?.(config as any, webpackOptions as any);

    const count = result?.module?.rules?.filter((rule) => String(rule.test) === "/\\.collie$/").length ?? 0;
    expect(count).toBe(1);
  });

  it("preserves user webpack overrides", () => {
    const spy = vi.fn((cfg) => {
      cfg.custom = true;
      return cfg;
    });
    const plugin = withCollie({ webpack: spy });
    const config = { resolve: { extensions: [] }, module: { rules: [] } };
    const result = plugin.webpack?.(config as any, webpackOptions as any);

    expect(spy).toHaveBeenCalled();
    expect(result?.custom).toBe(true);
  });

  it("calls optional plugin-level webpack hook", () => {
    const spy = vi.fn((cfg) => {
      cfg.fromOptions = true;
      return cfg;
    });
    const plugin = withCollie({}, { webpack: spy });
    const config = { resolve: { extensions: [] }, module: { rules: [] } };
    const result = plugin.webpack?.(config as any, webpackOptions as any);

    expect(spy).toHaveBeenCalled();
    expect(result?.fromOptions).toBe(true);
  });

  it("warns when no router root is found", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plugin = withCollie();
    const tempDir = mkdtempSync(path.join(tmpdir(), "collie-next-plugin-"));
    try {
      const config = { resolve: { extensions: [] }, module: { rules: [] } };
      plugin.webpack?.(config as any, { ...webpackOptions, dir: tempDir } as any);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not find app/, src/app/, pages/, or src/pages/")
      );
    } finally {
      warn.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
