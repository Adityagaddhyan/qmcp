import type { JsonRpcId, JsonRpcResponse, ResourceDef } from "../common/types.js";
import { errorResponse } from "../common/utils.js";
import { ERROR_CODES } from "../common/error_codes.js";
import { Resources } from "./resources.js";

export class ResourceHandler {
    private readonly resources: Resources;

    constructor() {
        this.resources = new Resources();
    }

    public async handleResourcesRead(
        id: JsonRpcId,
        params?: Record<string, unknown>
    ): Promise<JsonRpcResponse> {
        const uri = typeof params?.uri === "string" ? params.uri : null;
        if (!uri) {
            return errorResponse(id, ERROR_CODES.ERR_INVALID_PARAMS, "Missing params.uri");
        }

        const resource = this.resources.getResource(uri);
        if (!resource) {
            return errorResponse(id, ERROR_CODES.ERR_INVALID_PARAMS, `Unknown resource: ${uri}`);
        }

        const text = await resource.getText();

        return {
            jsonrpc: "2.0",
            id,
            result: {
                contents: [
                    {
                        uri,
                        mimeType: resource.mimeType,
                        text,
                    },
                ],
            },
        };
    }

    public handleResourceList(id: JsonRpcId): JsonRpcResponse {
        const resources = [...this.resources.listResources().values()].map((resource: ResourceDef) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
        }));

        return {
            jsonrpc: "2.0",
            id,
            result: {
                resources,
            },
        };
    }
}
