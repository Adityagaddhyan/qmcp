import type { ResourceDef } from "../common/types.js";

export class Resources {
    private readonly resources: Map<string, ResourceDef>;

    constructor() {
        this.resources = new Map();
        this.registerHelpResource();
    }

    public listResources(): ReadonlyMap<string, ResourceDef> {
        return this.resources;
    }

    public getResource(uri: string): ResourceDef | undefined {
        return this.resources.get(uri);
    }

    private registerResource(resource: ResourceDef): void {
        this.resources.set(resource.uri, resource);
    }

    private registerHelpResource(): void {
        this.registerResource({
            uri: "mcp://help",
            name: "Help",
            description: "Basic usage instructions",
            mimeType: "text/plain",
            getText: async () => "Welcome to MCP demo server",
        });
    }
}
