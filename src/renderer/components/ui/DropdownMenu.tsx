import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  divider?: boolean;
  disabled?: boolean;
}

interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

export function DropdownMenu({ trigger, items, placement = 'bottom-right' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      
      let x = rect.left;
      let y = rect.bottom + 4;
      
      // Adjust position based on placement
      switch (placement) {
        case 'bottom-right':
          x = rect.right - 160; // Menu width estimation
          break;
        case 'bottom-left':
          x = rect.left;
          break;
        case 'top-right':
          x = rect.right - 160;
          y = rect.top - 4;
          break;
        case 'top-left':
          x = rect.left;
          y = rect.top - 4;
          break;
      }
      
      setPosition({ x, y });
    }
    
    setIsOpen(!isOpen);
  };

  const handleItemClick = (item: DropdownMenuItem) => {
    if (!item.disabled) {
      item.onClick();
      setIsOpen(false);
    }
  };

  return (
    <>
      <div ref={triggerRef} onClick={handleTriggerClick}>
        {trigger}
      </div>
      
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] bg-white rounded-lg shadow-lg border border-gray-200 py-1"
          style={{
            left: position.x,
            top: position.y,
            transform: placement.includes('top') ? 'translateY(-100%)' : 'none',
          }}
        >
          {items.map((item, index) => (
            item.divider ? (
              <div key={index} className="border-t border-gray-100 my-1" />
            ) : (
              <button
                key={index}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                className={`
                  w-full text-left px-3 py-2 text-sm flex items-center gap-2
                  transition-colors
                  ${item.disabled 
                    ? 'text-gray-400 cursor-not-allowed' 
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }
                `}
              >
                {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            )
          ))}
        </div>,
        document.body
      )}
    </>
  );
} 