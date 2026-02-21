export type JsonRpcId = number | string;
export type JsonRpcRequest = {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
    id: JsonRpcId;
};
export type JsonRpcNotification = {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
};
export type JsonRpcResponse =
    | { jsonrpc: "2.0"; result: Record<string, unknown>; id: JsonRpcId }
    | { jsonrpc: "2.0"; error: { code: number; message: string; data?: unknown } };

export type AnyIncomingMessage = JsonRpcRequest | JsonRpcNotification;
export type ToolDef = {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }>; isError: boolean }>;
};

export type ResourceDef = {
    uri: string;
    name: string;
    description?: string;
    mimeType: string;
    getText: () => Promise<string>;
};