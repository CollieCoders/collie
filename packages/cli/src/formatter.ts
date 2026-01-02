import fs from "node:fs/promises";
import { formatCollie, type FormatOptions as CoreFormatOptions, type FormatResult } from "@collie-lang/compiler";

export type FormatOptions = CoreFormatOptions;
export type FormatSourceResult = FormatResult;

export interface FormatFileResult extends FormatSourceResult {
  changed: boolean;
}

export function formatSource(source: string, options: FormatOptions = {}): FormatSourceResult {
  return formatCollie(source, options);
}

export async function formatFile(filepath: string, options: FormatOptions = {}): Promise<FormatFileResult> {
  const original = await fs.readFile(filepath, "utf8");
  const result = formatSource(original, options);
  return {
    ...result,
    changed: result.formatted !== original
  };
}
