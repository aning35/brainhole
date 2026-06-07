interface ElectronAPI {
  // Application info
  getVersion: () => Promise<string>;
  
  // Menu event listeners
  onMenuAction: (callback: (action: string) => void) => void;
  
  // File operations
  showSaveDialog: (options: any) => Promise<any>;
  showOpenDialog: (options: any) => Promise<any>;
  
  // Platform info
  platform: string;
  
  // Window controls
  setFullscreen: (fullscreen: boolean) => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  hideTrafficLights: () => Promise<boolean>;
  showTrafficLights: () => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
} 