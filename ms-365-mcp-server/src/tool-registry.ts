import logger from './logger.js';
import { api } from './generated/client.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOOL_CATEGORIES } from './tool-categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface EndpointConfig {
  pathPattern: string;
  method: string;
  toolName: string;
  scopes?: string[];
  workScopes?: string[];
  returnDownloadUrl?: boolean;
  supportsTimezone?: boolean;
  supportsExpandExtendedProperties?: boolean;
  llmTip?: string;
  skipEncoding?: string[];
  contentType?: string;
}

const endpointsData = JSON.parse(
  readFileSync(path.join(__dirname, 'endpoints.json'), 'utf8')
) as EndpointConfig[];

export type EndpointDef = (typeof api.endpoints)[0];

export interface ToolEntry {
  name: string;
  endpoint: EndpointDef;
  config: EndpointConfig | undefined;
  description: string;
  method: string;
  path: string;
}

export class ToolRegistry {
  private tools: Map<string, ToolEntry>;

  constructor(opts: {
    readOnly?: boolean;
    orgMode?: boolean;
    enabledToolsPattern?: string;
  } = {}) {
    this.tools = new Map();

    let enabledToolsRegex: RegExp | undefined;
    if (opts.enabledToolsPattern) {
      try {
        enabledToolsRegex = new RegExp(opts.enabledToolsPattern, 'i');
        logger.info(`Tool filtering enabled with pattern: ${opts.enabledToolsPattern}`);
      } catch {
        logger.error(`Invalid tool filter regex pattern: ${opts.enabledToolsPattern}. Ignoring filter.`);
      }
    }

    for (const endpoint of api.endpoints) {
      const config = endpointsData.find((e) => e.toolName === endpoint.alias);

      // Skip work-only tools when not in org mode
      if (!opts.orgMode && config && !config.scopes && config.workScopes) {
        continue;
      }

      // Skip write operations in read-only mode
      if (opts.readOnly && endpoint.method.toUpperCase() !== 'GET') {
        continue;
      }

      // Skip tools that don't match the filter
      if (enabledToolsRegex && !enabledToolsRegex.test(endpoint.alias)) {
        continue;
      }

      let description = endpoint.description || `Execute ${endpoint.method.toUpperCase()} request to ${endpoint.path}`;
      if (config?.llmTip) {
        description += `\n\nTIP: ${config.llmTip}`;
      }

      this.tools.set(endpoint.alias, {
        name: endpoint.alias,
        endpoint,
        config,
        description,
        method: endpoint.method.toUpperCase(),
        path: endpoint.path,
      });
    }

    logger.info(`Tool registry initialized: ${this.tools.size} tools available`);
  }

  get(name: string): ToolEntry | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolEntry[] {
    return Array.from(this.tools.values());
  }

  search(query?: string, category?: string, limit: number = 20): ToolEntry[] {
    const results: ToolEntry[] = [];
    const queryLower = query?.toLowerCase();
    const categoryDef = category ? TOOL_CATEGORIES[category] : undefined;

    for (const entry of this.tools.values()) {
      if (categoryDef && !categoryDef.pattern.test(entry.name)) {
        continue;
      }

      if (queryLower) {
        const searchText = `${entry.name} ${entry.path} ${entry.description}`.toLowerCase();
        if (!searchText.includes(queryLower)) {
          continue;
        }
      }

      results.push(entry);
      if (results.length >= limit) break;
    }

    return results;
  }

  get size(): number {
    return this.tools.size;
  }
}
