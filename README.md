# checkly-mcp

MCP server for [Checkly](https://checklyhq.com) — manage and run monitoring checks directly from Claude Code or any MCP-compatible client.

## Tools

| Tool | Description |
|------|-------------|
| `list_checks` | List all checks, optionally filtered by type or group ID |
| `get_check` | Get full check details including script and configuration |
| `update_check` | Update script, name, activation state, or frequency (dry-run by default) |
| `run_check` | Trigger an on-demand run; optionally wait for result |
| `get_check_results` | Get the most recent pass/fail results for a check |

## Setup

```bash
npm install
npm run build
cp .mcp.json.example .mcp.json
```

Edit `.mcp.json` and fill in your credentials:

```json
{
  "mcpServers": {
    "checkly": {
      "command": "node",
      "args": ["/absolute/path/to/checkly-mcp/dist/index.js"],
      "env": {
        "CHECKLY_API_KEY": "cu_...",
        "CHECKLY_ACCOUNT_ID": "your-account-uuid",
        "CHECKLY_READ_ONLY": "true"
      }
    }
  }
}
```

Get your API key at **app.checklyhq.com → Settings → API Keys**.
Your account ID is the UUID in the Checkly dashboard URL.

## Usage

### Find a check
```
list_checks(type: "BROWSER")
get_check(id: "6149c6fa-...")
```

### Fix and verify a check script
```
# Preview the change
update_check(id: "6149c6fa-...", script: "...fixed...", confirm: false)

# Apply it
update_check(id: "6149c6fa-...", script: "...fixed...", confirm: true)

# Run and wait for result
run_check(id: "6149c6fa-...", await_result: true)
```

## Notes

- `CHECKLY_READ_ONLY=true` (default) — blocks `update_check` and `run_check`. Set to `false` to enable writes.
- `run_check` requires the check to be **activated** and in an **active check group**. Checks in deactivated groups return an error.
- `update_check` always fetches the current check before writing to avoid overwriting unrelated fields.
- Trigger endpoint: `POST /v1/check-sessions/trigger` with `target.checkId`.
