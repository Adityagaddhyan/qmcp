import { ERROR_CODES } from "./common/error_codes.js";
import type { AnyIncomingMessage, JsonRpcId, JsonRpcNotification, JsonRpcResponse } from "./common/types.js";
import { errorResponse, isRequest, writeResponse } from "./common/utils.js";
import { ResourceHandler } from "./resources/resource_handler.js";
import { ToolHandler } from "./tools/tool_handler.js";

export class McpServer {
    private initialized = false;
    private clientReady = false;
    private negotiatedVersion: string | null = null;
    private readonly resourceHandler: ResourceHandler;
    private readonly serverInfo: { name: string; version: string };
    private readonly toolHandler: ToolHandler;
    private readonly configError: string | null;

    constructor(serverInfo: { name: string; version: string }, configError: string | null = null) {
        this.serverInfo = serverInfo;
        this.resourceHandler = new ResourceHandler();
        this.toolHandler = new ToolHandler();
        this.configError = configError;
    }

    private handleNotification(msg: JsonRpcNotification): void {
        if (msg.method === "notifications/initialized") {
            process.stderr.write("[mcp] client initialized\n");
            this.clientReady = true;
        }
    }

    private handleInitialize(id: JsonRpcId, params?: Record<string, unknown>): JsonRpcResponse {
        if (this.configError) {
            return errorResponse(
                id,
                ERROR_CODES.ERR_INVALID_PARAMS,
                `Invalid QMCP config: ${this.configError}`
            );
        }

        const protocolVersion = typeof params?.protocolVersion === "string" ? params.protocolVersion : null;
        if (!protocolVersion) {
            return errorResponse(id, ERROR_CODES.ERR_INVALID_PARAMS, "Missing or invalid protocolVersion parameter");
        }

        this.negotiatedVersion = protocolVersion;
        this.initialized = true;
        return {
            jsonrpc: "2.0",
            id,
            result: {
                protocolVersion: this.negotiatedVersion,
                capabilities: {
                    tools: { listChanged: false },
                    resources: { listChanged: false },
                },
                serverInfo: this.serverInfo,
            },
        };
    }

    async onMessage(msg: AnyIncomingMessage): Promise<void> {
        if (!isRequest(msg)) {
            this.handleNotification(msg);
            return;
        }

        const { method, params, id } = msg;
        try {
            if (method === "initialize") {
                writeResponse(this.handleInitialize(id, params));
                return;
            }
            if (this.configError) {
                writeResponse(errorResponse(id, ERROR_CODES.ERR_INVALID_REQUEST, "Server misconfigured; fix config and restart"));
                return;
            }
            if (!this.initialized) {
                writeResponse(errorResponse(id, ERROR_CODES.ERR_INVALID_REQUEST, "Server not initialized yet"));
                return;
            }
            if (method === "tools/list") {
                if (!this.clientReady) {
                    writeResponse(errorResponse(id, ERROR_CODES.ERR_INVALID_REQUEST, "Client not ready (missing notifications/initialized)"));
                    return;
                }
                writeResponse(this.toolHandler.handleToolsList(id));
                return;
            }
            if (method === "resources/list") {
                writeResponse(this.resourceHandler.handleResourceList(id));
                return;
            }
            if (method === "resources/read") {
                writeResponse(await this.resourceHandler.handleResourcesRead(id, params));
                return;
            }
            if (method === "tools/call") {
                if (!this.clientReady) {
                    writeResponse(errorResponse(id, ERROR_CODES.ERR_INVALID_REQUEST, "Client not ready (missing notifications/initialized)"));
                    return;
                }
                writeResponse(await this.toolHandler.handleToolCall(id, params));
                return;
            }

            writeResponse(errorResponse(id, ERROR_CODES.ERR_METHOD_NOT_FOUND, `Method not found: ${method}`));
        } catch (e) {
            writeResponse(errorResponse(id, ERROR_CODES.ERR_INTERNAL, "Internal server error", { details: String(e) }));
        }
    }
}
