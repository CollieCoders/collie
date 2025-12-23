const PLACEHOLDER_SUFFIX = "-collie";
const PLACEHOLDER_SELECTOR = "[id$='-collie']";
const PARTIAL_BASE_PATH = "/collie/generated";

type PlaceholderEntry = {
  partialId: string;
  element: HTMLElement;
};

export type CollieHtmlRuntimeAPI = {
  refresh: () => Promise<void>;
};

declare global {
  interface Window {
    CollieHtmlRuntime?: CollieHtmlRuntimeAPI;
  }
}

let initialized = false;

export function initCollieHtmlRuntime(): CollieHtmlRuntimeAPI {
  const hasDom =
    typeof window !== "undefined" && typeof document !== "undefined";

  if (!initialized && hasDom) {
    window.CollieHtmlRuntime = { refresh };
    scheduleInitialRefresh();
    initialized = true;
  }

  if (hasDom && window.CollieHtmlRuntime) {
    return window.CollieHtmlRuntime;
  }

  return {
    refresh: async () => {
      /* no-op outside the browser */
    },
  };
}

function scheduleInitialRefresh() {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        void refresh();
      },
      { once: true }
    );
    return;
  }
  void refresh();
}

async function refresh(): Promise<void> {
  const placeholders = collectPlaceholders();
  await Promise.all(
    placeholders.map(({ partialId, element }) =>
      loadAndInjectPartial(partialId, element)
    )
  );
}

function collectPlaceholders(): PlaceholderEntry[] {
  const elements =
    document.querySelectorAll<HTMLElement>(PLACEHOLDER_SELECTOR);
  const entries: PlaceholderEntry[] = [];

  for (const element of elements) {
    const partialId = derivePartialId(element);
    if (!partialId) continue;
    entries.push({ partialId, element });
  }

  return entries;
}

function derivePartialId(element: HTMLElement): string | null {
  const elementId = element.id ?? "";
  if (!elementId || !elementId.endsWith(PLACEHOLDER_SUFFIX)) return null;
  const partialId = elementId.slice(0, -PLACEHOLDER_SUFFIX.length).trim();
  return partialId || null;
}

async function loadAndInjectPartial(
  partialId: string,
  element: HTMLElement
): Promise<void> {
  const url = buildPartialUrl(partialId);
  if (!url) return;

  try {
    const html = await fetchPartialHtml(url);
    element.innerHTML = html;
  } catch (error) {
    const details =
      error instanceof Error ? error.message : JSON.stringify(error);
    console.warn(
      `[CollieHtmlRuntime] Failed to load partial from ${url}: ${details}`
    );
  }
}

function buildPartialUrl(partialId: string): string | null {
  const normalized = partialId.trim();
  if (!normalized) return null;
  return `${PARTIAL_BASE_PATH}/${encodeURIComponent(normalized)}.html`;
}

async function fetchPartialHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${response.statusText})`);
  }
  return response.text();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initCollieHtmlRuntime();
}

export default initCollieHtmlRuntime;
