import { t } from 'i18next';
import React, { useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutItem {
  key: string;
  description: string;
  category: string;
}

const shortcuts: ShortcutItem[] = [
  // Global shortcuts
  { key: 'Ctrl/Cmd + N', description: t('ui.shortcuts.newCanvas'), category: t('ui.shortcuts.global') },
  { key: 'Ctrl/Cmd + S', description: t('ui.shortcuts.saveCanvas'), category: t('ui.shortcuts.global') },
  { key: 'Ctrl/Cmd + \\', description: t('ui.shortcuts.toggleSidebar'), category: t('ui.shortcuts.global') },
  { key: 'Ctrl/Cmd + Shift + F', description: t('ui.shortcuts.searchCanvas'), category: t('ui.shortcuts.global') },
  { key: 'Ctrl/Cmd + W', description: t('ui.shortcuts.closeTab'), category: t('ui.shortcuts.global') },
  { key: 'Ctrl/Cmd + [ / ]', description: t('ui.shortcuts.switchTab'), category: t('ui.shortcuts.global') },
  { key: 'Ctrl/Cmd + 1...9', description: t('ui.shortcuts.switchSpecificTab'), category: t('ui.shortcuts.global') },
  { key: 'Ctrl/Cmd + /', description: t('ui.shortcuts.toggleHelp'), category: t('ui.shortcuts.global') },

  // Canvas operations
  { key: 'Ctrl/Cmd + Z', description: t('ui.shortcuts.undo'), category: t('ui.shortcuts.canvasOps') },
  { key: 'Ctrl/Cmd + Y', description: t('ui.shortcuts.redo'), category: t('ui.shortcuts.canvasOps') },
  { key: 'Ctrl/Cmd + Shift + Z', description: t('ui.shortcuts.redo'), category: t('ui.shortcuts.canvasOps') },
  { key: 'Space', description: t('ui.shortcuts.fitView'), category: t('ui.shortcuts.canvasOps') },
  { key: '[ / ]', description: t('ui.shortcuts.zoom'), category: t('ui.shortcuts.canvasOps') },
  { key: '↑ ↓ ← →', description: t('ui.shortcuts.moveNode'), category: t('ui.shortcuts.canvasOps') },
  { key: 'Shift + 方向键', description: t('ui.shortcuts.fastMoveNode'), category: t('ui.shortcuts.canvasOps') },

  // Selection operations
  { key: 'Click', description: t('ui.shortcuts.selectSingle'), category: t('ui.shortcuts.selectOps') },
  { key: 'Shift + Click', description: t('ui.shortcuts.selectMultiple'), category: t('ui.shortcuts.selectOps') },
  { key: 'Ctrl/Cmd + A', description: t('ui.shortcuts.selectAll'), category: t('ui.shortcuts.selectOps') },
  { key: 'Escape', description: t('ui.shortcuts.deselect'), category: t('ui.shortcuts.selectOps') },

  // Node editing
  { key: 'Ctrl/Cmd + D', description: t('ui.shortcuts.duplicate'), category: t('ui.shortcuts.nodeOps') },
  { key: 'Ctrl/Cmd + Enter', description: t('ui.shortcuts.runPrompt'), category: t('ui.shortcuts.nodeOps') },
  { key: 'Double Click', description: t('ui.shortcuts.editTitle'), category: t('ui.shortcuts.nodeOps') },

  // Delete operations
  { key: 'Delete', description: t('ui.shortcuts.deleteEdge'), category: t('ui.shortcuts.deleteOps') },
  { key: 'Shift + Delete', description: t('ui.shortcuts.deleteNodeAndEdge'), category: t('ui.shortcuts.deleteOps') },

  // Context menu
  { key: 'Right Click', description: t('ui.shortcuts.contextMenu'), category: t('ui.shortcuts.menuOps') },
];

const categories = Array.from(new Set(shortcuts.map(s => s.category)));

interface ShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutHelpModal({ isOpen, onClose }: ShortcutHelpProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal with ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden relative z-[10000] flex flex-col transform animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
      >
        {/* Title bar */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="shortcut-help-title" className="text-lg font-semibold flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            键盘快捷键
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title={t('ui.shortcuts.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        <div className="p-4 overflow-y-auto flex-1" style={{ maxHeight: 'calc(85vh - 180px)' }}>
          {categories.map(category => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-medium text-gray-600 mb-3 border-b pb-1">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts
                  .filter(s => s.category === category)
                  .map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded"
                    >
                      <span className="text-sm text-gray-700">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.key.split(' + ').map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            {keyIndex > 0 && <span className="text-xs text-gray-400">+</span>}
                            <kbd className="px-2 py-1 text-xs font-medium bg-gray-100 border border-gray-300 rounded">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Tooltip message */}
        <div className="p-4 bg-yellow-50 border-t flex-shrink-0">
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">{t('ui.shortcuts.safeDeleteTip')}</p>
            <p>{t('ui.shortcuts.safeDeleteDesc1')} <kbd className="px-1 py-0.5 bg-yellow-200 rounded text-xs">Shift + Delete</kbd> {t('ui.shortcuts.safeDeleteDesc2')}</p>
            <p className="mt-1">{t('ui.shortcuts.safeDeleteDesc3')} <kbd className="px-1 py-0.5 bg-yellow-200 rounded text-xs">Delete</kbd> {t('ui.shortcuts.safeDeleteDesc4')}</p>
            <p className="mt-2"><span className="font-medium">{t('ui.shortcuts.multiSelectTip')}</span></p>
            <p>{t('ui.shortcuts.multiSelectDesc')}</p>
            <p className="mt-2"><span className="font-medium">{t('ui.shortcuts.viewTip')}</span></p>
            <p>{t('ui.shortcuts.viewDesc')}</p>
            <p className="mt-2 text-xs text-gray-600">{t('ui.shortcuts.closeTip')}</p>
          </div>
        </div>
      </div>
    </div>
  );
} 