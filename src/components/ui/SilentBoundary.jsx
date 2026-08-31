import React from 'react';

// Error boundary "silencioso": si un hijo lanza durante el render, renderiza NADA
// (null) en vez de dejar propagar el error al ErrorBoundary RAÍZ, que tiraría toda
// la app. Se usa para bloques OPCIONALES cuya ausencia es aceptable (p.ej. el
// banner de preparación del Dashboard). NO usar para contenido que deba estar
// siempre presente.
export class SilentBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Solo log local: es un bloque prescindible, no un fallo fatal de la app.
    console.error('SilentBoundary:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
