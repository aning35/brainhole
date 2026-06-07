import { t } from 'i18next';
import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2 } from 'lucide-react';

interface FullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function FullscreenModal({ isOpen, onClose, title, children }: FullscreenModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const setupFullscreenView = async () => {
      if (isOpen) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';

        // Hide system window buttons (macOS only)
        if (window.electronAPI && window.electronAPI.platform === 'darwin') {
          await window.electronAPI.hideTrafficLights();
        }
      } else {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';

        // Show system window buttons (macOS only)
        if (window.electronAPI && window.electronAPI.platform === 'darwin') {
          await window.electronAPI.showTrafficLights();
        }
      }
    };

    setupFullscreenView();

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';

      // Ensure window buttons are restored on unmount
      if (window.electronAPI && window.electronAPI.platform === 'darwin') {
        window.electronAPI.showTrafficLights();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50" style={{ height: '52px' }}>
        <div className="flex items-center gap-3 pl-6">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <span className="text-sm text-gray-500">{t('ui.fullscreenView')}</span>
        </div>
        <div className={`flex items-center ${window.electronAPI?.platform === 'win32' ? 'pr-[140px]' : 'pr-6'}`}>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title={t('ui.exitFullscreen')}
          >
            <Minimize2 className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="w-full h-full">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
} 