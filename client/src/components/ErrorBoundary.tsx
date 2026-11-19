import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CinePulse ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[260px] w-full rounded-2xl bg-[#141821] border border-white/10 p-6 flex flex-col items-center justify-center text-center gap-3 my-4">
          <div className="w-11 h-11 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#F8FAFC]">
              {this.props.fallbackTitle || 'Something went wrong in this view'}
            </h3>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-md">
              {this.state.errorMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="min-h-[44px] px-5 rounded-full bg-[#00E5FF] text-[#071018] text-xs font-extrabold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
