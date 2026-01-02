const COLLIE_SUFFIX = "-collie";
const PASCAL_CASE_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

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

export function isPascalCase(value: string): boolean {
  return PASCAL_CASE_PATTERN.test(value);
}

export function toPascalCase(value: string): string {
  const tokens = value.match(/[A-Za-z0-9]+/g);
  if (!tokens) {
    return "";
  }

  const parts: string[] = [];
  for (const token of tokens) {
    const split = token.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ");
    for (const part of split) {
      if (!part) {
        continue;
      }
      parts.push(part[0].toUpperCase() + part.slice(1).toLowerCase());
    }
  }

  return parts.join("");
}
