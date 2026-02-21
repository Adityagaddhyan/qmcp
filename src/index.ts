import * as readline from "node:readline";
import * as process from "node:process";

type JsonRpcId = number | string;
type JsonRpcRequest = {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
    id: JsonRpcId;
};
type JsonRpcNotification = {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
};
type JsonRpcResponse =
    | { jsonrpc: "2.0"; result: Record<string, unknown>; id: JsonRpcId }
    | { jsonrpc: "2.0"; error: { code: number; message: string; data?: unknown } };

type AnyIncomingMessage = JsonRpcRequest | JsonRpcNotification;
type ToolDef = {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }>; isError: boolean }>;
};

type ResourceDef = {
    uri: string;
    name: string;
    description?: string;
    mimeType: string;
    getText: () => Promise<string>;
};

function isRequest(msg: AnyIncomingMessage): msg is JsonRpcRequest {
    return (msg as JsonRpcRequest).id !== undefined;
}
function writeResponse(resp: JsonRpcResponse) {
    //IMPORTTANT: as one line per message, no emmbedded newlines, otherwise the client will not be able to parse it correctly
    process.stdout.write(JSON.stringify(resp) + "\n");
}
function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
    return {
        jsonrpc: "2.0",
        id,
        error: {
            code,
            message,
            data,
        },
    };
}
// JSON-RPC standard-ish error codes (common practice)
const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

class McpServer {
    private initialized = false;
    private clientReady = false;
    private negotiatedVersion: string | null = null;
    private tools: Map<string, ToolDef> = new Map();
    private resources: Map<string, ResourceDef> = new Map();
    constructor(private serverInfo: { name: string, version: string }) {
        this.registerBuiltInTools();
        this.registerResource({
            uri: "mcp://help",
            name: "Help",
            description: "Basic usage instructions",
            mimeType: "text/plain",
            getText: async () => "Welcome to MCP demo server"
        });
    }
    private registerTool(tool: ToolDef) {
        this.tools.set(tool.name, tool);
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

    private registerBuiltInTools() {
        this.registerTool({
            name: "echo",
            description: "Echo back provided message",
            inputSchema: {
                type: "object",
                properties: {
                    message: { type: "string", description: "Message to echo back" },
                },
                required: ["message"],
            },
            handler: async (args) => {
                const msg = String(args.message ?? "");
                return {
                    content: [{ type: "text", text: msg }],
                    isError: false,
                }
            }
        });
        this.registerTool({
            name: "add",
            description: "Add two numbers",
            inputSchema: {
                type: "object",
                properties: {
                    a: { type: "number", description: "First number" },
                    b: { type: "number", description: "Second number" },
                },
                required: ["a", "b"],
            },
            handler: async (args) => {
                const a = Number(args.a);
                const b = Number(args.b);
                if (!Number.isFinite(a) || !Number.isFinite(b)) {
                    return {
                        content: [{ type: "text", text: "Invalid input, both a and b must be numbers" }],
                        isError: true,
                    }
                }
                return {
                    content: [{ type: "text", text: `Result: ${a + b}` }],
                    isError: false,
                };
            },
        });

    }
    private handleToolsList(id: JsonRpcId, params?: Record<string, unknown>): JsonRpcResponse {
        const tools = [...this.tools.values()].map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        }));
        return {
            jsonrpc: "2.0",
            id,
            result: {
                tools,
            },
        };
    }
    private async handleToolCall(id: JsonRpcId, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
        const name = String(params?.name ?? "");
        const args = (params?.arguments && typeof params.arguments === "object") ? (params.arguments as Record<string, unknown>) : {};
        if (name === "") {
            return errorResponse(id, ERR_INVALID_PARAMS, "Missing required parameter: name");
        }
        const tool = this.tools.get(name);
        if (tool === undefined) {
            return errorResponse(id, ERR_METHOD_NOT_FOUND, `Tool not found: ${name}`);
        }
        const result = await tool.handler(args);
        return {
            jsonrpc: "2.0",
            id,
            result: {
                content: result.content,
                isError: result.isError,
            },
        };
    }
    private handleInitialize(id: JsonRpcId, params?: Record<string, unknown>): JsonRpcResponse {
        const protocolVersion = typeof params?.protocolVersion === "string" ? params.protocolVersion : null;
        if (!protocolVersion) {
            return errorResponse(id, ERR_INVALID_PARAMS, "Missing or invalid protocolVersion parameter");
        }
        // For demo, we accept whatever version the client requests and echo it back.
        // A real server should choose from its supported versions and negotiate. :contentReference[oaicite:5]{index=5}
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

    private async handleResourcesRead(
        id: JsonRpcId,
        params?: Record<string, unknown>
    ): Promise<JsonRpcResponse> {

        const uri = typeof params?.uri === "string" ? params.uri : null;
        if (!uri) return errorResponse(id, -32602, "Missing params.uri");

        const res = this.resources.get(uri);
        if (!res) return errorResponse(id, -32602, `Unknown resource: ${uri}`);

        const text = await res.getText();

        return {
            jsonrpc: "2.0",
            id,
            result: {
                contents: [
                    {
                        uri,
                        mimeType: res.mimeType,
                        text
                    }
                ]
            }
        };
    }

    private handleResourceList(id: JsonRpcId): JsonRpcResponse {
        const resources = [...this.resources.values()].map(r => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
        }));
        return {
            jsonrpc: "2.0",
            id,
            result: {
                resources,
            },
        };
    }

    async onMessage(msg: AnyIncomingMessage) {
        //Notification: No resposne
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
                return writeResponse(errorResponse(id, ERR_INVALID_REQUEST, "Server not initialized yet"));
            }
            if (method === "tools/list") {
                if (!this.clientReady) {
                    return writeResponse(errorResponse(id, ERR_INVALID_REQUEST, "Client not ready (missing notifications/initialized)"));
                }
                return writeResponse(this.handleToolsList(id, params));
            }
            if (method === "resources/list") {
                return writeResponse(this.handleResourceList(id));
            }
            if (method === "resources/read") {
                return writeResponse(await this.handleResourcesRead(id, params));
            }
            if (method === "tools/call") {
                if (!this.clientReady) {
                    return writeResponse(errorResponse(id, ERR_INVALID_REQUEST, "Client not ready (missing notifications/initialized)"));
                }
                return writeResponse(await this.handleToolCall(id, params));
            }


        } catch (e) {
            return writeResponse(errorResponse(id, ERR_INTERNAL, "Internal server error", { details: String(e) }));
        }
    }
}

const server = new McpServer({ name: "minimal-mcp-server", version: "1.0" });
const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
});
rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
        return;
    }
    let msg: AnyIncomingMessage;
    try {
        msg = JSON.parse(trimmed);
    } catch (e) {
        // No id to respond with; log to stderr.
        process.stderr.write(`[mcp] JSON parse error: ${String(e)}\n`);
        return;
    }
    // Basic validation
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
        if ((msg as any)?.id !== undefined) {
            writeResponse(errorResponse((msg as any).id, ERR_INVALID_REQUEST, "Invalid JSON-RPC request"));
        }
        return;
    }
    await server.onMessage(msg);
});

process.stderr.write("[mcp] server running (stdio)\n");