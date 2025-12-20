import path from "node:path";

export function resolveOutputPath(filepath: string, baseDir: string, outDir?: string): string {
  const outputBase = outDir ?? baseDir;
  const relative = path.relative(baseDir, filepath);
  const ext = path.extname(relative);
  const withoutExt = ext ? relative.slice(0, -ext.length) : relative;
  return path.join(outputBase, `${withoutExt}.tsx`);
}

export function toDisplayPath(target: string): string {
  const relative = path.relative(process.cwd(), target);
  if (!relative || relative.startsWith("..") || relative.startsWith("..\\")) {
    return target;
  }
  return relative;
}
