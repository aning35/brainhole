import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let db: any = null;

export interface CanvasRecord {
    id: string;
    name: string;
    content: string; // JSON string
    thumbnail?: string;
    created_at: number;
    updated_at: number;
    tags?: string; // JSON string array
}

export interface KnowledgeGraphRecord {
    id: string;
    name: string;
    status: 'idle' | 'indexing' | 'ready' | 'error';
    config: string; // JSON string
    file_paths: string; // JSON string array
    error_message?: string;
    created_at: number;
    updated_at: number;
}

export const initDB = () => {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'brainhole.db');

    // Ensure directory exists
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }

    console.log('Initializing database at:', dbPath);

    try {
        db = new Database(dbPath);

        // Create Canvases table
        db.exec(`
      CREATE TABLE IF NOT EXISTS canvases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT,
        thumbnail TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        tags TEXT
      )
    `);

        // Create Folders table
        db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        display_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

        // Create Knowledge Graphs table
        db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_graphs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'idle',
        config TEXT,
        file_paths TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

        // Migration: Add folder_id to canvases if not exists
        try {
            const columns = db.prepare('PRAGMA table_info(canvases)').all();
            const hasFolderId = columns.some((col: any) => col.name === 'folder_id');
            if (!hasFolderId) {
                db.exec('ALTER TABLE canvases ADD COLUMN folder_id TEXT');
                console.log('Migrated canvases table: added folder_id column');
            }
        } catch (error) {
            console.error('Migration failed:', error);
        }

        // Migration: Add display_order to folders if not exists
        try {
            const folderColumns = db.prepare('PRAGMA table_info(folders)').all();
            const hasDisplayOrder = folderColumns.some((col: any) => col.name === 'display_order');
            if (!hasDisplayOrder) {
                db.exec('ALTER TABLE folders ADD COLUMN display_order INTEGER DEFAULT 0');
                console.log('Migrated folders table: added display_order column');
            }
        } catch (error) {
            console.error('Folder migration failed:', error);
        }

        // Migration: Add display_order to canvases if not exists
        try {
            const canvasColumns = db.prepare('PRAGMA table_info(canvases)').all();
            const hasCanvasOrder = canvasColumns.some((col: any) => col.name === 'display_order');
            if (!hasCanvasOrder) {
                db.exec('ALTER TABLE canvases ADD COLUMN display_order INTEGER DEFAULT 0');
                console.log('Migrated canvases table: added display_order column');
            }
        } catch (error) {
            console.error('Canvas migration failed:', error);
        }

        // Add indexes if needed
        // db.exec('CREATE INDEX IF NOT EXISTS idx_canvases_updated_at ON canvases(updated_at DESC)');

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
};

export const getCanvases = () => {
    if (!db) initDB();
    // Return metadata only for list view to save memory
    return db.prepare(`
    SELECT id, name, thumbnail, created_at, updated_at, tags, folder_id, display_order
    FROM canvases 
    ORDER BY display_order ASC, updated_at DESC
  `).all();
};

export const getFolders = () => {
    if (!db) initDB();
    return db.prepare('SELECT * FROM folders ORDER BY parent_id, display_order ASC, name ASC').all();
};

export const createFolder = (folder: { id: string; name: string; parent_id?: string; display_order?: number; created_at: number; updated_at: number }) => {
    if (!db) initDB();
    const stmt = db.prepare(`
    INSERT INTO folders (id, name, parent_id, display_order, created_at, updated_at)
    VALUES (@id, @name, @parent_id, @display_order, @created_at, @updated_at)
  `);
    return stmt.run({ ...folder, display_order: folder.display_order ?? 0 });
};

export const deleteFolder = (id: string) => {
    if (!db) initDB();
    // Transaction to delete folder and update children
    const deleteFolderTx = db.transaction(() => {
        // Option 1: Delete children canvases? Or move to root? 
        // Let's move canvases to root for safety
        db.prepare('UPDATE canvases SET folder_id = NULL WHERE folder_id = ?').run(id);

        // Move subfolders to root (or parent of deleted folder) - simplified to root for now
        db.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ?').run(id);

        db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    });
    return deleteFolderTx(id);
};

export const updateCanvasFolder = (canvasId: string, folderId: string | null, displayOrder = 0) => {
    if (!db) initDB();
    return db.prepare('UPDATE canvases SET folder_id = ?, display_order = ?, updated_at = ? WHERE id = ?').run(folderId, displayOrder, Date.now(), canvasId);
};

export const updateFolder = (id: string, name: string) => {
    if (!db) initDB();
    return db.prepare('UPDATE folders SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
};

export const getCanvas = (id: string) => {
    if (!db) initDB();
    return db.prepare('SELECT * FROM canvases WHERE id = ?').get(id);
};

export const saveCanvas = (canvas: CanvasRecord & { folder_id?: string, display_order?: number }) => {
    if (!db) initDB();
    const stmt = db.prepare(`
    INSERT INTO canvases (id, name, content, thumbnail, created_at, updated_at, tags, folder_id, display_order)
    VALUES (@id, @name, @content, @thumbnail, @created_at, @updated_at, @tags, @folder_id, @display_order)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      content = excluded.content,
      thumbnail = excluded.thumbnail,
      updated_at = excluded.updated_at,
      tags = excluded.tags,
      folder_id = excluded.folder_id
  `);
    // Ensure canvas object has properties
    return stmt.run({
        ...canvas,
        thumbnail: canvas.thumbnail || null,
        folder_id: (canvas as any).folder_id || null,
        display_order: (canvas as any).display_order || 0
    });
};

export const deleteCanvas = (id: string) => {
    if (!db) initDB();
    return db.prepare('DELETE FROM canvases WHERE id = ?').run(id);
};

// New methods for folder ordering and movement
export const updateFolderOrder = (id: string, order: number) => {
    if (!db) initDB();
    return db.prepare('UPDATE folders SET display_order = ?, updated_at = ? WHERE id = ?').run(order, Date.now(), id);
};

// Reordering with renormalization for stability
export const reorderItem = (
    type: 'folder' | 'canvas',
    id: string,
    targetId: string,
    position: 'top' | 'bottom' | 'inside'
) => {
    if (!db) initDB();

    const table = type === 'folder' ? 'folders' : 'canvases';
    const parentCol = type === 'folder' ? 'parent_id' : 'folder_id';

    const transaction = db.transaction(() => {
        // 1. Determine target folder context
        let targetFolderId: string | null = null;

        if (position === 'inside') {
            targetFolderId = targetId;
        } else {
            // Moving RELATIVE to a sibling
            const targetItem = db.prepare(`SELECT ${parentCol} FROM ${table} WHERE id = ?`).get(targetId);
            if (!targetItem) throw new Error('Target item not found');
            targetFolderId = targetItem[parentCol];
        }

        // 2. Fetch all Items in that context
        // We need to distinguish types.
        // If type is canvas, we only care about canvas siblings in that folder
        // (assuming simple list).
        // If folders and canvases are mixed in display, we might need unified sorting,
        // but current app separates them (Folders first, then Canvases).
        // So we just reorder within the type.

        const siblings = db.prepare(`
            SELECT id, display_order FROM ${table} 
            WHERE ${parentCol} ${targetFolderId === null ? 'IS NULL' : '= ?'}
            ORDER BY display_order ASC, updated_at DESC
        `).all(targetFolderId ? [targetFolderId] : []);

        // 3. Construct new array
        const currentList = siblings.map((s: any) => s.id).filter((sid: string) => sid !== id);

        let insertIndex = -1;
        if (position === 'inside') {
            // Append to end
            insertIndex = currentList.length;
        } else {
            const targetIndex = currentList.indexOf(targetId);
            if (targetIndex === -1) {
                // Target might have been the one we are moving? No, we filtered `id` out.
                // So targetId must be in currentList.
                // If not, something is wrong (maybe database inconsistency).
                // Fallback to end.
                insertIndex = currentList.length;
            } else {
                insertIndex = position === 'top' ? targetIndex : targetIndex + 1;
            }
        }

        currentList.splice(insertIndex, 0, id);

        // 4. Update all orders
        const updateStmt = db.prepare(`UPDATE ${table} SET display_order = ?, ${parentCol} = ?, updated_at = ? WHERE id = ?`);
        const now = Date.now();

        currentList.forEach((itemId: string, index: number) => {
            updateStmt.run(index, targetFolderId, now, itemId);
        });
    });

    return transaction();
};

export const updateCanvasOrder = (id: string, order: number) => {
    if (!db) initDB();
    return db.prepare('UPDATE canvases SET display_order = ?, updated_at = ? WHERE id = ?').run(order, Date.now(), id);
};

export const moveFolderToParent = (folderId: string, newParentId: string | null, displayOrder = 0) => {
    // This needs to be smarter too?
    // If we use reorderItem, we cover this case.
    // But explicit move:
    if (!db) initDB();
    return db.prepare('UPDATE folders SET parent_id = ?, display_order = ?, updated_at = ? WHERE id = ?').run(newParentId, displayOrder, Date.now(), folderId);
};

// Knowledge Graph Methods
export const getGraphs = () => {
    if (!db) initDB();
    return db.prepare('SELECT * FROM knowledge_graphs ORDER BY updated_at DESC').all();
};

export const getGraph = (id: string) => {
    if (!db) initDB();
    return db.prepare('SELECT * FROM knowledge_graphs WHERE id = ?').get(id);
};

export const saveGraph = (graph: KnowledgeGraphRecord) => {
    if (!db) initDB();
    const stmt = db.prepare(`
    INSERT INTO knowledge_graphs (id, name, status, config, file_paths, error_message, created_at, updated_at)
    VALUES (@id, @name, @status, @config, @file_paths, @error_message, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      status = excluded.status,
      config = excluded.config,
      file_paths = excluded.file_paths,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at
  `);
    return stmt.run(graph);
};

export const deleteGraph = (id: string) => {
    if (!db) initDB();
    return db.prepare('DELETE FROM knowledge_graphs WHERE id = ?').run(id);
};

export const updateGraphStatus = (id: string, status: string, errorMessage?: string) => {
    if (!db) initDB();
    return db.prepare('UPDATE knowledge_graphs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?').run(status, errorMessage || null, Date.now(), id);
};
