import { Command } from 'commander';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCombinedPresetPattern, listPresets, presetRequiresOrgMode } from './tool-categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const program = new Command();

program
  .name('ms365')
  .description('Microsoft 365 CLI — interact with the Graph API from the command line')
  .version(version);

// ── Global options ──────────────────────────────────────────────────────────
program
  .option('-v', 'Enable verbose logging')
  .option('--read-only', 'Disable write operations (only allow GET tools)')
  .option(
    '--enabled-tools <pattern>',
    'Filter tools using regex pattern (e.g., "excel|contact")'
  )
  .option(
    '--preset <names>',
    'Use preset tool categories (comma-separated). Available: mail, calendar, files, personal, work, excel, contacts, tasks, onenote, search, users, all'
  )
  .option('--list-presets', 'List all available presets and exit')
  .option(
    '--org-mode',
    'Enable organization/work mode (includes Teams, SharePoint, etc.)'
  )
  .option('--work-mode', 'Alias for --org-mode')
  .option('--force-work-scopes', 'Backwards compatibility alias for --org-mode (deprecated)')
  .option('--toon', '(experimental) Enable TOON output format')
  .option('--compact', 'Output minified JSON (for piping)')
  .option('--cloud <type>', 'Microsoft cloud environment: global (default) or china (21Vianet)');

// ── Auth commands ───────────────────────────────────────────────────────────
program
  .command('login')
  .description('Authenticate with Microsoft using device code flow')
  .action(() => { /* dispatch handled in index.ts */ });

program
  .command('logout')
  .description('Log out and clear saved credentials')
  .action(() => {});

program
  .command('status')
  .description('Verify current login status')
  .action(() => {});

const accountsCmd = program
  .command('accounts')
  .description('Manage Microsoft accounts');

accountsCmd
  .command('list')
  .description('List all cached accounts')
  .action(() => {});

accountsCmd
  .command('select <accountId>')
  .description('Select a specific account by ID')
  .action(() => {});

accountsCmd
  .command('remove <accountId>')
  .description('Remove a specific account by ID')
  .action(() => {});

// ── Tool discovery ──────────────────────────────────────────────────────────
const toolsCmd = program
  .command('tools')
  .description('List and search available Graph API tools');

toolsCmd
  .command('list')
  .description('List available tools')
  .option('--filter <query>', 'Filter by name, path, or description')
  .option('--category <name>', 'Filter by category (mail, calendar, files, etc.)')
  .option('--limit <n>', 'Max results to show', '50')
  .action(() => {});

toolsCmd
  .command('describe <toolName>')
  .description('Show details and parameters for a specific tool')
  .action(() => {});

// ── Tool execution ──────────────────────────────────────────────────────────
program
  .command('run <toolName>')
  .description('Execute a Graph API tool')
  .option('--body <json>', 'Request body as JSON string or @file.json')
  .option('--fetch-all-pages', 'Automatically fetch all pages of results')
  .option('--include-headers', 'Include response headers in output')
  .option('--exclude-response', 'Only return success/failure indication')
  .option('--timezone <tz>', 'IANA timezone for calendar endpoints')
  .option('--expand-extended-properties', 'Expand singleValueExtendedProperties')
  .allowUnknownOption(true)
  .action(() => {});

export interface CommandOptions {
  v?: boolean;
  readOnly?: boolean;
  enabledTools?: string;
  preset?: string;
  listPresets?: boolean;
  orgMode?: boolean;
  workMode?: boolean;
  forceWorkScopes?: boolean;
  toon?: boolean;
  compact?: boolean;
  cloud?: string;

  [key: string]: unknown;
}

/**
 * Parsed CLI result containing the command to dispatch and its arguments.
 */
export interface ParsedCli {
  command: string;
  args: Record<string, unknown>;
  globalOpts: CommandOptions;
}

export function parseCli(): ParsedCli {
  // Track what command was invoked
  let resolved: { command: string; args: Record<string, unknown> } = {
    command: 'none',
    args: {},
  };

  // Override actions to capture dispatch info
  for (const cmd of program.commands) {
    const name = cmd.name();
    if (['login', 'logout', 'status'].includes(name)) {
      cmd.action(() => {
        resolved = { command: name, args: {} };
      });
    }
    if (name === 'accounts') {
      for (const sub of cmd.commands) {
        const subName = sub.name();
        if (subName === 'list') {
          sub.action(() => {
            resolved = { command: 'accounts-list', args: {} };
          });
        } else if (subName === 'select') {
          sub.action((accountId: string) => {
            resolved = { command: 'accounts-select', args: { accountId } };
          });
        } else if (subName === 'remove') {
          sub.action((accountId: string) => {
            resolved = { command: 'accounts-remove', args: { accountId } };
          });
        }
      }
    }
    if (name === 'tools') {
      for (const sub of cmd.commands) {
        const subName = sub.name();
        if (subName === 'list') {
          sub.action(() => {
            resolved = { command: 'tools-list', args: sub.opts() };
          });
        } else if (subName === 'describe') {
          sub.action((toolName: string) => {
            resolved = { command: 'tools-describe', args: { toolName } };
          });
        }
      }
    }
    if (name === 'run') {
      cmd.action((toolName: string) => {
        resolved = { command: 'run', args: { toolName, ...cmd.opts() } };
      });
    }
  }

  program.parse();
  const globalOpts = program.opts() as CommandOptions;

  // ── Apply environment variable overrides & presets ─────────────────────
  if (globalOpts.listPresets) {
    const presets = listPresets();
    console.log(JSON.stringify({ presets }, null, 2));
    process.exit(0);
  }

  if (globalOpts.preset) {
    const presetNames = globalOpts.preset.split(',').map((p: string) => p.trim());
    try {
      globalOpts.enabledTools = getCombinedPresetPattern(presetNames);

      const requiresOrgMode = presetNames.some((preset: string) => presetRequiresOrgMode(preset));
      if (requiresOrgMode && !globalOpts.orgMode) {
        console.warn(
          `Warning: Preset(s) [${presetNames.filter((p: string) => presetRequiresOrgMode(p)).join(', ')}] require --org-mode to function properly`
        );
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  if (process.env.READ_ONLY === 'true' || process.env.READ_ONLY === '1') {
    globalOpts.readOnly = true;
  }

  if (process.env.ENABLED_TOOLS) {
    globalOpts.enabledTools = process.env.ENABLED_TOOLS;
  }

  if (process.env.MS365_MCP_ORG_MODE === 'true' || process.env.MS365_MCP_ORG_MODE === '1') {
    globalOpts.orgMode = true;
  }

  if (
    process.env.MS365_MCP_FORCE_WORK_SCOPES === 'true' ||
    process.env.MS365_MCP_FORCE_WORK_SCOPES === '1'
  ) {
    globalOpts.forceWorkScopes = true;
  }

  if (globalOpts.workMode || globalOpts.forceWorkScopes) {
    globalOpts.orgMode = true;
  }

  if (process.env.MS365_MCP_OUTPUT_FORMAT === 'toon') {
    globalOpts.toon = true;
  }

  if (globalOpts.cloud) {
    process.env.MS365_MCP_CLOUD_TYPE = globalOpts.cloud;
  }

  // ── Collect extra --key value pairs for the run command ───────────────
  if (resolved.command === 'run') {
    const argv = process.argv.slice(2);
    const runIdx = argv.indexOf('run');
    if (runIdx !== -1) {
      const runArgs = argv.slice(runIdx + 2); // skip 'run' and toolName
      const extraParams: Record<string, unknown> = {};
      const knownRunOpts = [
        'body', 'fetch-all-pages', 'include-headers',
        'exclude-response', 'timezone', 'expand-extended-properties',
      ];
      for (let i = 0; i < runArgs.length; i++) {
        const arg = runArgs[i];
        if (arg.startsWith('--')) {
          const key = arg.slice(2);
          if (knownRunOpts.includes(key)) {
            continue;
          }
          const nextArg = runArgs[i + 1];
          if (nextArg && !nextArg.startsWith('--')) {
            extraParams[key] = nextArg;
            i++;
          } else {
            extraParams[key] = true;
          }
        }
      }
      resolved.args = { ...resolved.args, extraParams };
    }
  }

  return {
    command: resolved.command,
    args: resolved.args,
    globalOpts,
  };
}
