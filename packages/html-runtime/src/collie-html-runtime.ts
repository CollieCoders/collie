type PlaceholderEntry = {
  id: string;
  element: HTMLElement;
};

export type CollieHtmlRuntimeOptions = {
  basePath?: string;
  selectors?: {
    idExact?: string[];
    idSuffix?: string;
    dataAttribute?: string;
  };
  fetchImpl?: typeof fetch;
};

export type CollieHtmlRuntimeAPI = {
  refresh: () => Promise<void>;
  loadPartialById: (id: string) => Promise<string>;
};

declare global {
  interface Window {
    CollieHtmlRuntime?: CollieHtmlRuntimeAPI;
  }
}

const DEFAULT_OPTIONS: Required<Pick<CollieHtmlRuntimeOptions, "basePath" | "selectors">> = {
  basePath: "/collie-generated",
  selectors: {
    idExact: [],
    idSuffix: "-collie",
    dataAttribute: "data-collie-id",
  },
};

let activeOptions: CollieHtmlRuntimeOptions = { ...DEFAULT_OPTIONS };
let initialized = false;

export function initCollieHtmlRuntime(
  options: CollieHtmlRuntimeOptions = {}
): CollieHtmlRuntimeAPI {
  activeOptions = mergeOptions(options);
  if (!initialized) {
    window.CollieHtmlRuntime = {
      refresh,
      loadPartialById,
    };
    scheduleInitialRefresh();
    initialized = true;
  }
  return window.CollieHtmlRuntime!;
}

function mergeOptions(
  options: CollieHtmlRuntimeOptions
): CollieHtmlRuntimeOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    selectors: {
      ...DEFAULT_OPTIONS.selectors,
      ...options.selectors,
    },
  };
}

function scheduleInitialRefresh() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void refresh();
    });
    return;
  }
  void refresh();
}

async function refresh(): Promise<void> {
  const placeholders = collectPlaceholders();
  await Promise.all(
    placeholders.map(({ id, element }) => loadAndInjectPartial(id, element))
  );
}

async function loadPartialById(id: string): Promise<string> {
  return fetchPartialHtml(id);
}

function collectPlaceholders(): PlaceholderEntry[] {
  const config = activeOptions.selectors ?? DEFAULT_OPTIONS.selectors;
  const entries: PlaceholderEntry[] = [];

  if (config.idExact?.length) {
    for (const id of config.idExact) {
      if (!id) continue;
      const el = document.getElementById(id);
      if (el instanceof HTMLElement) {
        entries.push({ id, element: el });
      }
    }
  }

  if (config.idSuffix) {
    const suffix = config.idSuffix;
    const selector = buildAttributeSelector("id", suffix, "$=");
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement) || !el.id.endsWith(suffix)) continue;
      const partialId = el.id.slice(0, -suffix.length);
      if (partialId) {
        entries.push({ id: partialId, element: el });
      }
    }
  }

  if (config.dataAttribute) {
    const attr = config.dataAttribute;
    const selector = buildAttributeSelector(attr);
    for (const el of document.querySelectorAll(selector)) {
      if (!(el instanceof HTMLElement)) continue;
      const value = el.getAttribute(attr);
      if (value) {
        entries.push({ id: value, element: el });
      }
    }
  }

  return dedupePlaceholders(entries);
}

function buildAttributeSelector(
  attr: string,
  value?: string,
  operator: "" | "$=" | "^=" = ""
): string {
  const attrEscaped = escapeForSelector(attr);
  if (value === undefined) {
    return `[${attrEscaped}]`;
  }
  const escaped = escapeForSelector(value);
  return operator
    ? `[${attrEscaped}${operator}"${escaped}"]`
    : `[${attrEscaped}="${escaped}"]`;
}

function dedupePlaceholders(entries: PlaceholderEntry[]): PlaceholderEntry[] {
  const seen = new Set<HTMLElement>();
  const deduped: PlaceholderEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.element)) continue;
    seen.add(entry.element);
    deduped.push(entry);
  }
  return deduped;
}

async function loadAndInjectPartial(
  id: string,
  element: HTMLElement
): Promise<void> {
  try {
    const html = await fetchPartialHtml(id);
    element.innerHTML = html;
  } catch (error) {
    console.warn(`[CollieRuntime] Failed to load partial "${id}"`, error);
  }
}

async function fetchPartialHtml(id: string): Promise<string> {
  const basePath = (activeOptions.basePath || DEFAULT_OPTIONS.basePath).replace(
    /\/$/,
    ""
  );
  const normalizedId = id.trim();
  if (!normalizedId) {
    return "";
  }
  const url = `${basePath}/${normalizedId}.html`;
  const fetchImpl = activeOptions.fetchImpl ?? fetch;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.text();
}

function escapeForSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

initCollieHtmlRuntime();

export default initCollieHtmlRuntime;
