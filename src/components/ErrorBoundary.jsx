// React error boundary. Catches render-time errors anywhere below it and
// (a) shows a graceful fallback instead of a blank screen, (b) reports the
// error to the log-error edge function via the error reporter.

import React from 'react';
import { reportError } from '../lib/errorReporter';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Algo salió mal' };
  }

  componentDidCatch(error, info) {
    reportError({
      message: error?.message || 'React render error',
      stack: error?.stack,
      componentStack: info?.componentStack,
      severity: 'fatal',
      context: { boundary: 'top-level' },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-bold">Algo salió mal</h1>
          <p className="text-gray-400">
            La pantalla no pudo renderizarse. Ya avisamos al equipo y registramos el problema.
            Probá recargar; si vuelve a pasar, contactá a un pastor.
          </p>
          <details className="text-left text-xs text-gray-500 bg-neutral-900 rounded-lg p-3">
            <summary className="cursor-pointer">Detalle técnico</summary>
            <p className="mt-2 font-mono break-words">{this.state.message}</p>
          </details>
          <button
            onClick={this.handleReload}
            className="px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            Recargar la app
          </button>
        </div>
      </div>
    );
  }
}
