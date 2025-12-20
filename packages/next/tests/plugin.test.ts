import { describe, it, expect, vi } from "vitest";
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
});
