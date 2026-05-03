import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { installGlobalErrorReporter } from './lib/errorReporter.js';
import { registerSW } from './lib/registerSW.js';
import { initInstallPrompt } from './lib/installPrompt.js';
import './index.css';

// Capture uncaught exceptions and unhandled promise rejections from the
// whole document and ship them to the log-error edge function.
installGlobalErrorReporter();
registerSW();
// Listen for `beforeinstallprompt` ASAP — Chrome can fire it before React mounts.
initInstallPrompt();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
