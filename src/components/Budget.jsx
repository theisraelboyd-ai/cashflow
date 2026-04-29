import React, { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, monthLabel, startOfMonth, endOfMonth, addMonths, dayLabel, dateKey } from '../lib/format.js';
import { projectBalances } from '../lib/projection.js';
import { PageHeader, Toggle, Money } from './atoms.jsx';
import { TrajectoryChart } from './TrajectoryChart.jsx';

export function Budget({ data }) {
  const { styles, t, privacy } = useTheme();
  const [horizon, setHorizon] = useState(3);
  const [mode, setMode] = useState('realistic');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = endOfMonth(addMonths(today, horizon - 1));

  const projection = useMemo(() => {
    const opts = mode === 'realistic'
      ? { includeSpeculative: false, likelyWeight: 0.75 }
      : { includeSpeculative: true, likelyWeight: 1.0 };
    return projectBalances(data, today, endDate, opts);
  }, [data, horizon, mode]);

  const { dayPoints, events } = projection;
  const startTotal = dayPoints[0]?.total || 0;
  const endTotal = dayPoints[dayPoints.length - 1]?.total || 0;
  const firstNegative = dayPoints.find((p) => p.total < 0);

  const monthSummary = useMemo(() => {
    const months = [];
    for (let i = 0; i < horizon; i++) {
      const mStart = i === 0 ? today : startOfMonth(addMonths(today, i));
      const mEnd = endOfMonth(addMonths(today, i));
      const monthEvents = events.filter((ev) => ev.date >= mStart && ev.date <= mEnd);
      const income = monthEvents.filter((e) => e.amount > 0 && e.type !== 'transfer-in').reduce((s, e) => s + e.amount, 0);
      const outgoings = monthEvents.filter((e) => e.amount < 0 && e.type !== 'transfer-out').reduce((s, e) => s + Math.abs(e.amount), 0);
      const startPoint = dayPoints.find((p) => dateKey(p.date) === dateKey(mStart)) || dayPoints[0];
      const endPoint = [...dayPoints].reverse().find((p) => p.date <= mEnd) || dayPoints[dayPoints.length - 1];
      months.push({
        label: monthLabel(mStart),
        income,
        outgoings,
        net: income - outgoings,
        startBalance: startPoint?.total || 0,
        endBalance: endPoint?.total || 0,
      });
    }
    return months;
  }, [events, dayPoints, horizon, today]);

  return (
    <div style={styles.page}>
      <PageHeader title="Budget" eyebrow="Cash flow projection" />

      <div style={styles.toggleRow}>
        <Toggle active={mode === 'realistic'} onClick={() => setMode('realistic')}>Realistic</Toggle>
        <Toggle active={mode === 'optimistic'} onClick={() => setMode('optimistic')}>All planned</Toggle>
      </div>

      <div style={styles.toggleRow}>
        {[1, 3, 6, 12].map((n) => (
          <Toggle key={n} active={horizon === n} onClick={() => setHorizon(n)} small>{n}m</Toggle>
        ))}
      </div>

      <div style={styles.heroCard}>
        <div style={styles.heroLabel}>End balance after {horizon}m</div>
        <div style={{ ...styles.heroAmount, color: endTotal >= 0 ? t.text : t.expense }} className={privacy ? 'private-blur' : ''}>
          {fmt(endTotal)}
        </div>
        <div style={styles.heroFoot}>
          <span style={{ opacity: 0.7 }} className={privacy ? 'private-blur' : ''}>From {fmt(startTotal)}</span>
          <span style={{ color: endTotal >= startTotal ? t.income : t.expense, fontWeight: 500 }} className={privacy ? 'private-blur' : ''}>
            {endTotal >= startTotal ? '↑' : '↓'} {fmt(Math.abs(endTotal - startTotal))}
          </span>
        </div>
        {firstNegative && (
          <div style={styles.warningBar}>
            <AlertTriangle size={14} />
            <span>Goes negative on {dayLabel(firstNegative.date)}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <TrajectoryChart dayPoints={dayPoints} events={events} />
      </div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {monthSummary.map((m, i) => (
          <div key={i} style={styles.monthRow}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: t.text }}>{m.label}</div>
              <Money value={m.net} sign={m.net >= 0 ? '+' : '-'} color={m.net >= 0 ? t.income : t.expense} size={18} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.textDim, marginBottom: 6 }}>
              <span className={privacy ? 'private-blur' : ''}>+{fmt(m.income)} in</span>
              <span className={privacy ? 'private-blur' : ''}>−{fmt(m.outgoings)} out</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textFaint, paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
              <span className={privacy ? 'private-blur' : ''}>start {fmt(m.startBalance)}</span>
              <span style={{ color: m.endBalance < 0 ? t.expense : t.textFaint }} className={privacy ? 'private-blur' : ''}>
                end {fmt(m.endBalance)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
