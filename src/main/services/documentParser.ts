import fs from 'fs-extra';
import path from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { t } from '../i18n';

// PDF parsing in Node.js/Electron environment often lacks browser globals like DOMMatrix.
// This polyfill resolves the "[OfficeParser]: DOMMatrix is not defined" error.
if (typeof (global as any).DOMMatrix === 'undefined') {
    (global as any).DOMMatrix = class DOMMatrix {
        constructor() { }
    };
}

/**
 * Metadata about a parsed document.
 * Downstream consumers (AI chat, search, graph indexing) can use this
 * to show previews, compute token budgets, etc.
 */
export interface ParseResult {
    /** Extracted plain-text / Markdown content */
    text: string;
    /** Original file extension (lowercase, with dot) */
    format: string;
    /** Total character count of the extracted text */
    charCount: number;
    /** Rough word count (CJK characters each count as one word) */
    wordCount: number;
    /** Number of pages, if applicable (PDF, PPTX) */
    pageCount?: number;
    /** Title extracted from the document, if available */
    title?: string;
    /** Original file size in bytes */
    fileSize: number;
}

/** Supported file extensions — used across the app to filter file pickers, etc. */
export const SUPPORTED_TEXT_EXTENSIONS = [
    '.txt', '.md', '.log', '.markdown',
];
export const SUPPORTED_DOCUMENT_EXTENSIONS = [
    '.pdf', '.docx', '.doc', '.rtf',
    '.pptx', '.ppt',
    '.xlsx', '.xls', '.csv',
    '.html', '.htm', '.mhtml',
    '.epub',
];
export const SUPPORTED_DATA_EXTENSIONS = [
    '.json', '.yaml', '.yml', '.xml',
];
export const ALL_SUPPORTED_EXTENSIONS = [
    ...SUPPORTED_TEXT_EXTENSIONS,
    ...SUPPORTED_DOCUMENT_EXTENSIONS,
    ...SUPPORTED_DATA_EXTENSIONS,
];

/**
 * Unified document parser — single entry point for converting any supported
 * file format into plain text / Markdown.
 *
 * Usage:
 *   const result = await DocumentParser.parse('/path/to/file.pdf');
 *   console.log(result.text, result.wordCount);
 *
 *   // Legacy: simple text-only API (backward compatible)
 *   const text = await DocumentParser.parseFile('/path/to/file.pdf');
 */
export class DocumentParser {

    // ─── Public API ──────────────────────────────────────────────────────

    /**
     * Full parse: returns text + metadata
     */
    static async parse(filePath: string): Promise<ParseResult> {
        const ext = path.extname(filePath).toLowerCase();
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
            throw new Error('Cannot parse a directory');
        }

        let text: string;
        let pageCount: number | undefined;
        let title: string | undefined;

        try {
            switch (ext) {
                case '.docx':
                case '.doc':
                    text = await this.parseWord(filePath);
                    break;
                case '.pdf':
                    ({ text, pageCount } = await this.parsePDFWithMeta(filePath));
                    break;
                case '.pptx':
                case '.ppt':
                    text = await this.parsePPTX(filePath);
                    break;
                case '.xlsx':
                case '.xls':
                case '.csv':
                    text = await this.parseSpreadsheet(filePath);
                    break;
                case '.html':
                case '.htm':
                case '.mhtml':
                    text = await this.parseHTML(filePath);
                    title = this.extractHTMLTitle(text);
                    break;
                case '.epub':
                    text = await this.parseEPUB(filePath);
                    break;
                case '.rtf':
                    text = await this.parseRTF(filePath);
                    break;
                case '.json':
                    text = await this.parseJSON(filePath);
                    break;
                case '.yaml':
                case '.yml':
                    text = await this.parseYAML(filePath);
                    break;
                case '.xml':
                    text = await this.parseXML(filePath);
                    break;
                case '.txt':
                case '.log':
                case '.md':
                case '.markdown':
                    text = await fs.readFile(filePath, 'utf-8');
                    break;
                default:
                    // Best-effort fallback via officeParser
                    text = await this.parseWithOfficeParser(filePath);
                    break;
            }
        } catch (error: any) {
            console.error(`[DocumentParser] Error parsing ${filePath}:`, error);
            throw new Error(t('serviceMain.parseFileFailed').replace('{ext}', ext).replace('{error}', error.message));
        }

        const safeText = typeof text === 'string' ? text : String(text || '');

        return {
            text: safeText,
            format: ext,
            charCount: safeText.length,
            wordCount: this.countWords(safeText),
            pageCount,
            title: title || path.basename(filePath, ext),
            fileSize: stats.size,
        };
    }

    /**
     * Simple text-only API — backward compatible with existing callers.
     */
    static async parseFile(filePath: string): Promise<string> {
        const result = await this.parse(filePath);
        return result.text;
    }

    /**
     * Check if a file extension is supported by this parser.
     */
    static isSupported(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ALL_SUPPORTED_EXTENSIONS.includes(ext);
    }

    /**
     * Convert a source file to a .txt file in the target directory.
     * Useful for GraphRAG input preparation — everything gets normalized
     * to plain text before being fed to the indexing pipeline.
     *
     * @returns The path to the created .txt file, or null if parsing failed.
     */
    static async convertToTextFile(
        sourcePath: string,
        targetDir: string,
    ): Promise<{ txtPath: string; result: ParseResult } | null> {
        try {
            const result = await this.parse(sourcePath);
            const baseName = path.basename(sourcePath, path.extname(sourcePath));
            const originalName = path.basename(sourcePath);
            const txtPath = path.join(targetDir, `${baseName}.txt`);

            // Prepend a source metadata header so GraphRAG can trace entities
            // back to their original document. GraphRAG stores the txt filename
            // as the document "title", and text_units link entities → documents.
            const header = [
                `[源文档] ${originalName}`,
                `[格式] ${result.format}`,
                result.pageCount ? `[总页数] ${result.pageCount}` : null,
                `[字数] ${result.wordCount}`,
                '---',
                '',
            ].filter(Boolean).join('\n');

            await fs.writeFile(txtPath, header + result.text, 'utf-8');
            console.log(`[DocumentParser] Converted ${sourcePath} → ${txtPath} (${result.wordCount} words)`);
            return { txtPath, result };
        } catch (e: any) {
            console.warn(`[DocumentParser] Failed to convert ${sourcePath}: ${e.message}`);
            return null;
        }
    }

    // ─── Format-specific parsers ──────────────────────────────────────

    private static async parseWord(filePath: string): Promise<string> {
        const buffer = await fs.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return result.value || '';
    }

    private static async parsePDFWithMeta(filePath: string): Promise<{ text: string; pageCount?: number }> {
        // Try Python extraction using our dedicated graphrag-env with pypdfium2
        // Since graphrag-env is automatically provisioned and contains pypdfium2, this is the most robust method.
        try {
            const { app } = require('electron');
            const envPath = path.join(app.getPath('userData'), 'graphrag-env');
            const isWin = process.platform === 'win32';
            const pythonCmd = path.join(envPath, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python3');
            
            if (await fs.pathExists(pythonCmd)) {
                const pyScript = `
import sys, json
try:
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(sys.argv[1])
    text = "\\n\\n".join([page.get_textpage().get_text_range() for page in pdf])
    print(json.dumps({"text": text, "pageCount": len(pdf)}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
sys.exit(0)
`;
                const { execFile } = require('child_process');
                const util = require('util');
                const execFilePromise = util.promisify(execFile);
                
                const { stdout } = await execFilePromise(pythonCmd, ['-c', pyScript, filePath]);
                const res = JSON.parse(stdout.trim());
                if (res.error) throw new Error(res.error);
                
                return {
                    text: res.text,
                    pageCount: res.pageCount
                };
            }
        } catch (pyErr) {
            console.error('[DocumentParser] Python pypdfium2 extraction failed:', pyErr);
        }

        // JS Fallback
        try {
            const pdfParse = require('pdf-parse');
            const buffer = await fs.readFile(filePath);
            const data = await pdfParse(buffer);
            return {
                text: data.text || '',
                pageCount: data.numpages,
            };
        } catch (e: any) {
            console.error('[DocumentParser] JS pdf-parse failed:', e);
            throw new Error(t('serviceMain.parsePdfFailed'));
        }
    }

    private static async parsePPTX(filePath: string): Promise<string> {
        // officeParser handles .pptx natively and extracts slide text
        return await this.parseWithOfficeParser(filePath);
    }

    private static async parseSpreadsheet(filePath: string): Promise<string> {
        const workbook = XLSX.readFile(filePath);
        let fullText = '';

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            fullText += `### Sheet: ${sheetName}\n\n${csv}\n\n`;
        });

        return fullText;
    }

    private static async parseHTML(filePath: string): Promise<string> {
        const raw = await fs.readFile(filePath, 'utf-8');

        // Simple but effective HTML-to-text: strip tags while preserving structure
        let text = raw
            // Remove script/style blocks
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            // Convert block elements to newlines
            .replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote)>/gi, '\n')
            .replace(/<(br|hr)\s*\/?>/gi, '\n')
            // Strip remaining tags
            .replace(/<[^>]+>/g, '')
            // Decode common HTML entities
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            // Collapse excessive whitespace
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return text;
    }

    private static extractHTMLTitle(rawHtml: string): string | undefined {
        const match = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return match ? match[1].trim() : undefined;
    }

    private static async parseEPUB(filePath: string): Promise<string> {
        // officeParser supports epub extraction
        try {
            return await this.parseWithOfficeParser(filePath);
        } catch (e) {
            // Fallback: try reading raw as text (EPUB is a zip of XHTML files)
            console.warn('[DocumentParser] EPUB fallback: officeParser failed, trying raw extraction');
            throw e;
        }
    }

    private static async parseRTF(filePath: string): Promise<string> {
        // officeParser supports RTF
        return await this.parseWithOfficeParser(filePath);
    }

    private static async parseJSON(filePath: string): Promise<string> {
        const content = await fs.readJson(filePath);
        return JSON.stringify(content, null, 2);
    }

    private static async parseYAML(filePath: string): Promise<string> {
        const yaml = require('js-yaml');
        const content = await fs.readFile(filePath, 'utf-8');
        const doc = yaml.load(content);
        return JSON.stringify(doc, null, 2);
    }

    private static async parseXML(filePath: string): Promise<string> {
        // For XML we just return the raw content — it's already text
        return await fs.readFile(filePath, 'utf-8');
    }

    private static async parseWithOfficeParser(filePath: string): Promise<string> {
        const officeParser = require('officeparser');
        return new Promise((resolve, reject) => {
            officeParser.parseOffice(filePath, (data: any, err: any) => {
                if (err) return reject(err);
                resolve(data || '');
            });
        });
    }

    // ─── Utilities ───────────────────────────────────────────────────────

    /**
     * Count words in text. Handles both CJK and Latin text:
     * - Each CJK character counts as 1 word
     * - Latin words are split by whitespace
     */
    private static countWords(text: string): number {
        if (!text) return 0;

        // Count CJK characters (Chinese, Japanese, Korean)
        const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
        const cjkCount = cjkChars ? cjkChars.length : 0;

        // Remove CJK characters and count remaining Latin words
        const nonCjk = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, ' ');
        const latinWords = nonCjk.split(/\s+/).filter(w => w.length > 0);

        return cjkCount + latinWords.length;
    }
}
