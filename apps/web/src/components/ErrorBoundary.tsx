import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: a render crash shows a message and a way out instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Gravity crashed while rendering', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="login" role="alert">
        <div className="card login-card">
          <h1>Something went wrong</h1>
          <p className="muted">The page hit an unexpected error. Reloading usually fixes it.</p>
          <p className="muted crash-detail">{this.state.error.message}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              try {
                localStorage.clear();
              } catch {
                /* ignore */
              }
              window.location.assign('/');
            }}
          >
            Reset and go home
          </button>
        </div>
      </main>
    );
  }
}
