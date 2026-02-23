import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getConfig } from "./client.js";
import {
  listChecks,
  getCheck,
  updateCheck,
  runCheck,
  getCheckResults,
} from "./tools/checks.js";

const config = getConfig();

const server = new Server(
  { name: "checkly-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_checks",
      description:
        "List Checkly checks. Optionally filter by group ID. The API does not support server-side type filtering — use the 'type' param to filter client-side.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "API",
              "BROWSER",
              "MULTI_STEP",
              "TCP",
              "HEARTBEAT",
              "URL",
              "DNS",
            ],
            description: "Filter by check type (client-side filter)",
          },
          group_id: {
            type: "string",
            description: "Filter to checks belonging to this group ID",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 100)",
          },
        },
      },
    },
    {
      name: "get_check",
      description:
        "Get full details of a check including its script, configuration, locations, and thresholds.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Check UUID" },
        },
      },
    },
    {
      name: "update_check",
      description:
        "Update a check's script, name, activation state, or frequency. " +
        "Defaults to dry-run (shows diff without applying). Pass confirm: true to apply. " +
        "Requires CHECKLY_READ_ONLY=false.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Check UUID" },
          script: {
            type: "string",
            description: "New Playwright/JS script for browser or multi-step checks",
          },
          name: { type: "string", description: "New display name" },
          activated: {
            type: "boolean",
            description: "true to enable, false to disable",
          },
          frequency: {
            type: "number",
            description: "Run frequency in minutes (1, 2, 5, 10, 15, 30, 60, 720, 1440)",
          },
          confirm: {
            type: "boolean",
            description: "Set true to apply changes. Omit or false for dry-run preview.",
            default: false,
          },
        },
      },
    },
    {
      name: "run_check",
      description:
        "Trigger an immediate on-demand run of a check via POST /v1/check-sessions/trigger. " +
        "Returns session ID and a direct link to results in the Checkly UI. " +
        "Set await_result: true to poll for completion (up to 120s). " +
        "Requires the check to be activated and in an active check group. " +
        "Requires CHECKLY_READ_ONLY=false.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Check UUID" },
          await_result: {
            type: "boolean",
            description:
              "Poll until the check completes and return full results (default false). " +
              "Browser checks may take 30-60s; API checks typically 5-15s.",
            default: false,
          },
        },
      },
    },
    {
      name: "get_check_results",
      description:
        "Get the most recent results for a check: pass/fail status, response times, locations, and error details.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Check UUID" },
          limit: {
            type: "number",
            description: "Number of results to return (default 5, max 100)",
            default: 5,
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case "list_checks":
        result = await listChecks(config, {
          type: args?.type as string | undefined,
          groupId: args?.group_id as string | undefined,
          limit: args?.limit as number | undefined,
        });
        break;

      case "get_check":
        result = await getCheck(config, args!.id as string);
        break;

      case "update_check":
        result = await updateCheck(
          config,
          args!.id as string,
          {
            script: args?.script as string | undefined,
            name: args?.name as string | undefined,
            activated: args?.activated as boolean | undefined,
            frequency: args?.frequency as number | undefined,
          },
          Boolean(args?.confirm)
        );
        break;

      case "run_check":
        result = await runCheck(
          config,
          args!.id as string,
          Boolean(args?.await_result)
        );
        break;

      case "get_check_results":
        result = await getCheckResults(
          config,
          args!.id as string,
          (args?.limit as number) ?? 5
        );
        break;

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
