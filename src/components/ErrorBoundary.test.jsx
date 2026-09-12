import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/errorReporter', () => ({ reportError: vi.fn() }));
vi.mock('../lib/updateProgress', () => ({ markUpdateStep: vi.fn() }));

import { reportError } from '../lib/errorReporter';
import { ErrorBoundary, COPY } from './ErrorBoundary';
import { _resetReloadPendingForTests, recoverFromStaleChunk } from '../lib/chunkRecovery';

const Boom = ({ message }) => { throw new Error(message); };

describe('ErrorBoundary', () => {
  let reloadSpy; let errSpy; let origLocation;
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    _resetReloadPendingForTests();
    // jsdom no permite spyOn(location.reload): se reemplaza window.location por un doble.
    origLocation = window.location;
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...origLocation, reload: reloadSpy } });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // React loguea el throw
  });
  afterEach(() => { Object.defineProperty(window, 'location', { configurable: true, value: origLocation }); errSpy.mockRestore(); });

  it('chunk viejo (Safari) → recarga sola una vez y muestra "Hay una versión nueva"', () => {
    render(<ErrorBoundary><Boom message="Importing a module script failed." /></ErrorBoundary>);
    expect(screen.getByTestId('error-boundary').dataset.kind).toBe('stale');
    expect(screen.getByText(COPY.stale.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.stale.button })).toBeTruthy();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ context: { boundary: 'top-level', kind: 'stale-chunk' } }));
  });

  it('chunk viejo que YA se reintentó → NO recarga otra vez (anti-loop), queda el botón', () => {
    sessionStorage.setItem('adorapp:chunk-retry', String(Date.now()));
    render(<ErrorBoundary><Boom message="Failed to fetch dynamically imported module: /assets/Bandas-x.js" /></ErrorBoundary>);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.stale.title)).toBeTruthy();
  });

  it('error genérico → copy amable (versión nueva probable), sin recarga automática', () => {
    render(<ErrorBoundary><Boom message="Cannot read properties of undefined" /></ErrorBoundary>);
    expect(screen.getByTestId('error-boundary').dataset.kind).toBe('generic');
    expect(screen.getByText(COPY.generic.title)).toBeTruthy();
    expect(screen.getByText(/Pastor del área/)).toBeTruthy();
    expect(screen.queryByText(/Algo salió mal/)).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ context: { boundary: 'top-level', kind: 'render' } }));
  });

  it('el botón recarga UNA vez y deja puesta la marca anti-loop (la recarga manual es el reintento)', () => {
    render(<ErrorBoundary><Boom message="boom" /></ErrorBoundary>);
    expect(sessionStorage.getItem('adorapp:chunk-retry')).toBeNull();
    screen.getByRole('button', { name: COPY.generic.button }).click();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem('adorapp:chunk-retry'))).toBeGreaterThan(0);
  });

  it('con una recarga ya en curso NO reporta el error colateral a error_log', () => {
    recoverFromStaleChunk({ reload: () => {}, now: Date.now() });
    render(<ErrorBoundary><Boom message="Cannot read properties of undefined (reading 'Bandas')" /></ErrorBoundary>);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('sin error renderiza los hijos', () => {
    render(<ErrorBoundary><p>todo bien</p></ErrorBoundary>);
    expect(screen.getByText('todo bien')).toBeTruthy();
  });
});
