import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter';

// Polyfill for Promise.withResolvers (required by react-pdf v9 on Electron v25)
if (typeof (Promise as any).withResolvers === 'undefined') {
  (window as any).Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill for URL.parse (added in Chrome 126, required by react-pdf v9 on Electron v25)
if (typeof URL.parse === 'undefined') {
  URL.parse = function(url: string, base?: string | URL) {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}
import './i18n';
import App from './App';
import './styles/globals.css';
import { ContextMenuProvider } from './components/ui/ContextMenu';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ContextMenuProvider>
        <App />
      </ContextMenuProvider>
    </React.StrictMode>
  );
} 