import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

export const TextEditor = ({ canvasId }: { canvasId: string }) => {
    const { canvasSessionStates, updateCanvasTextContent } = useCanvasStore();
    const session = canvasId ? canvasSessionStates[canvasId] : null;
    const rawContent = session?.textContent || '';

    const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (canvasId) {
            updateCanvasTextContent(canvasId, e.target.value);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-white relative z-30 overflow-hidden flex-1">
            <textarea
                className="flex-1 w-full h-full resize-none p-6 outline-none font-mono text-sm text-gray-800 bg-white"
                value={rawContent}
                onChange={handleEditorChange}
                spellCheck={false}
            />
        </div>
    );
};
