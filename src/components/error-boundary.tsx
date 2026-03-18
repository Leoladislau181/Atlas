import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/button';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg max-w-md w-full text-center border border-red-100 dark:border-red-900">
            <div className="text-red-500 mb-4 text-4xl">💥</div>
            <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Ops! Algo deu errado.</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm overflow-auto max-h-32 bg-gray-50 dark:bg-gray-800 p-3 rounded text-left">
              {this.state.error?.message || 'Erro desconhecido ao renderizar a interface.'}
            </p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Recarregar Página
            </Button>
          </div>
        </div>
      );
    }

    return (this.props as any).children;
  }
}
