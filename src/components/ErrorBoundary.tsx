import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readableMessage =
      'Se ha producido un error inesperado al cargar los datos. Puedes recargar la página para continuar.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string };
      if (parsed?.error) {
        readableMessage = parsed.error;
      }
    } catch {
      if (error.message) {
        readableMessage = error.message;
      }
    }
    return { hasError: true, message: readableMessage };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E2E5EB] rounded-xl p-8 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-[#B91C1C] mx-auto" />
            <h1 className="font-display text-2xl font-semibold text-[#111827]">
              Ha ocurrido un problema
            </h1>
            <p className="text-xs text-[#404854] leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
