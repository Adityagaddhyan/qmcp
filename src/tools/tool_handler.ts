import { ERROR_CODES } from "../common/error_codes.js";
import type { JsonRpcId, JsonRpcResponse } from "../common/types.js";
import { errorResponse } from "../common/utils.js";
import { Tools } from "./tools.js";

export class ToolHandler {
    private tools: Tools;
    constructor() {
        this.tools = new Tools();
    }
    public handleToolsList(id: JsonRpcId): JsonRpcResponse {
        const tools = [...this.tools.listTools().values()].map(t => ({
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
    public async handleToolCall(id: JsonRpcId, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
        const name = String(params?.name ?? "");
        const args = (params?.arguments && typeof params.arguments === "object") ? (params.arguments as Record<string, unknown>) : {};
        if (name === "") {
            return errorResponse(id, ERROR_CODES.ERR_INVALID_PARAMS, "Missing required parameter: name");
        }
        const tool = this.tools.getTool(name);
        if (tool === undefined) {
            return errorResponse(id, ERROR_CODES.ERR_METHOD_NOT_FOUND, `Tool not found: ${name}`);
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
}
