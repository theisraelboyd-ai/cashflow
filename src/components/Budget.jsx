import React, { useState, useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff, Home } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, monthLabel, monthLongLabel, startOfMonth, endOfMonth, addMonths, dayLabel, dateKey } from '../lib/format.js';
import { projectBalances, generateEvents, forecastCurrentBalances } from '../lib/projection.js';
import { applyViewFilter } from '../lib/viewFilter.js';
import { PageHeader, Toggle, Money, ViewingAsSwitch } from './atoms.jsx';
import { TrajectoryChart } from './TrajectoryChart.jsx';

export function Budget({ data, setModal, setPage }) {
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
    // Bills are recurring schedules - editing them affects every month going forward,
    // so we don't surface an edit modal directly from the chart. Tapping a bill row
    // sends you to Activity → Bills where you can review the whole list properly.
    if (ev.type === 'bill') {
      if (setPage) setPage('activity');
      return;
    }
    if (ev.type === 'job' && ev.jobId) {
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

      // Step 1: forecast each account from its lastUpdated forward to today.
      // This gives us an "as of today" anchor we can then project from.
      const forecasted = forecastCurrentBalances(budgetData, today);
      const todayAnchored = forecasted.map((a) => ({
        ...a,
        balance: a.forecastedBalance,
      }));

      // Step 2: align the chart starting point with projStart.
      //
      // CRITICAL: same-calendar-day check. If projStart falls on the same calendar
      // day as today, do NOT reverse-walk to midnight - that exposes a time-of-day
      // artifact where events scheduled "for today" appear to have not happened yet
      // at midnight, making the chart show a misleading dip.
      // Just use today's forecasted balance as the start; the forward projection
      // will apply today's events naturally and avoid the dip.
      const projStartDay = new Date(projStart);
      projStartDay.setHours(0, 0, 0, 0);
      const todayDay = new Date(today);
      todayDay.setHours(0, 0, 0, 0);
      const sameCalendarDay = projStartDay.getTime() === todayDay.getTime();

      const adjustedAccounts = todayAnchored.map((a) => {
        let bal = Number(a.balance) || 0;
        if (sameCalendarDay) {
          // Use forecasted balance directly; projection runs forward from today
          return { ...a, balance: bal };
        }
        try {
          if (projStart < today) {
            // Window starts in the past — reverse-walk events that ran since projStart
            const past = generateEvents(budgetData, projStart, today, opts) || [];
            past.forEach((ev) => {
              if (ev && ev.accountId === a.id && ev.date && ev.date <= today) {
                bal -= Number(ev.amount) || 0;
              }
            });
          } else if (projStart > today) {
            // Window starts in the future — apply events between now and then
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

      // For same-calendar-day, project from `today` (not projStart midnight)
      // so events scheduled for today DON'T fire again — they're already
      // baked into the forecasted balance via forecastCurrentBalances.
      const effectiveStart = sameCalendarDay ? today : projStart;
      const projOpts = sameCalendarDay ? { ...opts, skipEventsAtStart: true } : opts;
      const result = projectBalances({ ...budgetData, accounts: adjustedAccounts }, effectiveStart, endDate, projOpts);
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
  const firstNegative = dayPoints.find((p) => p && Number.isFinite(p.total) && p.total < 0);

  const monthSummary = useMemo(() => {
    const months = [];
    if (!Array.isArray(dayPoints) || dayPoints.length === 0) return months;
    const accountIds = new Set((budgetData.accounts || []).map((a) => a.id));
    for (let i = 0; i < horizon; i++) {
      try {
        const mStart = startOfMonth(addMonths(projStart, i));
        const mEnd = endOfMonth(addMonths(projStart, i));
        const monthEvents = (events || []).filter((ev) => ev?.date && ev.date >= mStart && ev.date <= mEnd);
        // Income: any positive event affecting one of our accounts (including transfers IN to one of ours)
        const income = monthEvents
          .filter((e) => e.amount > 0 && accountIds.has(e.accountId))
          .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        // Outgoings: any negative event leaving one of our accounts (including transfers OUT)
        const outgoings = monthEvents
          .filter((e) => e.amount < 0 && accountIds.has(e.accountId))
          .reduce((s, e) => s + Math.abs(Number(e.amount) || 0), 0);
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
  }, [events, dayPoints, horizon, projStart, budgetData.accounts]);

  // Window label for the title - "April 2026" or "Apr–Jun 2026"
  const windowLabel = useMemo(() => {
    const startLbl = monthLongLabel(projStart);
    if (horizon === 1) return startLbl;
    const endLbl = monthLongLabel(endOfMonth(addMonths(projStart, horizon - 1)));
    return `${monthLabel(projStart)}–${monthLabel(endOfMonth(addMonths(projStart, horizon - 1)))}`;
  }, [projStart, horizon]);

  // Cashflow breakdown over the whole horizon - what actually flows in/out of the
  // accounts in this view. Helps clarify why the hero "drop" is what it is.
  const flowBreakdown = useMemo(() => {
    const accountIds = new Set((budgetData.accounts || []).map((a) => a.id));
    let bills = 0;
    let income = 0;
    let transfersOut = 0;
    let transfersIn = 0;
    (events || []).forEach((ev) => {
      if (!ev || !accountIds.has(ev.accountId)) return;
      if (ev.type === 'bill') bills += Math.abs(Number(ev.amount) || 0);
      else if (ev.type === 'job' || ev.type === 'salary' || ev.type === 'extincome') {
        income += Number(ev.amount) || 0;
      } else if (ev.type === 'transfer-out') transfersOut += Math.abs(Number(ev.amount) || 0);
      else if (ev.type === 'transfer-in') transfersIn += Number(ev.amount) || 0;
    });
    return {
      bills,
      income,
      transfersOut,
      transfersIn,
      hasFlow: bills > 0 || income > 0 || transfersOut > 0 || transfersIn > 0,
    };
  }, [events, budgetData.accounts]);

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

      {/* Mode toggle - 2 equal pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <Toggle active={mode === 'realistic'} onClick={() => setMode('realistic')} small style={{ flex: 1 }}>Realistic</Toggle>
        <Toggle active={mode === 'optimistic'} onClick={() => setMode('optimistic')} small style={{ flex: 1 }}>All planned</Toggle>
      </div>

      {/* Horizon picker - 4 equal pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[1, 3, 6, 12].map((n) => (
          <Toggle key={n} active={horizon === n} onClick={() => setHorizon(n)} small style={{ flex: 1 }}>{n}m</Toggle>
        ))}
      </div>

      {/* Compact month stepper - single line, jump-to-today inline */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          padding: '6px 8px',
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
        }}
      >
        <button onClick={() => setMonthOffset(monthOffset - 1)} style={{ ...styles.iconBtn, padding: 4 }}>
          <ChevronLeft size={14} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{windowLabel}</span>
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              style={{
                fontSize: 10,
                color: t.accent,
                background: 'none',
                border: `1px solid ${t.accent}66`,
                padding: '2px 7px',
                borderRadius: 999,
                cursor: 'pointer',
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
            >
              today
            </button>
          )}
        </div>
        <button onClick={() => setMonthOffset(monthOffset + 1)} style={{ ...styles.iconBtn, padding: 4 }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Compact hero - smaller padding, end balance + delta on one optical line */}
      <div style={{ ...styles.heroCard, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...styles.heroLabel, marginBottom: 2 }}>End {windowLabel.split(/[–-]/)[horizon === 1 ? 0 : 1] ? 'window' : `after ${horizon}m`}</div>
            <div
              style={{ ...styles.heroAmount, fontSize: 30, lineHeight: 1.05, color: endTotal >= 0 ? t.text : t.expense }}
              className={privacy ? 'private-blur' : ''}
            >
              {fmt(endTotal)}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 2 }}>
              from
            </div>
            <div style={{ fontSize: 13, color: t.textDim }} className={privacy ? 'private-blur' : ''}>
              {fmt(startTotal)}
            </div>
            <div style={{ fontSize: 12, color: endTotal >= startTotal ? t.income : t.expense, fontWeight: 600, marginTop: 2 }} className={privacy ? 'private-blur' : ''}>
              {endTotal >= startTotal ? '↑' : '↓'} {fmt(Math.abs(endTotal - startTotal))}
            </div>
          </div>
        </div>
        {firstNegative && (
          <div style={{ ...styles.warningBar, marginTop: 10 }}>
            <AlertTriangle size={13} />
            <span>Goes negative on {dayLabel(firstNegative.date)}</span>
          </div>
        )}
      </div>

      {/* Personal vs Joint context toggle - inline, just above chart */}
      {hasMixedAccounts && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 10,
            marginBottom: 4,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginRight: 2 }}>
            View:
          </span>
          <Toggle active={budgetView === 'personal'} onClick={() => setBudgetView('personal')} small>Personal</Toggle>
          <Toggle active={budgetView === 'joint'} onClick={() => setBudgetView('joint')} small>
            <Home size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
            Joint
          </Toggle>
        </div>
      )}

      <div style={{ marginTop: hasMixedAccounts ? 4 : 10 }}>
        <TrajectoryChart
          dayPoints={dayPoints}
          events={events}
          onTapEvent={onTapEvent}
          reconciliations={data.reconciliations || []}
          accounts={budgetData.accounts}
        />
      </div>

      {/* Cashflow breakdown - moved AFTER the chart since it's reference info */}
      {flowBreakdown.hasFlow && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            background: t.bgElev,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            fontSize: 12,
          }}
        >
          <div style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>
            Cashflow over {horizon}m {hasMixedAccounts && `· ${budgetView}`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 10px', color: t.textDim }}>
            {flowBreakdown.income > 0 && (
              <>
                <span>Income (jobs, salary, contributions)</span>
                <span style={{ color: t.income, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
                  +{fmt(flowBreakdown.income)}
                </span>
              </>
            )}
            {flowBreakdown.bills > 0 && (
              <>
                <span>Bills</span>
                <span style={{ color: t.expense, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
                  −{fmt(flowBreakdown.bills)}
                </span>
              </>
            )}
            {flowBreakdown.transfersOut > 0 && (
              <>
                <span>Transfers out (to other accounts)</span>
                <span style={{ color: t.expense, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
                  −{fmt(flowBreakdown.transfersOut)}
                </span>
              </>
            )}
            {flowBreakdown.transfersIn > 0 && (
              <>
                <span>Transfers in (from other accounts)</span>
                <span style={{ color: t.income, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
                  +{fmt(flowBreakdown.transfersIn)}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
