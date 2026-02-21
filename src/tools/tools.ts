import type { ToolDef } from "../common/types.js";

export class Tools {
    private readonly tools: Map<string, ToolDef>;

    constructor() {
        this.tools = new Map();
        this.registerEchoTool();
        this.registerAddTool();
    }
    public listTools(): ReadonlyMap<string, ToolDef> {
        return this.tools;
    }
    public getTool(name: string): ToolDef | undefined {
        return this.tools.get(name);
    }
    private registerTool(tool: ToolDef) {
        this.tools.set(tool.name, tool);
    }
    private registerEchoTool() {
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
                };
            },
        });
    }
    private registerAddTool() {
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
}
