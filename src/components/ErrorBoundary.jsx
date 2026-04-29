import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console so we can debug from devtools
    console.error('Caught error:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            margin: 20,
            background: '#fbf8f1',
            border: '1px solid #cbc4b3',
            borderRadius: 12,
            color: '#1f2530',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, marginBottom: 12, color: '#a04848' }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 14, marginBottom: 16, color: '#52596a', lineHeight: 1.5 }}>
            The app hit an error rendering this view. Your data is safe — this is just a display problem.
          </div>
          <details style={{ fontSize: 12, marginBottom: 16, color: '#52596a' }}>
            <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Error details</summary>
            <pre style={{ background: '#ede8df', padding: 12, borderRadius: 6, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {String(this.state.error?.message || this.state.error)}
              {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
            </pre>
          </details>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={this.reset}
              style={{
                padding: '12px 16px',
                background: '#4d7a5a',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 16px',
                background: 'transparent',
                color: '#52596a',
                border: '1px solid #cbc4b3',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: 0.5,
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
