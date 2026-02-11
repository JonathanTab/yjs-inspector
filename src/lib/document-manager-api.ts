// Document Manager API Client for instrumenta.cf

export interface Document {
    id: string;
    owner: string;
    app: string;
    title: string;
    versions: Record<string, string>; // version -> room mapping
    shared_with: {
        username: string;
        permissions: string[];
    }[];
}

export interface DocumentAccess {
    id: string;
    room: string;
    user: string;
    permissions: string[];
}

export interface DocumentRoomResult {
    id: string;
    version: string;
    room: string;
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
        const url = new URL(`${this.config.baseUrl}/api/congruum-doc-manager.php`);
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
    async createDocument(id: string, tool?: string, title?: string, version?: string): Promise<Document> {
        const params: Record<string, string> = { id };
        if (tool) params.tool = tool;
        if (title) params.title = title;
        if (version) params.version = version;

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
    async renameDocument(id: string, title: string): Promise<Document> {
        return this.request<Document>(this.buildUrl("rename", { id, title }));
    }

    // SHARE DOCUMENT
    async shareDocument(id: string, username: string, permissions: string[]): Promise<Document> {
        const permissionsStr = permissions.join(",");
        return this.request<Document>(this.buildUrl("share", { id, username, permissions: permissionsStr }));
    }

    // REVOKE SHARE
    async revokeShare(id: string, username: string): Promise<Document> {
        return this.request<Document>(this.buildUrl("revoke", { id, username }));
    }

    // DELETE DOCUMENT
    async deleteDocument(id: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(this.buildUrl("delete", { id }));
    }

    // LIST DELETED DOCUMENTS
    async listDeletedDocuments(all: boolean = false): Promise<Document[]> {
        const params: Record<string, string> = { show_deleted: "1" };
        if (all) params.all = "1";

        return this.request<Document[]>(this.buildUrl("list", params));
    }

    // RESTORE DOCUMENT
    async restoreDocument(id: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(this.buildUrl("restore", { id }));
    }

    // PERMANENTLY DELETE DOCUMENT
    async permanentDeleteDocument(id: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(this.buildUrl("permanent_delete", { id }));
    }

    // CHECK ACCESS
    async checkAccess(id: string, version?: string): Promise<DocumentAccess> {
        const params: Record<string, string> = { id };
        if (version) params.version = version;
        return this.request<DocumentAccess>(this.buildUrl("access", params));
    }

    // GET ROOM FOR VERSION
    async getRoom(id: string, version: string): Promise<DocumentRoomResult> {
        return this.request<DocumentRoomResult>(this.buildUrl("get_room", { id, version }));
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
