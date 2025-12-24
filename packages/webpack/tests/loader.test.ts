import { describe, it, expect, vi, afterEach } from "vitest";
import type { LoaderContext } from "webpack";
import loader from "../src/index";
import * as compiler from "@collie-lang/compiler";

type LoaderThis = LoaderContext<Record<string, unknown>>;

function createContext(overrides: Partial<LoaderThis> = {}) {
  const callback = vi.fn();
  return {
    cacheable: vi.fn(),
    async: vi.fn(() => callback),
    resourcePath: "/tmp/Test.collie",
    ...overrides,
    callback
  } as LoaderThis & { callback: ReturnType<typeof vi.fn> };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collie webpack loader", () => {
  it("compiles valid templates and forwards code", () => {
    const ctx = createContext();
    const callback = ctx.callback;

    loader.call(ctx, "export default function Example()\n  div Hello");

    expect(ctx.cacheable).toHaveBeenCalledWith(true);
    expect(ctx.async).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeNull();
    expect(callback.mock.calls[0][1]).toContain("function ExampleTemplate");
  });

  it("surfaces compiler diagnostics as loader errors", () => {
    vi.spyOn(compiler, "compile").mockReturnValueOnce({
      code: "",
      map: undefined,
      diagnostics: [
        {
          severity: "error",
          message: "boom",
          span: {
            start: { line: 1, col: 1, offset: 0 },
            end: { line: 1, col: 2, offset: 1 }
          }
        }
      ]
    });
    const ctx = createContext();
    const callback = ctx.callback;

    loader.call(ctx, "broken");

    expect(callback).toHaveBeenCalledTimes(1);
    const error = callback.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("Collie compilation failed");
  });

  it("propagates unexpected compiler errors", () => {
    vi.spyOn(compiler, "compile").mockImplementationOnce(() => {
      throw new Error("unexpected");
    });
    const ctx = createContext();
    const callback = ctx.callback;

    loader.call(ctx, "export default function Test()\n  div");

    expect(callback).toHaveBeenCalledTimes(1);
    const error = callback.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("unexpected");
  });
});
