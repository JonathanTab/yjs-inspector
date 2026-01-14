// Document Manager API Client for instrumenta.cf

export interface Document {
    owner: string;
    tool: string;
    room: string;
    title: string;
    shared_with: {
        username: string;
        permissions: string[];
    }[];
}

export interface DocumentAccess {
    room: string;
    user: string;
    permissions: string[];
}

export interface DocumentManagerConfig {
    baseUrl: string;
    apiKey?: string;
    adminMode?: boolean;
}

class DocumentManagerApi {
    private config: DocumentManagerConfig;

    constructor(config: DocumentManagerConfig) {
        this.config = config;
    }

    private buildUrl(action: string, params: Record<string, string> = {}): string {
        const url = new URL(`${this.config.baseUrl}/.data/congruum-doc-manager.php`);
        url.searchParams.set("action", action);

        // Add API key if provided
        if (this.config.apiKey) {
            url.searchParams.set("apikey", this.config.apiKey);
        }

        // Add other parameters
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });

        return url.toString();
    }

    private async request<T>(url: string): Promise<T> {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data as T;
    }

    // CREATE DOCUMENT
    async createDocument(room: string, tool?: string, title?: string): Promise<Document> {
        const params: Record<string, string> = { room };
        if (tool) params.tool = tool;
        if (title) params.title = title;

        return this.request<Document>(this.buildUrl("create", params));
    }

    // LIST DOCUMENTS
    async listDocuments(all: boolean = false): Promise<Document[]> {
        const params: Record<string, string> = {};
        if (all) params.all = "1";

        return this.request<Document[]>(this.buildUrl("list", params));
    }

    // LIST DOCUMENTS BY TOOL
    async listDocumentsByTool(tool: string, all: boolean = false): Promise<Document[]> {
        const params: Record<string, string> = { tool };
        if (all) params.all = "1";

        return this.request<Document[]>(this.buildUrl("list_by_tool", params));
    }

    // RENAME DOCUMENT
    async renameDocument(room: string, title: string): Promise<Document> {
        return this.request<Document>(this.buildUrl("rename", { room, title }));
    }

    // SHARE DOCUMENT
    async shareDocument(room: string, username: string, permissions: string[]): Promise<Document> {
        const permissionsStr = permissions.join(",");
        return this.request<Document>(this.buildUrl("share", { room, username, permissions: permissionsStr }));
    }

    // REVOKE SHARE
    async revokeShare(room: string, username: string): Promise<Document> {
        return this.request<Document>(this.buildUrl("revoke", { room, username }));
    }

    // DELETE DOCUMENT
    async deleteDocument(room: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(this.buildUrl("delete", { room }));
    }

    // CHECK ACCESS
    async checkAccess(room: string): Promise<DocumentAccess> {
        return this.request<DocumentAccess>(this.buildUrl("access", { room }));
    }

    // GENERATE ID
    async generateId(length?: number): Promise<{ id: string }> {
        const params: Record<string, string> = {};
        if (length) params.length = length.toString();

        return this.request<{ id: string }>(this.buildUrl("generate_id", params));
    }
}

export const createDocumentManagerApi = (config: DocumentManagerConfig): DocumentManagerApi => {
    return new DocumentManagerApi(config);
};
