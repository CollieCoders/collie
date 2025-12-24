import path from "node:path";

import type {
  CollieConfig,
  CollieProjectConfig,
  NormalizedCollieConfig,
  NormalizedCollieProjectConfig
} from "./types";

interface NormalizeOptions {
  cwd?: string;
}

export function normalizeConfig(
  config: CollieConfig,
  options: NormalizeOptions = {}
): NormalizedCollieConfig {
  const cwd = options.cwd ?? process.cwd();
  const normalizedProjects = config.projects.map((project, index) =>
    normalizeProject(project, index, cwd)
  );

  return {
    ...config,
    projects: normalizedProjects
  };
}

function normalizeProject(
  project: CollieProjectConfig,
  index: number,
  cwd: string
): NormalizedCollieProjectConfig {
  const name = project.name ?? `${project.type}-${index}`;
  const root = project.root
    ? path.isAbsolute(project.root)
      ? project.root
      : path.resolve(cwd, project.root)
    : cwd;
  const input = Array.isArray(project.input) ? project.input : [project.input];

  return {
    ...project,
    name,
    root,
    input,
    output: project.output ?? {},
    html: project.html,
    react: project.react
  };
}
