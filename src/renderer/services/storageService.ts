
export interface CanvasMetadata {
    id: string;
    name: string;
    thumbnail?: string;
    createdAt: Date;
    updatedAt: Date;
    tags: string[];
    folderId?: string;
    displayOrder: number;
}

export interface Folder {
    id: string;
    name: string;
    parent_id?: string;
    display_order: number;
    created_at: number;
    updated_at: number;
}

export interface CanvasData extends CanvasMetadata {
    content: string; // JSON string of nodes/edges
}

export const mapDBRecordToMetadata = (record: any): CanvasMetadata => ({
    id: record.id,
    name: record.name,
    thumbnail: record.thumbnail,
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
    tags: record.tags ? JSON.parse(record.tags) : [],
    folderId: record.folder_id,
    displayOrder: record.display_order,
});

export const storageService = {
    async getAllCanvases(): Promise<CanvasMetadata[]> {
        try {
            if (!window.electronAPI?.db) return [];
            const records = await window.electronAPI.db.getAll();
            return records.map(mapDBRecordToMetadata);
        } catch (error) {
            console.error('Failed to get canvases:', error);
            return [];
        }
    },

    async getCanvas(id: string): Promise<CanvasData | null> {
        try {
            if (!window.electronAPI?.db) return null;
            const record = await window.electronAPI.db.getOne(id);
            if (!record) return null;

            return {
                ...mapDBRecordToMetadata(record),
                content: record.content,
            };
        } catch (error) {
            console.error('Failed to get canvas:', error);
            return null;
        }
    },

    async saveCanvas(data: CanvasData): Promise<void> {
        try {
            if (!window.electronAPI?.db) return;
            await window.electronAPI.db.save({
                id: data.id,
                name: data.name,
                thumbnail: data.thumbnail,
                content: data.content,
                created_at: data.createdAt.getTime(),
                updated_at: data.updatedAt.getTime(),
                tags: JSON.stringify(data.tags),
            });
        } catch (error) {
            console.error('Failed to save canvas:', error);
            throw error;
        }
    },

    async deleteCanvas(id: string): Promise<void> {
        try {
            if (!window.electronAPI?.db) return;
            await window.electronAPI.db.delete(id);
        } catch (error) {
            console.error('Failed to delete canvas:', error);
            throw error;
        }
    },

    async getFolders(): Promise<Folder[]> {
        try {
            if (!window.electronAPI?.db) return [];
            return await window.electronAPI.db.getFolders();
        } catch (error) {
            console.error('Failed to get folders:', error);
            return [];
        }
    },

    async createFolder(folder: Folder): Promise<void> {
        try {
            if (!window.electronAPI?.db) return;
            await window.electronAPI.db.createFolder(folder);
        } catch (error) {
            console.error('Failed to create folder:', error);
            throw error;
        }
    },

    async deleteFolder(id: string): Promise<void> {
        try {
            if (!window.electronAPI?.db) return;
            await window.electronAPI.db.deleteFolder(id);
        } catch (error) {
            console.error('Failed to delete folder:', error);
            throw error;
        }
    },

    async updateFolder(id: string, name: string): Promise<void> {
        try {
            if (!window.electronAPI?.db) return;
            await window.electronAPI.db.updateFolder({ id, name });
        } catch (error) {
            console.error('Failed to update folder:', error);
            throw error;
        }
    },

    async updateCanvasFolder(canvasId: string, folderId: string | null): Promise<void> {
        try {
            if (!window.electronAPI?.db) return;
            await window.electronAPI.db.updateCanvasFolder({ canvasId, folderId });
        } catch (error) {
            console.error('Failed to update canvas folder:', error);
            throw error;
        }
    }
};
