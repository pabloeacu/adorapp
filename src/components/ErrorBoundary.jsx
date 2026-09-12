// React error boundary. Catches render-time errors anywhere below it and
// (a) shows a graceful fallback instead of a blank screen, (b) reports the
// error to the log-error edge function via the error reporter.
//
// Copy (pedido de Paul, 2026-09-12): nada trágico. La causa más común de llegar acá es
// que el Pastor del área acaba de publicar una versión nueva y el teléfono todavía
// tenía la anterior abierta (chunk viejo → "Importing a module script failed"). Ese
// caso lo recupera solo src/lib/chunkRecovery.js (recarga única); si aun así llega
// acá, se explica como "hay una versión nueva" con el botón "Actualizar la app".

import React from 'react';
import { reportError } from '../lib/errorReporter';
import { isChunkLoadError, recoverFromStaleChunk, markRetryNow, isReloadPending } from '../lib/chunkRecovery';
import { markUpdateStep } from '../lib/updateProgress';

export const COPY = {
  stale: {
    title: '¡Hay una versión nueva!',
    body: 'El Pastor del área acaba de publicar cambios en AdorAPP y tu teléfono todavía tenía la versión anterior abierta. Tocá «Actualizar la app» para traer la nueva. Si vuelve a pasar, escribile a un pastor para que lo resolvamos a la brevedad.',
    button: 'Actualizar la app',
  },
  generic: {
    title: 'Necesitamos recargar la app',
    body: 'Es probable que haya una versión nueva con cambios que acaba de incorporar el Pastor del área. Recargá la app; si vuelve a fallar, contactate con un pastor para que podamos resolverlo a la brevedad.',
    button: 'Recargar la app',
  },
};

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '', stale: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Error', stale: isChunkLoadError(error) };
  }

  componentDidCatch(error, info) {
    const stale = isChunkLoadError(error);
    // Si ya está disparada la recarga por versión nueva, este error es efecto colateral
    // de esos milisegundos: no se reporta (evita filas falsas en error_log).
    if (isReloadPending()) return;
    reportError({
      message: error?.message || 'React render error',
      stack: error?.stack,
      componentStack: info?.componentStack,
      severity: 'fatal',
      context: { boundary: 'top-level', kind: stale ? 'stale-chunk' : 'render' },
    });
    // Chunk viejo tras una publicación: recarga sola una vez (si no se recargó hace poco).
    // Si ya se intentó, queda la pantalla con "Actualizar la app".
    if (stale) recoverFromStaleChunk();
  }

  handleReload = () => {
    // Recarga manual: cuenta como el único reintento (marca anti-loop puesta, así si la
    // versión nueva sigue rota volvemos a esta pantalla sin recargar dos veces) y avisa
    // que viene la versión nueva para que la pantalla de carga lo cuente.
    markRetryNow();
    try { markUpdateStep('reloading'); } catch { /* noop */ }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const copy = this.state.stale ? COPY.stale : COPY.generic;

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6" data-testid="error-boundary" data-kind={this.state.stale ? 'stale' : 'generic'}>
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-gold-500/15 border border-gold-500/30 flex items-center justify-center shadow-[0_0_28px_-6px_rgba(212,175,55,0.55)]">
            <span className="text-4xl" aria-hidden="true">✨</span>
          </div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-gray-300">{copy.body}</p>
          <details className="text-left text-xs text-gray-500 bg-neutral-900 rounded-lg p-3">
            <summary className="cursor-pointer">Detalle técnico</summary>
            <p className="mt-2 font-mono break-words">{this.state.message}</p>
          </details>
          <button
            onClick={this.handleReload}
            className="px-6 py-3 bg-gold-gradient text-black font-semibold rounded-xl hover:brightness-110 transition-colors focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          >
            {copy.button}
          </button>
        </div>
      </div>
    );
  }
}
