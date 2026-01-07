/// <reference path="./virtual.d.ts" />
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CollieRegistry, CollieTemplateModule } from "./registry.d.ts";
import { registry } from "virtual:collie/registry";

type RenderFn = (props: any) => any;

export interface CollieProps extends Record<string, unknown> {
  id: string;
  fallback?: ReactNode;
}

interface LoadState {
  render: RenderFn | null;
  error: Error | null;
}

function buildMissingIdError(requestedId: string, reg: CollieRegistry): Error {
  const knownIds = Object.keys(reg);
  const lines: string[] = [
    `Unknown Collie template id "${requestedId}".`,
    "Ensure @collie-lang/vite is configured and the template exists."
  ];
  if (knownIds.length) {
    lines.push(`Known ids (${Math.min(knownIds.length, 5)} shown):`);
    lines.push(...knownIds.slice(0, 5).map((id) => `- ${id}`));
    if (knownIds.length > 5) {
      lines.push("...");
    }
  }
  return new Error(lines.join("\n"));
}

function normalizeRenderModule(mod: CollieTemplateModule | undefined, id: string): RenderFn {
  if (mod && typeof mod.render === "function") {
    return mod.render;
  }
  throw new Error(`Collie template "${id}" did not export render(props).`);
}

export function Collie(props: CollieProps) {
  const { id, fallback = null, ...rest } = props;
  const [state, setState] = useState<LoadState>({ render: null, error: null });

  const loader = useMemo(() => registry[id], [id]);

  useEffect(() => {
    let cancelled = false;
    setState({ render: null, error: null });

    if (!loader) {
      setState({ render: null, error: buildMissingIdError(id, registry) });
      return () => {
        cancelled = true;
      };
    }

    loader()
      .then((mod) => {
        if (cancelled) return;
        const render = normalizeRenderModule(mod, id);
        setState({ render, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        setState({ render: null, error: err });
      });

    return () => {
      cancelled = true;
    };
  }, [id, loader]);

  if (state.error) {
    throw state.error;
  }

  if (!state.render) {
    return <>{fallback ?? null}</>;
  }

  return <>{state.render(rest)}</>;
}

export type { CollieRegistry, CollieTemplateModule };
