import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, BatteryLow, Bed, Brain, CircleAlert, CircleCheck, Clock, Droplets, Flame, Frown, Gauge, Heart,
  Moon, PhoneCall, Scissors, Sparkles, Thermometer, TriangleAlert, Waves, Wind, X, Zap, type LucideIcon,
} from 'lucide-react';
import type { SymptomCode } from '../../types/entry.ts';
import type { SafetyResult } from '../../types/safety.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';

export const SYMPTOM_ICON: Record<SymptomCode | 'custom', LucideIcon> = {
  period_pain: Zap, pelvic_pain_between: Zap, pain_during_sex: Heart, painful_bowel: Waves, painful_urination: Droplets,
  fatigue: BatteryLow, dizziness: Gauge, breathless_exertion: Wind, headache: Brain, low_mood: Frown, poor_sleep: Moon,
  hair_fall: Scissors, hot_flush: Flame, night_sweats: Thermometer, custom: Sparkles,
};
export { Activity, Bed, Clock };

export function Logo({ size = 28, text = true }: { size?: number; text?: boolean }) {
  return (
    <span className="wordmark">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="12" cy="16" r="9" fill="var(--pink-500)" stroke="var(--pink-700)" strokeWidth="1.5" />
        <circle cx="20" cy="16" r="9" fill="var(--blue-500)" fillOpacity=".75" stroke="var(--blue-700)" strokeWidth="1.5" />
      </svg>
      {text && <span className="wordmark-text">Sakhi</span>}
    </span>
  );
}

/** Moves focus to an element on the page without changing the address. */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

export function SkipLink() {
  return <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); jumpTo('main'); }}>Skip to main content</a>;
}

export function Overlay({ open, onClose, children, label, variant = 'drawer', wide = false }: {
  open: boolean; onClose: () => void; children: ReactNode; label: string; variant?: 'drawer' | 'dialog' | 'bottom'; wide?: boolean;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  if (!open) return null;
  const cls = variant === 'dialog' ? 'overlay dialog-center' : variant === 'bottom' ? 'overlay sheet-bottom' : 'overlay';
  return (
    <div className={cls} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} className={variant === 'dialog' ? 'dialog' : `drawer${wide ? ' wide' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return <button type="button" className="icon-btn" onClick={onClick} aria-label={label}><X size={20} aria-hidden="true" /></button>;
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, danger = false, confirmDisabled = false }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; confirmDisabled?: boolean;
}) {
  return (
    <Overlay open={open} onClose={onCancel} label={title} variant="dialog">
      <h2>{title}</h2>
      <div className="stack">{body}</div>
      <div className="row" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-quiet" onClick={onCancel} data-autofocus>Cancel</button>
        <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</button>
      </div>
    </Overlay>
  );
}

export function StatusTag({ ready, notApplicable }: { ready: boolean; notApplicable?: boolean }) {
  if (ready) return <span className="status status-ready"><CircleCheck size={16} aria-hidden="true" /> Ready</span>;
  return <span className="status status-wait"><Clock size={16} aria-hidden="true" /> {notApplicable ? 'Does not apply' : 'Not enough data'}</span>;
}

export function SafetyCard({ result, onDismiss }: { result: SafetyResult; onDismiss?: () => void }) {
  const loud = result.tense === 'current' && result.level !== 'none';
  if (!loud) {
    return (
      <div className="banner banner-quiet" role="status">
        <CircleAlert size={20} aria-hidden="true" />
        <div>
          <strong>{result.title}</strong>
          <p style={{ margin: '4px 0' }}>{result.body}</p>
          <Link to="/help">Urgent help numbers</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="banner banner-alert" role="alert">
      <TriangleAlert size={28} color="var(--alert-700)" aria-hidden="true" />
      <div style={{ flex: 1 }}>
        <h2 style={{ marginBottom: 6 }}>{result.title}</h2>
        <p>{result.body}</p>
        <div className="row">
          {result.level !== 'prompt_advice' && (
            <a className="btn btn-danger" href="tel:112"><PhoneCall size={18} aria-hidden="true" /> Call 112</a>
          )}
          <Link className="btn btn-secondary" to="/help">Urgent help</Link>
          {onDismiss && <button type="button" className="btn-link" onClick={onDismiss}>Hide this message</button>}
        </div>
      </div>
    </div>
  );
}

export function EmptyMotif({ kind = 'journal' }: { kind?: 'journal' | 'patterns' | 'care' }) {
  return (
    <svg width="160" height="64" viewBox="0 0 160 64" aria-hidden="true" style={{ display: 'block', marginBottom: 12 }}>
      <path d="M10 44 C 50 10, 90 60, 150 24" fill="none" stroke="var(--blue-700)" strokeWidth="2" strokeDasharray={kind === 'patterns' ? '0' : '4 6'} />
      {[18, 46, 74, 102, 130].map((x, i) => (
        <circle key={x} cx={x} cy={[40, 26, 36, 38, 28][i]} r={i === 2 ? 0 : 6} fill={i % 2 ? 'var(--pink-500)' : 'var(--white)'} stroke={i % 2 ? 'var(--pink-700)' : 'var(--blue-700)'} strokeWidth="2" />
      ))}
      {kind === 'care' && <rect x="66" y="22" width="18" height="22" rx="3" fill="var(--white)" stroke="var(--pink-700)" strokeWidth="2" />}
    </svg>
  );
}

export function FieldError({ id, msg }: { id: string; msg?: string | null }) {
  if (!msg) return null;
  return <p id={id} className="error"><CircleAlert size={16} aria-hidden="true" style={{ marginTop: 2, flex: 'none' }} /> {msg}</p>;
}

export function PageHeader({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="section" style={{ marginBottom: 24 }}>
      <div className="row-between">
        <h1 style={{ margin: 0 }}>{title}</h1>
        {children}
      </div>
      {intro && <p className="muted" style={{ marginTop: 8 }}>{intro}</p>}
    </div>
  );
}
