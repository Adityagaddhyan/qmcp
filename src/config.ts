import { z } from "zod";

const ConnectionConfigSchema = z.object({
    host: z.string().trim().min(1, "host is required"),
    username: z.string().trim().min(1, "username is required"),
    password: z.string().trim().min(1, "password is required"),
    vhost: z.string().trim().min(1, "vhost cannot be empty").optional(),
    timeoutMs: z.number().positive("timeoutMs must be a positive number").optional(),
}).strict();

const ScopeSchema = z.enum(["read", "write"]);

export const ConfigSchema = z.object({
    scope: ScopeSchema,
    activeConnectionId: z.string().trim().min(1, "activeConnectionId is required"),
    connections: z.record(z.string().min(1), ConnectionConfigSchema)
        .refine((connections) => Object.keys(connections).length > 0, "connections must contain at least one connection"),
}).strict().superRefine((config, ctx) => {
    if (!config.connections[config.activeConnectionId]) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `activeConnectionId "${config.activeConnectionId}" does not exist in connections`,
            path: ["activeConnectionId"],
        });
    }
});

export type Scope = z.infer<typeof ScopeSchema>;
export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export class ConfigValidationError extends Error {
    public readonly issues: string[];

    constructor(issues: string[]) {
        super(`Invalid config:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
        this.name = "ConfigValidationError";
        this.issues = issues;
    }
}

export function parseConfig(raw: unknown): Config {
    const result = ConfigSchema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues.map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "config";
            return `${path}: ${issue.message}`;
        });
        throw new ConfigValidationError(issues);
    }
    return result.data;
}
