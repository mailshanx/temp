#!/usr/bin/env node

import 'dotenv/config';
import { parseCli } from './cli.js';
import logger, { enableConsoleLogging } from './logger.js';
import AuthManager, { buildScopesFromEndpoints } from './auth.js';
import GraphClient from './graph-client.js';
import { ToolRegistry } from './tool-registry.js';
import { executeTool } from './tool-executor.js';
import { printResult, type OutputFormat } from './output.js';
import { getSecrets } from './secrets.js';
import { readFileSync, existsSync } from 'fs';

async function main(): Promise<void> {
  try {
    const { command, args, globalOpts } = parseCli();

    if (globalOpts.v) {
      enableConsoleLogging();
    }

    const includeWorkScopes = globalOpts.orgMode || false;
    if (includeWorkScopes) {
      logger.info('Organization mode enabled - including work account scopes');
    }

    const scopes = buildScopesFromEndpoints(includeWorkScopes, globalOpts.enabledTools);
    const authManager = await AuthManager.create(scopes);
    await authManager.loadTokenCache();

    // Determine output format
    let outputFormat: OutputFormat = 'json';
    if (globalOpts.toon) outputFormat = 'toon';
    if (globalOpts.compact) outputFormat = 'compact';

    // ── Auth commands ─────────────────────────────────────────────────────
    if (command === 'login') {
      await authManager.acquireTokenByDeviceCode();
      logger.info('Login completed, testing connection with Graph API...');
      const result = await authManager.testLogin();
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    if (command === 'logout') {
      await authManager.logout();
      console.log(JSON.stringify({ message: 'Logged out successfully' }));
      process.exit(0);
    }

    if (command === 'status') {
      const result = await authManager.testLogin();
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    if (command === 'accounts-list') {
      const accounts = await authManager.listAccounts();
      const selectedAccountId = authManager.getSelectedAccountId();
      const result = accounts.map((account) => ({
        id: account.homeAccountId,
        username: account.username,
        name: account.name,
        selected: account.homeAccountId === selectedAccountId,
      }));
      console.log(JSON.stringify({ accounts: result }, null, 2));
      process.exit(0);
    }

    if (command === 'accounts-select') {
      const accountId = args.accountId as string;
      const success = await authManager.selectAccount(accountId);
      if (success) {
        console.log(JSON.stringify({ message: `Selected account: ${accountId}` }));
      } else {
        console.error(JSON.stringify({ error: `Account not found: ${accountId}` }));
        process.exit(1);
      }
      process.exit(0);
    }

    if (command === 'accounts-remove') {
      const accountId = args.accountId as string;
      const success = await authManager.removeAccount(accountId);
      if (success) {
        console.log(JSON.stringify({ message: `Removed account: ${accountId}` }));
      } else {
        console.error(JSON.stringify({ error: `Account not found: ${accountId}` }));
        process.exit(1);
      }
      process.exit(0);
    }

    // ── Tool discovery ────────────────────────────────────────────────────
    const registry = new ToolRegistry({
      readOnly: globalOpts.readOnly,
      orgMode: globalOpts.orgMode,
      enabledToolsPattern: globalOpts.enabledTools,
    });

    if (command === 'tools-list') {
      const filter = args.filter as string | undefined;
      const category = args.category as string | undefined;
      const limit = parseInt(args.limit as string || '50', 10);
      const results = registry.search(filter, category, limit);
      const output = results.map((t) => ({
        name: t.name,
        method: t.method,
        path: t.path,
        description: t.description.split('\n')[0],
      }));
      console.log(JSON.stringify({ total: registry.size, shown: output.length, tools: output }, null, 2));
      process.exit(0);
    }

    if (command === 'tools-describe') {
      const toolName = args.toolName as string;
      const entry = registry.get(toolName);
      if (!entry) {
        console.error(JSON.stringify({ error: `Tool not found: ${toolName}` }));
        process.exit(1);
      }

      const params = (entry.endpoint.parameters || []).map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description || '',
        required: p.type === 'Path',
      }));

      console.log(JSON.stringify({
        name: entry.name,
        method: entry.method,
        path: entry.path,
        description: entry.description,
        parameters: params,
      }, null, 2));
      process.exit(0);
    }

    // ── Tool execution ────────────────────────────────────────────────────
    if (command === 'run') {
      const toolName = args.toolName as string;
      const entry = registry.get(toolName);
      if (!entry) {
        console.error(JSON.stringify({ error: `Tool not found: ${toolName}` }));
        console.error(`Use 'ms365 tools list' to see available tools.`);
        process.exit(1);
      }

      // Build parameters from CLI args
      const params: Record<string, unknown> = {};

      // Control parameters
      if (args.fetchAllPages) params.fetchAllPages = true;
      if (args.includeHeaders) params.includeHeaders = true;
      if (args.excludeResponse) params.excludeResponse = true;
      if (args.timezone) params.timezone = args.timezone;
      if (args.expandExtendedProperties) params.expandExtendedProperties = true;

      // Body parameter: inline JSON, @file, or raw string
      if (args.body) {
        const bodyStr = args.body as string;
        if (bodyStr.startsWith('@')) {
          const filePath = bodyStr.slice(1);
          if (!existsSync(filePath)) {
            console.error(JSON.stringify({ error: `File not found: ${filePath}` }));
            process.exit(1);
          }
          const fileContent = readFileSync(filePath, 'utf8');
          try {
            const parsed = JSON.parse(fileContent);
            if (typeof parsed === 'object' && parsed !== null) {
              Object.assign(params, parsed);
            } else {
              params.body = parsed;
            }
          } catch {
            params.body = fileContent;
          }
        } else {
          try {
            const parsed = JSON.parse(bodyStr);
            if (typeof parsed === 'object' && parsed !== null) {
              Object.assign(params, parsed);
            } else {
              params.body = parsed;
            }
          } catch {
            params.body = bodyStr;
          }
        }
      }

      // Extra --key value pairs (path, query, header params)
      const extraParams = args.extraParams as Record<string, unknown> | undefined;
      if (extraParams) {
        for (const [key, value] of Object.entries(extraParams)) {
          params[key] = value;
        }
      }

      // Create graph client and execute
      const secrets = await getSecrets();
      const graphOutputFormat = globalOpts.toon ? 'toon' : 'json';
      const graphClient = new GraphClient(authManager, secrets, graphOutputFormat);

      const result = await executeTool(entry, graphClient, params);
      printResult(result, outputFormat);
      process.exit(result.isError ? 1 : 0);
    }

    // ── No command specified ──────────────────────────────────────────────
    if (command === 'none') {
      console.log(`Microsoft 365 CLI

Usage:
  ms365 login                       Authenticate with Microsoft
  ms365 logout                      Clear saved credentials
  ms365 status                      Check login status

  ms365 accounts list               List cached accounts
  ms365 accounts select <id>        Select an account
  ms365 accounts remove <id>        Remove an account

  ms365 tools list [--filter ...]   List available tools
  ms365 tools describe <name>       Show tool parameters

  ms365 run <tool> [options]        Execute a Graph API tool

Examples:
  ms365 run list-mail-messages --top 5 --select "subject,from"
  ms365 run send-mail --body '{"message":{"subject":"Hi","body":{"content":"Hello"},"toRecipients":[{"emailAddress":{"address":"user@example.com"}}]}}'
  ms365 run get-mail-message --message-id "AAMkAD..."

Options:
  --read-only                       Only allow GET operations
  --org-mode                        Enable organization/work mode
  --preset <names>                  Use preset tool categories
  --toon                            TOON output format
  --compact                         Minified JSON output
  -v                                Verbose logging
  --help                            Show help
  --version                         Show version
`);
      process.exit(0);
    }
  } catch (error) {
    logger.error(`Error: ${error}`);
    console.error(JSON.stringify({ error: (error as Error).message }));
    process.exit(1);
  }
}

main();
