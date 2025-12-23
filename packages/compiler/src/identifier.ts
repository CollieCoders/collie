const COLLIE_SUFFIX = "-collie";

export function normalizeIdentifierValue(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.endsWith(COLLIE_SUFFIX)) {
    const withoutSuffix = trimmed.slice(0, -COLLIE_SUFFIX.length).trimEnd();
    return withoutSuffix ? withoutSuffix : undefined;
  }
  return trimmed;
}

export function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}
