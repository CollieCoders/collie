import stripAnsiModule from 'strip-ansi';

export const stripAnsi = (value: string): string => stripAnsiModule(value ?? '');

export const normalizeNewlines = (value: string): string => value.replace(/\r\n/g, '\n');

export const normalizeCliOutput = (value: string): string =>
  normalizeNewlines(stripAnsi(value ?? '')).trim();
