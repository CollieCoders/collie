const COLLIE_SUFFIX = "-collie";

export function normalizeIdentifierValue(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let normalized = trimmed;
  if (normalized.endsWith(COLLIE_SUFFIX)) {
    normalized = normalized.slice(0, -COLLIE_SUFFIX.length).trim();
  }

  return normalized ? normalized : undefined;
}

export function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}
