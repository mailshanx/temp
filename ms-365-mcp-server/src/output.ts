import { encode as toonEncode } from '@toon-format/toon';
import type { ToolResult } from './tool-executor.js';

export type OutputFormat = 'json' | 'compact' | 'toon';

export function formatOutput(result: ToolResult, format: OutputFormat = 'json'): string {
  const data = result.data;

  if (format === 'toon') {
    try {
      return toonEncode(data);
    } catch {
      // Fall back to JSON on TOON encoding failure
      return JSON.stringify(data, null, 2);
    }
  }

  if (format === 'compact') {
    return JSON.stringify(data);
  }

  return JSON.stringify(data, null, 2);
}

export function printResult(result: ToolResult, format: OutputFormat = 'json'): void {
  const output = formatOutput(result, format);

  if (result.isError) {
    process.stderr.write(output + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(output + '\n');
  }
}
