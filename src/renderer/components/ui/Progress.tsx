import React from 'react';
import { cn } from '../../utils/cn';

interface ProgressProps {
  value?: number;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value = 0, className }) => {
  return (
    <div className={cn('relative h-4 w-full overflow-hidden rounded-full bg-gray-100', className)}>
      <div 
        className="h-full w-full flex-1 bg-blue-600 transition-all duration-300 ease-in-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  );
}; 