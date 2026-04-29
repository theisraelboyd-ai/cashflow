import React from 'react';
import { Plus } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt } from '../lib/format.js';

// Privacy-aware money display - blurs when privacy mode on
export function Money({ value, sign, color, size, weight, style }) {
  const { privacy } = useTheme();
  const formatted = fmt(Math.abs(Number(value) || 0));
  const display = sign === '+' ? '+' + formatted : sign === '-' ? '−' + formatted : formatted;

  const baseStyle = {
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: weight ?? 500,
    color,
    ...(size ? { fontSize: size } : {}),
    ...style,
  };

  return (
    <span style={baseStyle} className={privacy ? 'private-blur' : ''}>
      {display}
    </span>
  );
}

export function PageHeader({ title, eyebrow, action, right }) {
  const { styles } = useTheme();
  return (
    <div style={styles.header}>
      <div>
        <div style={styles.headerEyebrow}>{eyebrow}</div>
        <h1 style={styles.headerTitle}>{title}</h1>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {right}
        {action}
      </div>
    </div>
  );
}

export function ModalHeader({ title, sub }) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 18 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 26,
          fontWeight: 500,
          margin: 0,
          color: t.text,
        }}
      >
        {title}
      </h2>
      {sub && (
        <div style={{ fontSize: 12, color: t.textDim, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 14, flex: 1 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          color: t.textDim,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function Seg({ active, onClick, children }) {
  const { t } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 8px',
        border: 'none',
        background: active ? t.accent : 'transparent',
        color: active ? t.bg : t.textDim,
        borderRadius: 8,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

export function Toggle({ active, onClick, children, small }) {
  const { t } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? '8px 14px' : '10px 18px',
        border: '1px solid ' + (active ? t.accent : t.border),
        background: active ? t.accentSoft : 'transparent',
        color: active ? t.accent : t.textDim,
        borderRadius: 999,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
        cursor: 'pointer',
        fontWeight: 500,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

export function SummaryCell({ label, value, accent }) {
  const { styles, t, privacy } = useTheme();
  return (
    <div style={styles.summaryCell}>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          color: t.textDim,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 22,
          fontWeight: 500,
          color: accent || t.text,
        }}
        className={privacy ? 'private-blur' : ''}
      >
        {value}
      </div>
    </div>
  );
}

export function Empty({ msg, small }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        padding: small ? 16 : 32,
        textAlign: 'center',
        color: t.textFaint,
        fontSize: 13,
        fontStyle: 'italic',
        background: t.bgElev,
        borderRadius: 12,
        border: `1px dashed ${t.border}`,
      }}
    >
      {msg}
    </div>
  );
}

export function AddButton({ onClick }) {
  const { styles } = useTheme();
  return (
    <button style={styles.iconBtnLg} onClick={onClick}>
      <Plus size={18} />
    </button>
  );
}
