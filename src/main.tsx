import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { I18nProvider } from './lib/i18n';
import 'leaflet/dist/leaflet.css';
import './index.css';

// Tier 1 Google Maps Platform Demo Key Quota Defense
(window as unknown as Record<string, unknown>).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RootErrorBoundary uncaught crash]:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.removeItem('ejar_custom_apartment_edits');
    } catch {}
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800"
        >
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center mx-auto text-rose-600 text-2xl font-bold">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              حدث خطأ أثناء تحميل الواجهة
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              واجه المتصفح مشكلة مؤقتة في قراءة بعض البيانات. يمكنك استعادة الصفحة فوراً بالضغط على الزر أدناه:
            </p>
            {this.state.error?.message && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 break-all text-start" dir="ltr">
                {this.state.error.message}
              </div>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              إعادة تحميل الصفحة الآن (Reload)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <I18nProvider>
      <App />
    </I18nProvider>
  </RootErrorBoundary>
);
