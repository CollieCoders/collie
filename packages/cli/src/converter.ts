import fs from "node:fs/promises";
import path from "node:path";
import { convertTsxToCollie } from "@collie-lang/compiler";

export interface ConvertOptions {
  write?: boolean;
  overwrite?: boolean;
  removeOriginal?: boolean;
}

export interface ConvertResult {
  collie: string;
  outputPath?: string;
  warnings: string[];
}

export async function convertFile(filepath: string, options: ConvertOptions = {}): Promise<ConvertResult> {
  const source = await fs.readFile(filepath, "utf8");
  const result = convertTsxToCollie(source, { filename: filepath });
  const { collie, warnings } = result;
  let outputPath: string | undefined;

  if (options.write) {
    outputPath = resolveOutputPath(filepath);
    if (!options.overwrite) {
      const exists = await fileExists(outputPath);
      if (exists) {
        throw new Error(`${path.relative(process.cwd(), outputPath)} already exists. Use --overwrite to replace.`);
      }
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, collie, "utf8");
    if (options.removeOriginal) {
      await fs.unlink(filepath);
    }
  }

  return { collie, warnings, outputPath };
}

function resolveOutputPath(filepath: string): string {
  return filepath.replace(/\.[tj]sx?$/, "") + ".collie";
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}
