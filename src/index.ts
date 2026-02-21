import * as process from "node:process";
import * as readline from "node:readline";
import { ERROR_CODES } from "./common/error_codes.js";
import type { AnyIncomingMessage } from "./common/types.js";
import { errorResponse, writeResponse } from "./common/utils.js";
import { McpServer } from "./mcp_server.js";

const server = new McpServer({ name: "minimal-mcp-server", version: "1.0" });
const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
});

function hasJsonRpcId(value: unknown): value is { id: string | number } {
    if (typeof value !== "object" || value === null || !("id" in value)) {
        return false;
    }
    const id = (value as { id: unknown }).id;
    return typeof id === "string" || typeof id === "number";
}

async function handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) {
        return;
    }
    let msg: AnyIncomingMessage;
    try {
        msg = JSON.parse(trimmed) as AnyIncomingMessage;
    } catch (e) {
        // No id to respond with; log to stderr.
        process.stderr.write(`[mcp] JSON parse error: ${String(e)}\n`);
        return;
    }
    // Basic validation
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        if (hasJsonRpcId(msg)) {
            writeResponse(errorResponse(msg.id, ERROR_CODES.ERR_INVALID_REQUEST, "Invalid JSON-RPC request"));
        }
        return;
    }
    await server.onMessage(msg);
}

let processingQueue = Promise.resolve();
rl.on("line", (line) => {
    processingQueue = processingQueue
        .then(() => handleLine(line))
        .catch((e) => {
            process.stderr.write(`[mcp] line handling error: ${String(e)}\n`);
        });
});

process.stderr.write("[mcp] server running (stdio)\n");
