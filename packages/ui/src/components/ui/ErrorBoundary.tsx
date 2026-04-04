import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex-1 flex items-center justify-center bg-zinc-950 p-8">
          <div className="max-w-lg text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-red-400 text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-zinc-400 text-sm mb-4">
              An error occurred while rendering the flow editor.
            </p>
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-left mb-4">
              <p className="text-red-300 text-xs font-mono break-all">
                {this.state.error?.message ?? 'Unknown error'}
              </p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-zinc-500 text-[10px] font-mono mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
