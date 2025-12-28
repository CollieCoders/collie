import stripAnsi from 'strip-ansi';

export const normalizeLineEndings = (value: string): string => value.replace(/\r\n/g, '\n');

export const normalizeOutput = (value: string): string =>
  normalizeLineEndings(stripAnsi(value ?? '')).trim();
