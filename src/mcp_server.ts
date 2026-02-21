import { ERROR_CODES } from "./common/error_codes.js";
import type { ResourceDef, JsonRpcNotification, JsonRpcId, JsonRpcResponse, AnyIncomingMessage } from "./common/types.js";
import { errorResponse, isRequest, writeResponse } from "./common/utils.js";
import { ResourceHandler } from "./resources/resource_handler.js";
import { ToolHandler } from "./tools/tool_handler.js";

export class McpServer {
    private initialized = false;
    private clientReady = false;
    private negotiatedVersion: string | null = null;
    private resources: Map<string, ResourceDef> = new Map();
    private resourceHandler: ResourceHandler;
    private serverInfo: { name: string, version: string };
    private toolHandler: ToolHandler;

    constructor(serverInfo: { name: string, version: string }) {
        this.serverInfo = serverInfo;
        this.resourceHandler = new ResourceHandler(this.resources);
        this.toolHandler = new ToolHandler();
        this.registerResource({
            uri: "mcp://help",
            name: "Help",
            description: "Basic usage instructions",
            mimeType: "text/plain",
            getText: async () => "Welcome to MCP demo server"
        });
    }

    private registerResource(res: ResourceDef) {
        this.resources.set(res.uri, res);
    }
    private handleNotification(msg: JsonRpcNotification) {
        if (msg.method === "notifications/initialized") {
            process.stderr.write("[mcp] client initialized\n");
            this.clientReady = true;
        }
    }

    private handleInitialize(id: JsonRpcId, params?: Record<string, unknown>): JsonRpcResponse {
        const protocolVersion = typeof params?.protocolVersion === "string" ? params.protocolVersion : null;
        if (!protocolVersion) {
            return errorResponse(id, ERROR_CODES.ERR_INVALID_PARAMS, "Missing or invalid protocolVersion parameter");
        }
        // Demo behavior: accept the client-requested protocol version.
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

    async onMessage(msg: AnyIncomingMessage) {
        // Notification: no response.
        if (!isRequest(msg)) {
            await this.handleNotification(msg);
            return;
        }
        const { method, params, id } = msg;
        try {
            if (method === "initialize") {
                return writeResponse(this.handleInitialize(id, params));
            }
            if (!this.initialized) {
                return writeResponse(errorResponse(id, ERROR_CODES.ERR_INVALID_REQUEST, "Server not initialized yet"));
            }
            if (method === "tools/list") {
                if (!this.clientReady) {
                    return writeResponse(errorResponse(id, ERROR_CODES.ERR_INVALID_REQUEST, "Client not ready (missing notifications/initialized)"));
                }
                return writeResponse(this.toolHandler.handleToolsList(id));
            }
            if (method === "resources/list") {
                return writeResponse(this.resourceHandler.handleResourceList(id));
            }
            if (method === "resources/read") {
                return writeResponse(await this.resourceHandler.handleResourcesRead(id, params));
            }
            if (method === "tools/call") {
                if (!this.clientReady) {
                    return writeResponse(errorResponse(id, ERROR_CODES.ERR_INVALID_REQUEST, "Client not ready (missing notifications/initialized)"));
                }
                return writeResponse(await this.toolHandler.handleToolCall(id, params));
            }

            return writeResponse(errorResponse(id, ERROR_CODES.ERR_METHOD_NOT_FOUND, `Method not found: ${method}`));
        } catch (e) {
            return writeResponse(errorResponse(id, ERROR_CODES.ERR_INTERNAL, "Internal server error", { details: String(e) }));
        }
    }
}
