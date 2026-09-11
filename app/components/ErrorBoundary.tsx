'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label shown in the error UI, e.g. "Trình xem nội dung" */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors in children and shows a user-friendly fallback
 * instead of a white screen. Use around heavy/complex components.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '32px',
          background: 'var(--danger-light, #fef2f2)',
          border: '1px solid var(--danger-border, #fecaca)',
          borderRadius: 'var(--radius-lg, 12px)',
          textAlign: 'center',
          margin: '24px 0',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
          <h3 style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}>
            {this.props.label ? `${this.props.label} gặp lỗi` : 'Đã xảy ra lỗi'}
          </h3>
          <p style={{
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            marginBottom: '16px',
            lineHeight: 1.5,
          }}>
            {this.state.error?.message || 'Lỗi không xác định. Vui lòng thử lại.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="btn"
            style={{ padding: '8px 24px' }}
          >
            🔄 Thử lại
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
