import { t } from 'i18next';
import { useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useToast } from '@/hooks/useToast';

interface GlobalShortcutsProps {
    onToggleSidebar: () => void;
    onNavigate: (page: 'canvas' | 'all-canvases') => void;
    onFocusSearch?: () => void;
}

export function useGlobalShortcuts({
    onToggleSidebar,
    onNavigate,
    onFocusSearch
}: GlobalShortcutsProps) {
    const {
        openCanvasIds,
        activeCanvasId,
        setActiveCanvas,
        closeCanvas,
        createNewCanvas,
        saveCurrentCanvas,
        setShortcutHelpOpen,
        isShortcutHelpOpen,
        setSidebarActiveTab
    } = useCanvasStore();
    const { showToast } = useToast();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;
            const isShift = e.shiftKey;

            // 1. New Canvas: Cmd + N
            if (isMod && e.key === 'n') {
                e.preventDefault();
                createNewCanvas().then(id => {
                    if (id) {
                        onNavigate('canvas');
                        showToast(t('shortcuts.toast.newCanvas'), 'success');
                    }
                });
                return;
            }

            // 2. Save: Cmd + S
            if (isMod && e.key === 's') {
                e.preventDefault();
                saveCurrentCanvas().then(() => {
                    showToast(t('shortcuts.toast.saved'), 'success');
                });
                return;
            }

            // 3. Toggle Sidebar: Cmd + \
            if (isMod && e.key === '\\') {
                e.preventDefault();
                onToggleSidebar();
                return;
            }

            // 4. Search: Cmd + Shift + F
            if (isMod && isShift && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setSidebarActiveTab('search');
                if (onFocusSearch) {
                    onFocusSearch();
                }
                return;
            }

            // 5. Help: Cmd + /
            if (isMod && e.key === '/') {
                e.preventDefault();
                setShortcutHelpOpen(!isShortcutHelpOpen);
                return;
            }

            // 6. Close Tab: Cmd + W
            if (isMod && e.key === 'w' && activeCanvasId) {
                e.preventDefault();
                closeCanvas(activeCanvasId);
                return;
            }

            // 7. Tab Switching: Cmd + [ or Cmd + ]
            if (isMod && (e.key === '[' || e.key === ']')) {
                e.preventDefault();
                if (openCanvasIds.length <= 1) return;

                const currentIndex = openCanvasIds.indexOf(activeCanvasId || '');
                let nextIndex = currentIndex;

                if (e.key === '[') {
                    nextIndex = (currentIndex - 1 + openCanvasIds.length) % openCanvasIds.length;
                } else {
                    nextIndex = (currentIndex + 1) % openCanvasIds.length;
                }

                const nextId = openCanvasIds[nextIndex];
                if (nextId) {
                    setActiveCanvas(nextId);
                    onNavigate('canvas');
                }
                return;
            }

            // 8. Tab Index: Cmd + 1...9
            if (isMod && /^[1-9]$/.test(e.key)) {
                const index = parseInt(e.key) - 1;
                if (index < openCanvasIds.length) {
                    e.preventDefault();
                    const targetId = openCanvasIds[index];
                    if (targetId) {
                        setActiveCanvas(targetId);
                        onNavigate('canvas');
                    }
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        activeCanvasId,
        openCanvasIds,
        isShortcutHelpOpen,
        createNewCanvas,
        saveCurrentCanvas,
        closeCanvas,
        setActiveCanvas,
        setShortcutHelpOpen,
        setSidebarActiveTab,
        onToggleSidebar,
        onNavigate,
        onFocusSearch,
        showToast
    ]);
}
