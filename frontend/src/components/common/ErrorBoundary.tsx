import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-navy flex items-center justify-center p-8">
          <div className="bg-surface border border-danger/30 rounded-lg p-8 max-w-md w-full text-center">
            <div className="w-12 h-12 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-text font-semibold text-lg mb-2">Something went wrong</h2>
            <p className="text-muted text-sm font-mono mb-6">{this.state.error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: '' })}
                className="px-4 py-2 bg-cyan/10 border border-cyan/30 text-cyan text-sm rounded hover:bg-cyan/20 transition font-mono"
              >
                Retry
              </button>
              <button
                onClick={() => { window.location.href = '/login'; }}
                className="px-4 py-2 bg-surface border border-border text-muted text-sm rounded hover:text-text transition font-mono"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
