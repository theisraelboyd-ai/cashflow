import React, { useState, useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, monthLabel, monthLongLabel, startOfMonth, endOfMonth, addMonths, dayLabel, dateKey } from '../lib/format.js';
import { projectBalances, generateEvents } from '../lib/projection.js';
import { applyViewFilter } from '../lib/viewFilter.js';
import { PageHeader, Toggle, Money, ViewingAsSwitch } from './atoms.jsx';
import { TrajectoryChart } from './TrajectoryChart.jsx';

export function Budget({ data, setModal }) {
  const { styles, t, privacy, viewingAs } = useTheme();
  const [horizon, setHorizon] = useState(3);
  const [mode, setMode] = useState('realistic');
  // monthOffset: 0 = current month, +1 = next month, -1 = previous, etc.
  const [monthOffset, setMonthOffset] = useState(0);

  const viewData = useMemo(() => applyViewFilter(data, viewingAs), [data, viewingAs]);

  const onTapEvent = (ev) => {
    if (!setModal) return;
    if (ev.type === 'bill' && ev.billId) {
      const bill = data.bills.find((b) => b.id === ev.billId);
      if (bill) setModal({ type: 'bill', payload: bill });
    } else if (ev.type === 'job' && ev.jobId) {
      const job = data.jobs.find((j) => j.id === ev.jobId);
      if (job) setModal({ type: 'job', payload: job });
    } else if (ev.type === 'salary' && ev.salaryId) {
      const sal = (data.salaries || []).find((s) => s.id === ev.salaryId);
      if (sal) setModal({ type: 'salary', payload: sal });
    } else if (ev.type === 'extincome' && ev.extincomeId) {
      const item = data.externalIncome.find((e) => e.id === ev.extincomeId);
      if (item) setModal({ type: 'extincome', payload: item });
    } else if ((ev.type === 'transfer-out' || ev.type === 'transfer-in') && ev.transferId) {
      const tr = data.transfers.find((tr) => tr.id === ev.transferId);
      if (tr) setModal({ type: 'transfer', payload: tr });
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Projection start = beginning of (current month + offset)
  const projStart = startOfMonth(addMonths(today, monthOffset));
  const endDate = endOfMonth(addMonths(projStart, horizon - 1));

  const projection = useMemo(() => {
    const opts = mode === 'realistic'
      ? { includeSpeculative: false, likelyWeight: 0.75 }
      : { includeSpeculative: true, likelyWeight: 1.0 };

    // Compute the balance at projStart by reverse-applying events between today and projStart.
    // If projStart is in the past: subtract events that have happened since projStart.
    // If projStart is in the future: add events that will happen between now and projStart.
    const adjustedAccounts = viewData.accounts.map((a) => {
      let bal = Number(a.balance);
      if (projStart < today) {
        // Reverse events that occurred from projStart up to today
        const past = generateEvents(viewData, projStart, today, opts);
        past.forEach((ev) => {
          if (ev.accountId === a.id && ev.date <= today) bal -= ev.amount;
        });
      } else if (projStart > today) {
        // Apply events that will occur between today and projStart
        const future = generateEvents(viewData, today, projStart, opts);
        future.forEach((ev) => {
          if (ev.accountId === a.id && ev.date < projStart) bal += ev.amount;
        });
      }
      return { ...a, balance: bal };
    });

    return projectBalances({ ...viewData, accounts: adjustedAccounts }, projStart, endDate, opts);
  }, [viewData, horizon, mode, monthOffset]);

  const { dayPoints, events } = projection;
  const startTotal = dayPoints[0]?.total || 0;
  const endTotal = dayPoints[dayPoints.length - 1]?.total || 0;
  const firstNegative = dayPoints.find((p) => p.total < 0);

  const monthSummary = useMemo(() => {
    const months = [];
    for (let i = 0; i < horizon; i++) {
      const mStart = startOfMonth(addMonths(projStart, i));
      const mEnd = endOfMonth(addMonths(projStart, i));
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
  }, [events, dayPoints, horizon, projStart]);

  // Window label for the title - "April 2026" or "Apr–Jun 2026"
  const windowLabel = useMemo(() => {
    const startLbl = monthLongLabel(projStart);
    if (horizon === 1) return startLbl;
    const endLbl = monthLongLabel(endOfMonth(addMonths(projStart, horizon - 1)));
    return `${monthLabel(projStart)}–${monthLabel(endOfMonth(addMonths(projStart, horizon - 1)))}`;
  }, [projStart, horizon]);

  return (
    <div style={styles.page}>
      <PageHeader title="Budget" eyebrow="Cash flow projection" right={<ViewingAsSwitch earners={data.earners} />} />

      <div style={styles.toggleRow}>
        <Toggle active={mode === 'realistic'} onClick={() => setMode('realistic')}>Realistic</Toggle>
        <Toggle active={mode === 'optimistic'} onClick={() => setMode('optimistic')}>All planned</Toggle>
      </div>

      <div style={styles.toggleRow}>
        {[1, 3, 6, 12].map((n) => (
          <Toggle key={n} active={horizon === n} onClick={() => setHorizon(n)} small>{n}m</Toggle>
        ))}
      </div>

      {/* Month stepper - shows window and lets you step backwards/forwards */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          padding: '8px 12px',
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
        }}
      >
        <button onClick={() => setMonthOffset(monthOffset - 1)} style={styles.iconBtn}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{windowLabel}</div>
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              style={{
                fontSize: 10,
                color: t.accent,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                marginTop: 2,
                padding: 0,
                fontWeight: 600,
              }}
            >
              jump to today
            </button>
          )}
        </div>
        <button onClick={() => setMonthOffset(monthOffset + 1)} style={styles.iconBtn}>
          <ChevronRight size={16} />
        </button>
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
        <TrajectoryChart dayPoints={dayPoints} events={events} onTapEvent={onTapEvent} />
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
