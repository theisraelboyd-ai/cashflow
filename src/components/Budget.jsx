import React, { useState, useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff, Home } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, monthLabel, monthLongLabel, startOfMonth, endOfMonth, addMonths, dayLabel, dateKey } from '../lib/format.js';
import { projectBalances, generateEvents } from '../lib/projection.js';
import { applyViewFilter } from '../lib/viewFilter.js';
import { PageHeader, Toggle, Money, ViewingAsSwitch } from './atoms.jsx';
import { TrajectoryChart } from './TrajectoryChart.jsx';

export function Budget({ data, setModal }) {
  const { styles, t, privacy, viewingAs, togglePrivacy } = useTheme();
  const [horizon, setHorizon] = useState(3);
  const [mode, setMode] = useState('realistic');
  // monthOffset: 0 = current month, +1 = next month, -1 = previous, etc.
  const [monthOffset, setMonthOffset] = useState(0);
  // budgetView: 'personal' (Personal + Savings, excludes Joint) or 'joint' (only Joint)
  const [budgetView, setBudgetView] = useState('personal');

  const viewData = useMemo(() => applyViewFilter(data, viewingAs), [data, viewingAs]);

  // Filter accounts based on budget view: 'personal' excludes household accounts,
  // 'joint' shows only household accounts.
  const budgetData = useMemo(() => {
    if (budgetView === 'joint') {
      const householdAccounts = (viewData.accounts || []).filter(
        (a) => a.ownerId === 'household' || !a.ownerId
      );
      const householdIds = new Set(householdAccounts.map((a) => a.id));
      return {
        ...viewData,
        accounts: householdAccounts,
        bills: (viewData.bills || []).filter((b) => householdIds.has(b.accountId)),
        externalIncome: (viewData.externalIncome || []).filter((e) => householdIds.has(e.accountId)),
        // Transfers where Joint is involved (in or out) — show but their effect on
        // non-household accounts is implicit
        transfers: (viewData.transfers || []).filter(
          (tr) => householdIds.has(tr.fromAccountId) || householdIds.has(tr.toAccountId)
        ),
        // Jobs/salaries don't directly affect Joint unless they pay there
        jobs: [],
        salaries: [],
      };
    }
    // 'personal' view: exclude household accounts
    const personalAccounts = (viewData.accounts || []).filter(
      (a) => a.ownerId !== 'household' && a.ownerId
    );
    const personalIds = new Set(personalAccounts.map((a) => a.id));
    return {
      ...viewData,
      accounts: personalAccounts,
      bills: (viewData.bills || []).filter((b) => personalIds.has(b.accountId)),
      externalIncome: (viewData.externalIncome || []).filter((e) => personalIds.has(e.accountId)),
      transfers: (viewData.transfers || []).filter(
        (tr) => personalIds.has(tr.fromAccountId) || personalIds.has(tr.toAccountId)
      ),
    };
  }, [viewData, budgetView]);

  // Show Personal/Joint toggle only if there's both kinds of account in the data.
  const hasMixedAccounts = useMemo(() => {
    const hasHousehold = (viewData.accounts || []).some((a) => a.ownerId === 'household' || !a.ownerId);
    const hasPersonal = (viewData.accounts || []).some((a) => a.ownerId && a.ownerId !== 'household');
    return hasHousehold && hasPersonal;
  }, [viewData.accounts]);

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

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Memoise projStart and endDate so they don't get re-instantiated on every render
  const projStart = useMemo(
    () => startOfMonth(addMonths(today, monthOffset)),
    [today, monthOffset]
  );
  const endDate = useMemo(
    () => endOfMonth(addMonths(projStart, horizon - 1)),
    [projStart, horizon]
  );

  const projection = useMemo(() => {
    try {
      const opts = mode === 'realistic'
        ? { includeSpeculative: false, likelyWeight: 0.75 }
        : { includeSpeculative: true, likelyWeight: 1.0 };

      // Compute the balance at projStart by reverse-applying events between today and projStart.
      const adjustedAccounts = (budgetData.accounts || []).map((a) => {
        let bal = Number(a.balance) || 0;
        try {
          if (projStart < today) {
            const past = generateEvents(budgetData, projStart, today, opts) || [];
            past.forEach((ev) => {
              if (ev && ev.accountId === a.id && ev.date && ev.date <= today) {
                bal -= Number(ev.amount) || 0;
              }
            });
          } else if (projStart > today) {
            const future = generateEvents(budgetData, today, projStart, opts) || [];
            future.forEach((ev) => {
              if (ev && ev.accountId === a.id && ev.date && ev.date < projStart) {
                bal += Number(ev.amount) || 0;
              }
            });
          }
        } catch (e) {
          console.warn('Reverse-projection failed for account', a.id, e);
        }
        return { ...a, balance: bal };
      });

      const result = projectBalances({ ...budgetData, accounts: adjustedAccounts }, projStart, endDate, opts);
      // Ensure shape
      return {
        dayPoints: Array.isArray(result?.dayPoints) ? result.dayPoints : [],
        events: Array.isArray(result?.events) ? result.events : [],
      };
    } catch (e) {
      console.error('Projection failed', e);
      return { dayPoints: [], events: [] };
    }
  }, [budgetData, horizon, mode, monthOffset, projStart, endDate, today]);

  const { dayPoints, events } = projection;
  const startTotal = dayPoints[0]?.total ?? 0;
  const endTotal = dayPoints[dayPoints.length - 1]?.total ?? 0;
  const firstNegative = dayPoints.find((p) => p && p.total < 0);

  const monthSummary = useMemo(() => {
    const months = [];
    if (!Array.isArray(dayPoints) || dayPoints.length === 0) return months;
    for (let i = 0; i < horizon; i++) {
      try {
        const mStart = startOfMonth(addMonths(projStart, i));
        const mEnd = endOfMonth(addMonths(projStart, i));
        const monthEvents = (events || []).filter((ev) => ev?.date && ev.date >= mStart && ev.date <= mEnd);
        const income = monthEvents.filter((e) => e.amount > 0 && e.type !== 'transfer-in').reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const outgoings = monthEvents.filter((e) => e.amount < 0 && e.type !== 'transfer-out').reduce((s, e) => s + Math.abs(Number(e.amount) || 0), 0);
        const startPoint = dayPoints.find((p) => p?.date && dateKey(p.date) === dateKey(mStart)) || dayPoints[0];
        const endPoint = [...dayPoints].reverse().find((p) => p?.date && p.date <= mEnd) || dayPoints[dayPoints.length - 1];
        months.push({
          label: monthLabel(mStart),
          income,
          outgoings,
          net: income - outgoings,
          startBalance: startPoint?.total ?? 0,
          endBalance: endPoint?.total ?? 0,
        });
      } catch (e) {
        console.warn('Month summary failed for offset', i, e);
      }
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
      <PageHeader
        title="Budget"
        eyebrow="Cash flow projection"
        right={
          <>
            <ViewingAsSwitch earners={data.earners} />
            <button style={styles.iconBtn} onClick={togglePrivacy} title="Toggle privacy">
              {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </>
        }
      />

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

      {/* Personal vs Joint context toggle - sits right above the chart it scopes */}
      {hasMixedAccounts && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 18,
            marginBottom: 8,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginRight: 4 }}>
            View:
          </span>
          <Toggle active={budgetView === 'personal'} onClick={() => setBudgetView('personal')} small>Personal</Toggle>
          <Toggle active={budgetView === 'joint'} onClick={() => setBudgetView('joint')} small>
            <Home size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
            Joint
          </Toggle>
        </div>
      )}

      <div style={{ marginTop: hasMixedAccounts ? 4 : 18 }}>
        <TrajectoryChart
          dayPoints={dayPoints}
          events={events}
          onTapEvent={onTapEvent}
        />
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
