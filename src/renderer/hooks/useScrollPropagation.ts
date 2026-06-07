import { useCallback } from 'react';

/**
 * Hook to prevent canvas panning when scrolling within node content
 * Usage: Add to scrollable containers with onWheel={handleWheel}
 */
export function useScrollPropagation() {
    const handleWheel = useCallback((e: React.WheelEvent<HTMLElement>) => {
        const target = e.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = target;
        const isScrollable = scrollHeight > clientHeight;

        // Allow Ctrl/Cmd + wheel to always propagate to React Flow for zooming
        if (e.ctrlKey || e.metaKey) {
            return;
        }

        if (!isScrollable) {
            // If not scrollable, allow canvas to pan
            return;
        }

        const scrollingDown = e.deltaY > 0;
        const scrollingUp = e.deltaY < 0;
        const atTop = scrollTop === 0;
        const atBottom = Math.abs(scrollTop + clientHeight - scrollHeight) < 1;

        // Stop propagation if we can still scroll in the current direction
        if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
            e.stopPropagation();
        }
    }, []);

    return { handleWheel };
}
