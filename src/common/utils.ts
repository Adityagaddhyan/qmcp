import type { AnyIncomingMessage, JsonRpcRequest, JsonRpcResponse, JsonRpcId } from "./types.js";

export function isRequest(msg: AnyIncomingMessage): msg is JsonRpcRequest {
    return (msg as JsonRpcRequest).id !== undefined;
}
export function writeResponse(resp: JsonRpcResponse) {
    // Important: output exactly one JSON-RPC object per line.
    process.stdout.write(JSON.stringify(resp) + "\n");
}
export function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
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
