import { useToastStore } from '@/stores/toastStore';

export function useToast() {
  const addToast = useToastStore(state => state.addToast);
  
  return {
    showToast: addToast,
    toast: {
      success: (message: string) => addToast(message, 'success'),
      error: (message: string) => addToast(message, 'error'),
      warning: (message: string) => addToast(message, 'warning'),
      info: (message: string) => addToast(message, 'info'),
    },
  };
} 