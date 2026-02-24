# ms365-cli

A CLI for interacting with Microsoft 365 services through the Microsoft Graph API.

## Prerequisites

- Node.js >= 18

## Install

```bash
npm install
npm run build
```

## Authentication

Log in before using any tools:

```bash
ms365 login
```

This starts a device code flow — follow the URL and enter the code in your browser. Tokens are cached in your OS credential store (or a local file as fallback).

```bash
ms365 status          # Check if you're logged in
ms365 logout          # Clear credentials
```

### Multiple Accounts

```bash
ms365 accounts list
ms365 accounts select <id>
ms365 accounts remove <id>
```

### Bring Your Own Token

```bash
MS365_MCP_OAUTH_TOKEN=<token> ms365 run list-mail-messages
```

## Usage

### Discover tools

```bash
ms365 tools list                          # List all tools
ms365 tools list --filter mail            # Filter by name/description
ms365 tools list --category calendar      # Filter by category
ms365 tools describe send-mail            # Show parameters for a tool
```

### Run a tool

```bash
ms365 run <tool-name> [--key value ...] [--body <json>]
```

Path and query parameters are passed as `--key value` flags. Body parameters use `--body` with inline JSON or a file reference.

### Examples

```bash
# List recent emails
ms365 run list-mail-messages --top 5 --select "subject,from,receivedDateTime"

# Read a specific message
ms365 run get-mail-message --message-id "AAMkAD..."

# Send an email
ms365 run send-mail --body '{"message":{"subject":"Hello","body":{"contentType":"Text","content":"Hi there"},"toRecipients":[{"emailAddress":{"address":"user@example.com"}}]}}'

# Send from a file
ms365 run send-mail --body @email.json

# List calendar events
ms365 run list-calendar-events --top 10

# Get calendar view with timezone
ms365 run get-calendar-view \
  --startDateTime "2024-01-01T00:00:00Z" \
  --endDateTime "2024-01-31T23:59:59Z" \
  --timezone "America/New_York"

# List OneDrive files
ms365 run list-folder-files

# Search emails (KQL syntax)
ms365 run list-mail-messages --search '"from:john@example.com subject:meeting"'

# Paginate through all results
ms365 run list-mail-messages --fetch-all-pages
```

## Global Options

```
-v                    Enable verbose logging
--read-only           Only allow GET operations
--org-mode            Enable organization/work mode (Teams, SharePoint, etc.)
--preset <names>      Use preset tool categories (comma-separated)
--toon                TOON output format (experimental, fewer tokens)
--compact             Minified JSON output (for piping)
--cloud <type>        Cloud environment: global (default) or china
--version             Show version
```

### Tool Presets

```bash
ms365 --preset mail run list-mail-messages
ms365 --preset calendar,contacts run list-calendar-events
ms365 --list-presets                       # Show all presets
```

Available: `mail`, `calendar`, `files`, `personal`, `work`, `excel`, `contacts`, `tasks`, `onenote`, `search`, `users`, `all`

## Environment Variables

| Variable | Description |
|---|---|
| `MS365_MCP_CLIENT_ID` | Custom Azure app client ID |
| `MS365_MCP_TENANT_ID` | Tenant ID (default: `common`) |
| `MS365_MCP_CLIENT_SECRET` | Client secret (optional) |
| `MS365_MCP_OAUTH_TOKEN` | Pre-existing OAuth token (BYOT) |
| `MS365_MCP_CLOUD_TYPE` | `global` or `china` |
| `MS365_MCP_ORG_MODE` | `true` to enable org mode |
| `MS365_MCP_KEYVAULT_URL` | Azure Key Vault URL for secrets |
| `MS365_MCP_TOKEN_CACHE_PATH` | Custom token cache file path |
| `MS365_MCP_SELECTED_ACCOUNT_PATH` | Custom selected-account file path |
| `READ_ONLY` | `true` to disable write operations |
| `ENABLED_TOOLS` | Regex pattern to filter tools |

## Supported Clouds

| Cloud | Auth Endpoint | Graph API Endpoint |
|---|---|---|
| **Global** (default) | login.microsoftonline.com | graph.microsoft.com |
| **China** (21Vianet) | login.chinacloudapi.cn | microsoftgraph.chinacloudapi.cn |

## License

MIT
