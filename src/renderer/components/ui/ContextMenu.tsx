import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ContextMenuItem {
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuContextType {
  showMenu: (position: ContextMenuPosition, items: ContextMenuItem[]) => void;
  hideMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<ContextMenuPosition>({ x: 0, y: 0 });
  const [items, setItems] = useState<ContextMenuItem[]>([]);

  const showMenu = useCallback((pos: ContextMenuPosition, menuItems: ContextMenuItem[]) => {
    setPosition(pos);
    setItems(menuItems);
    setIsVisible(true);
  }, []);

  const hideMenu = useCallback(() => {
    setIsVisible(false);
  }, []);

  // Hide menu when clicking outside
  const handleBackdropClick = useCallback(() => {
    hideMenu();
  }, [hideMenu]);

  return (
    <ContextMenuContext.Provider value={{ showMenu, hideMenu }}>
      {children}
      
      {/* Menu overlay */}
      <AnimatePresence>
        {isVisible && (
          <div
            className="fixed inset-0 z-50"
            onClick={handleBackdropClick}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="absolute bg-white rounded-lg shadow-lg border py-1 min-w-[160px]"
              style={{
                left: Math.min(position.x, window.innerWidth - 200),
                top: Math.min(position.y, window.innerHeight - items.length * 35 - 20),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item, index) => (
                <div key={index}>
                  {item.divider ? (
                    <div className="my-1 h-px bg-gray-200" />
                  ) : (
                    <button
                      onClick={() => {
                        if (!item.disabled && item.onClick) {
                          item.onClick();
                          hideMenu();
                        }
                      }}
                      disabled={item.disabled}
                      className={`
                        w-full text-left px-3 py-1.5 text-sm flex items-center gap-2
                        transition-colors
                        ${item.disabled 
                          ? 'text-gray-400 cursor-not-allowed' 
                          : 'text-gray-700 hover:bg-gray-100'
                        }
                      `}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  )}
                </div>
              ))}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return context;
} 