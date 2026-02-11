let jsonMode = false;

export function setOutputOptions(opts: { json?: boolean }) {
  if (opts.json) jsonMode = true;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function output(data: unknown, humanReadable?: string): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else if (humanReadable !== undefined) {
    console.log(humanReadable);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function outputSuccess(message: string, data?: unknown): void {
  if (jsonMode && data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`  ${message}`);
  }
}

export function outputError(message: string): void {
  console.error(`  ${message}`);
}

export function outputWarning(message: string): void {
  if (!jsonMode) {
    console.warn(`  ${message}`);
  }
}

/**
 * Format a simple key-value display
 */
export function formatKeyValue(pairs: Array<[string, string | null | undefined]>): string {
  return pairs
    .filter(([, v]) => v != null)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');
}

/**
 * Format a simple table
 */
export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );

  const headerLine = headers.map((h, i) => h.padEnd(widths[i]!)).join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows
    .map((row) => row.map((cell, i) => (cell ?? '').padEnd(widths[i]!)).join('  '))
    .join('\n');

  return `${headerLine}\n${separator}\n${body}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
