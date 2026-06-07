import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with sensible defaults
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    sequence: {
        diagramMarginX: 20,
        diagramMarginY: 10,
        actorMargin: 80,
        width: 180,
        height: 40,
        boxMargin: 10,
        noteMargin: 10,
        messageMargin: 30,
        mirrorActors: true,
        useMaxWidth: true,
    },
    flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
    },
});

let mermaidCounter = 0;

interface MermaidBlockProps {
    code: string;
}

export const MermaidBlock: React.FC<MermaidBlockProps> = ({ code }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [svg, setSvg] = useState<string>('');
    const idRef = useRef(`mermaid-${++mermaidCounter}-${Date.now()}`);

    useEffect(() => {
        if (!code?.trim()) return;

        let cancelled = false;
        const render = async () => {
            try {
                // Validate before rendering
                await mermaid.parse(code);
                const { svg: renderedSvg } = await mermaid.render(idRef.current, code);
                if (!cancelled) {
                    setSvg(renderedSvg);
                    setError(null);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(e.message || 'Mermaid rendering failed');
                    setSvg('');
                }
            }
        };
        render();
        return () => { cancelled = true; };
    }, [code]);

    if (error) {
        return (
            <div className="border border-orange-200 bg-orange-50 rounded-lg p-3 my-2">
                <div className="text-xs text-orange-600 font-medium mb-1">⚠ Mermaid Diagram Error</div>
                <pre className="text-xs text-orange-800 whitespace-pre-wrap font-mono">{error}</pre>
                <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">Source</summary>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono mt-1 bg-white p-2 rounded">{code}</pre>
                </details>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="flex items-center justify-center py-4 text-gray-400 text-sm">
                <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full mr-2" />
                Rendering diagram...
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="mermaid-rendered my-3 flex justify-center overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};
