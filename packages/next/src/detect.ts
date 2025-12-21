import { existsSync } from "node:fs";
import path from "node:path";

export type NextRouterType = "app" | "pages";

export interface NextDirectoryInfo {
  baseDir: string;
  routerType: NextRouterType;
  detected: boolean;
}

const CANDIDATES: Array<{ baseDir: string; routerType: NextRouterType }> = [
  { baseDir: "app", routerType: "app" },
  { baseDir: path.join("src", "app"), routerType: "app" },
  { baseDir: "pages", routerType: "pages" },
  { baseDir: path.join("src", "pages"), routerType: "pages" }
];

export function detectNextDirectory(projectRoot: string): NextDirectoryInfo {
  for (const candidate of CANDIDATES) {
    if (existsSync(path.join(projectRoot, candidate.baseDir))) {
      return { ...candidate, detected: true };
    }
  }
  return { baseDir: "app", routerType: "app", detected: false };
}
