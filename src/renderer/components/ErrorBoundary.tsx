import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Scene error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          background: '#1a1a2e',
          color: 'white',
          padding: '20px',
        }}>
          <h2>3D Scene Error</h2>
          <p style={{ color: '#ff6b6b', marginTop: '10px' }}>
            {this.state.error?.message || 'An error occurred loading the 3D scene'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#4ecdc4',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#1a1a2e',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
