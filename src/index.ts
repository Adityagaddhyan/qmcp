import fs from "node:fs";
import process from "node:process";
import * as readline from "node:readline";
import { ERROR_CODES } from "./common/error_codes.js";
import type { AnyIncomingMessage } from "./common/types.js";
import { errorResponse, writeResponse } from "./common/utils.js";
import { ConfigValidationError, parseConfig } from "./config.js";
import { McpServer } from "./mcp_server.js";

function hasJsonRpcId(value: unknown): value is { id: string | number } {
    if (typeof value !== "object" || value === null || !("id" in value)) {
        return false;
    }
    const id = (value as { id: unknown }).id;
    return typeof id === "string" || typeof id === "number";
}

async function handleLine(line: string, server: McpServer): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) {
        return;
    }

    let msg: AnyIncomingMessage;
    try {
        msg = JSON.parse(trimmed) as AnyIncomingMessage;
    } catch (e) {
        process.stderr.write(`[mcp] JSON parse error: ${String(e)}\n`);
        return;
    }

    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        if (hasJsonRpcId(msg)) {
            writeResponse(errorResponse(msg.id, ERROR_CODES.ERR_INVALID_REQUEST, "Invalid JSON-RPC request"));
        }
        return;
    }

    await server.onMessage(msg);
}

function getConfigFromArgs() {
    const argv = process.argv;
    const configIdx = argv.indexOf("--config");
    const configPath = configIdx !== -1 ? argv[configIdx + 1] : undefined;

    if (!configPath) {
        throw new Error("Missing --config <path>");
    }

    const rawText = fs.readFileSync(configPath, "utf-8");
    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(rawText) as unknown;
    } catch (e) {
        throw new Error(`Invalid JSON in config file ${configPath}: ${String(e)}`);
    }

    return parseConfig(parsedJson);
}

function main(): void {
    let configError: string | null = null;
    let configSummary = "";
    try {
        const config = getConfigFromArgs();
        configSummary = `scope="${config.scope}" and activeConnectionId="${config.activeConnectionId}"`;
        process.stderr.write(`[mcp] loaded config with ${configSummary}\n`);
    } catch (e) {
        const err = e as Error;
        const isConfigValidationError = err instanceof ConfigValidationError;
        configError = `${isConfigValidationError ? "Config validation failed" : "Config load failed"}: ${err.message}`;
        process.stderr.write(`[mcp] ${configError}\n`);
    }

    const server = new McpServer({ name: "minimal-mcp-server", version: "1.0" }, configError);
    const rl = readline.createInterface({
        input: process.stdin,
        crlfDelay: Infinity,
    });

    let processingQueue = Promise.resolve();
    rl.on("line", (line) => {
        processingQueue = processingQueue
            .then(() => handleLine(line, server))
            .catch((lineError) => {
                process.stderr.write(`[mcp] line handling error: ${String(lineError)}\n`);
            });
    });

    process.stderr.write("[mcp] server running (stdio)\n");
}

main();
