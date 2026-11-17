import React from 'react';

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
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Uncaught application error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#05080f] p-6 text-slate-100">
          <div className="max-w-md rounded-2xl bg-[#0d1320] border border-white/10 p-6 text-center shadow-2xl">
            <h2 className="font-display text-lg font-semibold text-white">
              Something went wrong
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              Reload Tampi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
