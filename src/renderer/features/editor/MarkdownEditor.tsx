import { t } from 'i18next';
import React, { useMemo, useCallback, useState, useRef } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { aiService } from '@/services/aiService';
import { useToast } from '@/hooks/useToast';
import { Sparkles, X, Check, Loader2 } from 'lucide-react';
import {
    MDXEditor,
    headingsPlugin,
    listsPlugin,
    quotePlugin,
    thematicBreakPlugin,
    markdownShortcutPlugin,
    toolbarPlugin,
    UndoRedo,
    BoldItalicUnderlineToggles,
    BlockTypeSelect,
    CodeToggle,
    ListsToggle,
    CreateLink,
    linkPlugin,
    linkDialogPlugin,
    StrikeThroughSupSubToggles,
    DiffSourceToggleWrapper,
    diffSourcePlugin,
    HighlightToggle,
    codeMirrorPlugin,
    InsertTable,
    InsertImage,
    InsertThematicBreak,
    InsertCodeBlock,
    tablePlugin,
    imagePlugin,
    codeBlockPlugin,
} from '@mdxeditor/editor';
import type { CodeBlockEditorDescriptor } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { MermaidBlock } from './MermaidRenderer';

// KaTeX math block renderer (used like MermaidBlock for code blocks with language 'math')
const MathBlock: React.FC<{ code: string }> = ({ code }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (containerRef.current && code) {
            // Sanitize LaTeX: fix auto-save double escaping and non-standard commands
            let tex = code.trim();
            // Normalize double backslashes from auto-save (\\frac → \frac)
            tex = tex.replace(/\\\\(?=[a-zA-Z{])/g, '\\');
            // Replace non-standard \= with = (MinerU artifact)
            tex = tex.replace(/\\=/g, '=');
            try {
                katex.render(tex, containerRef.current, {
                    displayMode: true,
                    throwOnError: false,
                    output: 'html',
                    strict: false,
                });
            } catch (e) {
                console.warn('[KaTeX] Render error:', e);
                containerRef.current.textContent = code;
            }
        }
    }, [code]);
    return <div ref={containerRef} className="katex-block-container" style={{ textAlign: 'center', padding: '12px 0', fontSize: '1.1em', overflowX: 'auto' }} />;
};

/**
 * Normalize raw markdown so MDX's strict JSX parser can handle embedded HTML:
 * - Un-escape MinerU's over-escaped characters: \[ \] \( \) \_ etc.
 * - HTML void elements → self-closing JSX form
 * - Unquoted HTML attribute values → quoted
 * - Only processes outside of fenced code blocks
 */
function normalizeHtmlInMarkdown(md: string): string {
    if (!md) return md;

    // Helper: escape markdown-dangerous chars (* ~ _) in HTML text nodes only,
    // preserving HTML tags and their attributes (class names, etc.) intact.
    const sanitizeHtmlTextContent = (html: string): string =>
        html.replace(/(<[^>]+>)|([^<]+)/g, (_seg: string, tag: string, text: string) => {
            if (tag) return tag;  // preserve HTML tags
            return text
                .replace(/\*/g, '&#42;')
                .replace(/~/g, '&#126;')
                .replace(/_/g, '&#95;');
        });

    // LaTeX math formulas — BLOCK MATH ONLY
    // Convert $$...$$ to fenced code blocks with language 'math'
    // MathBlock component (registered via codeBlockEditorDescriptors) renders with KaTeX
    md = md.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex) => {
        return '\n```math\n' + tex.trim() + '\n```\n';
    });

    // Sanitize HTML table cell content BEFORE line-by-line processing.
    // MDX parses markdown inside HTML tags, so characters like * ~ _ inside <td>
    // cells cause fatal AST errors (e.g. unclosed emphasis before </td>).
    // Replace them with HTML entities in TEXT portions only (preserve <img> etc.).
    md = md.replace(/(<td[^>]*>)([\s\S]*?)(<\/td>)/g, (_match, open, inner, close) => {
        return open + sanitizeHtmlTextContent(inner) + close;
    });

    const voidTags = ['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'embed', 'param', 'source', 'track', 'wbr'];
    const voidPattern = new RegExp(
        `<(${voidTags.join('|')})\\b([^>]*?)\\s*/?>`,
        'gi'
    );
    const unquotedAttrPattern = /(\w+)=([^\s"'>][^\s>]*)/g;

    const lines = md.split('\n');
    let inCode = false;
    return lines.map(line => {
        if (line.trimStart().startsWith('```')) {
            inCode = !inCode;
        }
        if (inCode) return line;

        // Un-escape MinerU's over-escaped markdown characters:
        // !\[]\(path\_images/file.jpg) → ![](path_images/file.jpg)
        line = line.replace(/\\([\[\]()_*~`#>+\-.!|{}])/g, '$1');

        // Escape invalid HTML tags that start with numbers, spaces, or symbols (e.g., <1, < 0, <=).
        // The MDX JSX parser expects tags to start with a letter, /, or !. 
        // Failing to escape these causes the editor to crash with "Unexpected character before name".
        line = line.replace(/<(?![a-zA-Z\/!])/g, '&lt;');

        // URL-encode spaces in markdown image paths.
        // CommonMark doesn't allow bare spaces in URLs, so MDXEditor treats
        // ![](path with space) as plain text. Encoding spaces to %20 fixes this.
        line = line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, path) => {
            const trimmed = path.trim();
            // Skip already-encoded or absolute URLs
            if (/^(https?:|data:|blob:|local-asset:)/i.test(trimmed)) return _match;
            // Encode spaces only
            const encodedPath = trimmed.replace(/ /g, '%20');
            return `![${alt}](${encodedPath})`;
        });

        line = line.replace(/&#(?:xA|x0A|10);/gi, '<br />');

        line = line.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
            return tag.replace(unquotedAttrPattern, (_m, attr, val) => {
                return `${attr}="${val}"`;
            });
        });

        line = line.replace(voidPattern, (_match, tag, attrs) => {
            const trimmedAttrs = (attrs || '').trimEnd();
            return `<${tag}${trimmedAttrs} />`;
        });

        return line;
    }).join('\n');
}

/**
 * Splits a long text into chunks, prioritizing paragraph breaks (\n\n) to avoid breaking sentences.
 */
function splitTextIntoChunks(text: string, maxChunkSize = 3000): string[] {
    if (!text) return [];
    
    // Split by double newlines, keeping the separator so we can reconstruct exactly
    const blocks = text.split(/(\n\n+)/); 
    
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const block of blocks) {
        if (currentChunk.length + block.length > maxChunkSize && currentChunk.trim().length > 0) {
            chunks.push(currentChunk);
            currentChunk = block;
        } else {
            currentChunk += block;
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

export const MarkdownEditor = ({ canvasId }: { canvasId: string }) => {
    const { canvasSessionStates, updateCanvasTextContent } = useCanvasStore();
    const session = canvasId ? canvasSessionStates[canvasId] : null;

    const fileDir = canvasId ? canvasId.substring(0, Math.max(canvasId.lastIndexOf('/'), canvasId.lastIndexOf('\\'))) : '';
    const rawContent = session?.textContent || '';

    // For remounting MDXEditor on applying corrections
    const [editorRevision, setEditorRevision] = useState(0);

    // AI Proofreading State
    const [isProofreading, setIsProofreading] = useState(false);
    const [proofreadResult, setProofreadResult] = useState('');
    const [showProofreadPanel, setShowProofreadPanel] = useState(false);
    const [chunkProgress, setChunkProgress] = useState<{ current: number, total: number } | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const { showToast } = useToast();

    // Pre-process: normalize HTML + un-escape (no image path changes — keeps relative paths)
    const initialValue = useMemo(
        () => normalizeHtmlInMarkdown(rawContent),
        [canvasId, editorRevision]
    );




    const handleStartProofread = async () => {
        if (!rawContent.trim()) {
            showToast(t('editor.toast.emptyProofread'), 'warning');
            return;
        }

        const settings = useCanvasStore.getState();
        if (!settings.aiApiKey) {
            showToast(t('editor.toast.noApiKey'), 'error');
            return;
        }

        setShowProofreadPanel(true);
        setIsProofreading(true);
        setProofreadResult('');
        setChunkProgress(null);

        abortControllerRef.current = new AbortController();

        try {
            const chunks = splitTextIntoChunks(rawContent, 3000);
            let completedText = '';

            for (let i = 0; i < chunks.length; i++) {
                if (abortControllerRef.current.signal.aborted) {
                    break;
                }

                if (chunks.length > 1) {
                    setChunkProgress({ current: i + 1, total: chunks.length });
                }

                const chunk = chunks[i];
                const chunkResult = await aiService.proofreadContent(
                    chunk,
                    {
                        aiApiKey: settings.aiApiKey,
                        aiBaseUrl: settings.aiBaseUrl,
                        aiModel: settings.aiModel || 'deepseek-v4-flash',
                    },
                    abortControllerRef.current.signal,
                    (partial) => {
                        setProofreadResult(completedText + partial);
                    }
                );

                completedText += chunkResult;
                setProofreadResult(completedText);
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                showToast(err.message || t('editor.toast.proofreadFailed'), 'error');
            }
        } finally {
            setIsProofreading(false);
            setChunkProgress(null);
            abortControllerRef.current = null;
        }
    };

    const handleApplyProofread = () => {
        if (!proofreadResult) return;
        updateCanvasTextContent(canvasId, proofreadResult);
        setEditorRevision(prev => prev + 1); // Trigger MDXEditor remount with new initialValue
        setShowProofreadPanel(false);
        setProofreadResult('');
        showToast(t('editor.toast.proofreadApplied'), 'success');
    };

    const handleCancelProofread = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setShowProofreadPanel(false);
        setProofreadResult('');
        setIsProofreading(false);
        setChunkProgress(null);
    };

    // imagePreviewHandler: MDXEditor's official API for transforming image URLs at render time.
    // This resolves relative paths to local-asset:// without modifying the markdown source.
    // Source mode keeps original relative paths, rich text displays images correctly.
    const imagePreviewHandler = useCallback(async (imageSource: string): Promise<string> => {
        if (!fileDir) return imageSource;
        // Skip already-absolute URLs
        if (/^(https?:|data:|blob:|local-asset:|file:)/i.test(imageSource)) return imageSource;

        // Decode %20 etc. to real file path chars
        const decodedSrc = decodeURIComponent(imageSource);

        // MinerU outputs images to "images/" but mineruParser renames the folder to
        // "{basename}_images/". Remap at render time so images resolve correctly.
        let resolvedSrc = decodedSrc;
        if (decodedSrc.startsWith('images/') && canvasId) {
            const sep = canvasId.includes('\\') ? '\\' : '/';
            const fileName = canvasId.substring(canvasId.lastIndexOf(sep) + 1);
            const baseName = fileName.replace(/\.[^.]+$/, '');
            resolvedSrc = `${baseName}_images/${decodedSrc.substring('images/'.length)}`;
        }

        const absolutePath = resolvedSrc.startsWith('/')
            ? resolvedSrc
            : `${fileDir}/${resolvedSrc}`;
        // Normalize Windows backslashes to forward slashes before encoding,
        // so the protocol handler can correctly parse the URL path
        const normalizedPath = absolutePath.replace(/\\/g, '/');
        const encoded = encodeURIComponent(normalizedPath).replace(/%2F/g, '/');
        return `local-asset://local/${encoded}`;
    }, [fileDir, canvasId]);

    const handleEditorChange = (value: string) => {
        if (canvasId) {
            updateCanvasTextContent(canvasId, value);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-white relative z-30 overflow-hidden flex-1 MarkdownEditor-wrapper max-h-full min-h-0 select-text">
            <div className="flex-1 min-h-0 relative h-full flex flex-col">
                <div className="flex-1 min-h-0 relative h-full overflow-hidden">
                    <MDXEditor
                        className="mdx-editor-full-height"
                        key={`${canvasId}-${editorRevision}`}
                        markdown={initialValue}
                        onChange={handleEditorChange}
                        contentEditableClassName="prose max-w-none w-full px-6 py-4 outline-none min-h-full select-text"
                        plugins={[
                            headingsPlugin(),
                            listsPlugin(),
                            quotePlugin(),
                            thematicBreakPlugin(),
                            linkPlugin(),
                            linkDialogPlugin(),
                            markdownShortcutPlugin(),
                            diffSourcePlugin({ viewMode: 'rich-text' }),
                            codeMirrorPlugin({ codeBlockLanguages: { js: 'JavaScript', css: 'CSS', txt: 'text', tsx: 'TypeScript', mermaid: 'Mermaid', math: 'Math' } }),
                            codeBlockPlugin({
                                codeBlockEditorDescriptors: [
                                    {
                                        priority: 100,
                                        match: (language) => language === 'mermaid',
                                        Editor: ({ code }) => <MermaidBlock code={code} />,
                                    } as CodeBlockEditorDescriptor,
                                    {
                                        priority: 100,
                                        match: (language) => language === 'math',
                                        Editor: ({ code }) => <MathBlock code={code} />,
                                    } as CodeBlockEditorDescriptor,
                                ],
                            }),
                            tablePlugin(),
                            imagePlugin({ imagePreviewHandler }),
                            toolbarPlugin({
                                toolbarContents: () => (
                                    <DiffSourceToggleWrapper options={['rich-text', 'source']}>
                                        <div className="flex flex-wrap items-center gap-1 w-full bg-gray-50 border-b border-gray-200 px-2 py-1 sticky top-0 z-10">
                                            <UndoRedo />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <BoldItalicUnderlineToggles />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <CodeToggle />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <HighlightToggle />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <StrikeThroughSupSubToggles />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <ListsToggle />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <BlockTypeSelect />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <CreateLink />
                                            <div className="w-px h-4 bg-gray-300 mx-1" />
                                            <InsertImage />
                                            <InsertTable />
                                            <InsertThematicBreak />
                                            <InsertCodeBlock />
                                            <div className="flex-1" />
                                            <button
                                                type="button"
                                                onClick={handleStartProofread}
                                                className="ml-auto px-3 py-1.5 text-xs font-medium border border-violet-200 rounded-lg bg-gradient-to-r from-violet-50 to-purple-50 text-violet-600 hover:from-violet-100 hover:to-purple-100 hover:border-violet-300 transition-colors flex items-center gap-1.5 shadow-sm"
                                                title={t('editor.useAIToFix')}
                                            >
                                                {t('editor.aiProofread')}
                                            </button>
                                        </div>
                                    </DiffSourceToggleWrapper>
                                )
                            })
                        ]}
                    />
                </div>

                {/* AI Proofread Panel */}
                {showProofreadPanel && (
                    <div className="h-64 border-t border-violet-200 bg-violet-50/30 flex flex-col shrink-0 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] relative z-20">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-violet-100 bg-white/80 backdrop-blur-sm">
                            <div className="flex items-center gap-2 text-violet-700">
                                {isProofreading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Sparkles className="w-4 h-4" />
                                )}
                                <span className="text-sm font-medium">
                                    {isProofreading 
                                        ? `${t('editor.aiProofreading')} ${chunkProgress ? `(${chunkProgress.current}/${chunkProgress.total})` : ''}` 
                                        : t('editor.aiProofreadComplete')}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleApplyProofread}
                                    disabled={isProofreading || !proofreadResult}
                                    className={`px-3 py-1 text-xs font-medium rounded border flex items-center gap-1 transition-colors ${isProofreading || !proofreadResult
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                        : 'bg-violet-600 text-white border-violet-700 hover:bg-violet-700'
                                        }`}
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    {t('editor.applyAndReplace')}
                                </button>
                                <button
                                    onClick={handleCancelProofread}
                                    className="p-1 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                                    title={t('editor.cancel')}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto bg-white/50 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                            {proofreadResult || (isProofreading ? <span className="text-gray-400 italic">{t('editor.generating')}</span> : '')}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
