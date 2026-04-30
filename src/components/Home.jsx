import React, { useMemo } from 'react';
import { Plus, AlertTriangle, Briefcase, Receipt, TrendingUp, Coins, Settings, Eye, EyeOff, Home as HomeIcon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, fmtShort, greeting, dayLabel, addDays } from '../lib/format.js';
import { generateEvents, projectBalances, forecastCurrentBalances } from '../lib/projection.js';
import { buildJobTaxLedger } from '../lib/tax.js';
import { applyViewFilter, isHouseholdAccount } from '../lib/viewFilter.js';
import { Money, ViewingAsSwitch } from './atoms.jsx';

export function Home({ data, setPage, setModal }) {
  const { styles, t, privacy, togglePrivacy, viewingAs } = useTheme();

  // Apply view filter for displayed data
  const viewData = useMemo(() => applyViewFilter(data, viewingAs), [data, viewingAs]);
  const totalLiquid = viewData.accounts.reduce((s, a) => s + Number(a.balance), 0);

  const today = new Date();
  // Use actual current time (not midnight) so we don't double-count events
  // that fired earlier today: forecastCurrentBalances applies them, then
  // projection starts AFTER them.
  const horizon = addDays(today, 30);

  const projection = useMemo(() => {
    // Forecast each account's current balance from its lastUpdated to today,
    // then project forward. This way the projection starts from where the
    // user actually is now, not from a stale reconciled value.
    try {
      const forecasted = forecastCurrentBalances(viewData, today);
      const todayAnchored = {
        ...viewData,
        accounts: forecasted.map((a) => ({ ...a, balance: a.forecastedBalance })),
      };
      const result = projectBalances(todayAnchored, today, horizon, { includeSpeculative: false, likelyWeight: 0.75, skipEventsAtStart: true });
      return {
        dayPoints: Array.isArray(result?.dayPoints) ? result.dayPoints : [],
        events: Array.isArray(result?.events) ? result.events : [],
      };
    } catch (e) {
      console.error('Home projection failed', e);
      return { dayPoints: [], events: [] };
    }
  }, [viewData]);
  const projectedTotal = projection.dayPoints[projection.dayPoints.length - 1]?.total ?? totalLiquid;
  const firstNegative = projection.dayPoints.find((p) => p && p.total < 0);

  // Household-level computations - independent of viewingAs
  const householdHealth = useMemo(() => {
    const householdAccountIds = new Set(
      data.accounts.filter(isHouseholdAccount).map((a) => a.id)
    );
    if (householdAccountIds.size === 0) return null;

    // Monthly equivalent of bills paying from household accounts
    const householdBills = data.bills.filter((b) => householdAccountIds.has(b.accountId));
    const monthlyBillsOut = householdBills.reduce((s, b) => {
      const amt = Number(b.amount) || 0;
      if (b.frequency === 'monthly') return s + amt;
      if (b.frequency === 'weekly') return s + amt * 4.33;
      if (b.frequency === 'yearly') return s + amt / 12;
      return s;
    }, 0);

    // Monthly inflow: external income paying into household accounts + transfers TO household accounts
    const monthlyExtIncomeIn = (data.externalIncome || [])
      .filter((e) => householdAccountIds.has(e.accountId))
      .reduce((s, e) => {
        const amt = Number(e.amount) || 0;
        if (e.frequency === 'monthly') return s + amt;
        if (e.frequency === 'weekly') return s + amt * 4.33;
        return s;
      }, 0);

    const monthlyTransfersIn = (data.transfers || [])
      .filter((tr) => householdAccountIds.has(tr.toAccountId) && !householdAccountIds.has(tr.fromAccountId))
      .reduce((s, tr) => {
        const amt = Number(tr.amount) || 0;
        if (tr.frequency === 'monthly') return s + amt;
        if (tr.frequency === 'weekly') return s + amt * 4.33;
        return s;
      }, 0);

    const monthlyIn = monthlyExtIncomeIn + monthlyTransfersIn;
    const surplus = monthlyIn - monthlyBillsOut;
    const householdBalance = data.accounts
      .filter(isHouseholdAccount)
      .reduce((s, a) => s + Number(a.balance), 0);

    return {
      monthlyIn,
      monthlyBillsOut,
      surplus,
      householdBalance,
      hasContent: monthlyIn > 0 || monthlyBillsOut > 0,
    };
  }, [data]);

  // 30-day Joint pot trajectory - one line per day showing total household account balance
  const householdSparklinePoints = useMemo(() => {
    const householdAccounts = data.accounts.filter(isHouseholdAccount);
    if (householdAccounts.length === 0) return [];
    const householdIds = new Set(householdAccounts.map((a) => a.id));

    // Forecast each account's current balance (anchor + drift since lastUpdated)
    // so the sparkline starts from where the user actually is *today*, not from
    // a stale reconciled value.
    const forecasted = forecastCurrentBalances(data, today);
    const householdAccountsForecasted = forecasted.filter((a) => householdIds.has(a.id));

    const householdData = {
      ...data,
      accounts: householdAccountsForecasted.map((a) => ({ ...a, balance: a.forecastedBalance })),
      bills: (data.bills || []).filter((b) => householdIds.has(b.accountId)),
      externalIncome: (data.externalIncome || []).filter((e) => householdIds.has(e.accountId)),
      transfers: (data.transfers || []).filter(
        (tr) => householdIds.has(tr.fromAccountId) || householdIds.has(tr.toAccountId)
      ),
      jobs: [],
      salaries: [],
    };
    try {
      const proj = projectBalances(householdData, today, horizon, { includeSpeculative: false, likelyWeight: 0.75, skipEventsAtStart: true });
      return (proj.dayPoints || []).map((p) => ({ value: p.total, date: p.date }));
    } catch {
      return [];
    }
  }, [data, today]);

  // Greeting becomes personalised when viewing as an earner
  const earnerView = data.earners.find((e) => e.id === viewingAs);
  const greetingLine = earnerView ? `${greeting()}, ${earnerView.name}` : greeting();

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerEyebrow}>{greetingLine}</div>
          <h1 style={styles.headerTitle}>Cash flow</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ViewingAsSwitch earners={data.earners} />
          <button style={styles.iconBtn} onClick={togglePrivacy}>
            {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button style={{ ...styles.iconBtn, color: t.textDim }} onClick={() => setModal({ type: 'settings', payload: null })}>
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div style={styles.heroCard} onClick={() => setPage('budget')}>
        <div style={styles.heroLabel}>
          {viewingAs === 'household' ? 'Total liquid' : `${earnerView?.name || ''} + household`}
        </div>
        <div className={privacy ? 'private-blur' : ''} style={styles.heroAmount}>{fmt(totalLiquid)}</div>
        <div style={styles.heroFoot}>
          <span style={{ opacity: 0.7 }}>30 days from now</span>
          <span
            style={{
              color: projectedTotal >= totalLiquid ? t.income : t.expense,
              fontWeight: 500,
            }}
            className={privacy ? 'private-blur' : ''}
          >
            {projectedTotal >= totalLiquid ? '↑' : '↓'} {fmt(Math.abs(projectedTotal - totalLiquid))}
          </span>
        </div>
        {firstNegative && (
          <div style={styles.warningBar}>
            <AlertTriangle size={14} />
            <span>Negative on {dayLabel(firstNegative.date)}</span>
          </div>
        )}
      </div>

      <div style={styles.sectionHead}>
        <h2 style={styles.h2}>Accounts</h2>
        <button style={styles.iconBtn} onClick={() => setModal({ type: 'account', payload: null })}>
          <Plus size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {viewData.accounts.map((acc) => (
          <AccountRow key={acc.id} acc={acc} setModal={setModal} data={data} />
        ))}
      </div>

      {/* Joint health - only show if there are household accounts with activity */}
      {householdHealth && householdHealth.hasContent && (
        <JointHealthCard health={householdHealth} sparklinePoints={householdSparklinePoints} />
      )}

      <div style={styles.sectionHead}>
        <h2 style={styles.h2}>Quick view</h2>
      </div>

      <div style={styles.quickGrid}>
        <QuickCard
          icon={<Briefcase size={18} />}
          label="Work"
          value={fmt(viewData.jobs.filter((j) => j.confidence !== 'speculative').reduce((s, j) => {
            const ledger = buildJobTaxLedger(viewData.jobs, viewData.salaries);
            return s + (ledger.get(j.id)?.net || 0);
          }, 0))}
          sub={`${viewData.jobs.length} jobs · ${(viewData.salaries || []).length} salaries`}
          onClick={() => setPage('activity')}
        />
        <QuickCard
          icon={<Receipt size={18} />}
          label="Monthly bills"
          value={fmt(viewData.bills.reduce((s, b) => {
            const amt = Number(b.amount) || 0;
            if (b.frequency === 'monthly') return s + amt;
            if (b.frequency === 'weekly') return s + amt * 4.33;
            if (b.frequency === 'yearly') return s + amt / 12;
            return s;
          }, 0))}
          sub={`${viewData.bills.length} bills`}
          onClick={() => setPage('activity')}
        />
        <QuickCard
          icon={<TrendingUp size={18} />}
          label="Budget"
          value="View"
          sub="cash flow plan"
          onClick={() => setPage('budget')}
          noPrivacy
        />
        <QuickCard
          icon={<Coins size={18} />}
          label="Net worth"
          value={fmt(totalLiquid + (data.assets || []).reduce((s, a) => s + Number(a.value), 0))}
          sub="incl. assets"
          onClick={() => setPage('wealth')}
        />
      </div>
    </div>
  );
}

function JointHealthCard({ health, sparklinePoints }) {
  const { t, privacy } = useTheme();
  const isHealthy = health.surplus >= 0;
  const surplusColor = isHealthy ? t.income : t.expense;
  const sign = isHealthy ? '+' : '−';

  return (
    <div
      style={{
        marginTop: 22,
        background: t.bgElev,
        border: `1px solid ${t.secondary}55`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HomeIcon size={14} style={{ color: t.secondary }} />
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: t.secondary, fontWeight: 600 }}>
            Household pot
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 999,
            background: isHealthy ? t.incomeBg : t.expenseBg,
            color: surplusColor,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {isHealthy ? 'sustaining' : 'shortfall'}
        </div>
      </div>

      {/* Sparkline showing 30-day household pot trajectory */}
      {sparklinePoints && sparklinePoints.length > 1 && (
        <Sparkline points={sparklinePoints} privacy={privacy} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.textDim, paddingBottom: 6 }}>
        <span>Inflow / mo</span>
        <span style={{ color: t.income, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
          +{fmt(health.monthlyIn)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.textDim, paddingBottom: 6 }}>
        <span>Bills / mo</span>
        <span style={{ color: t.expense, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
          −{fmt(health.monthlyBillsOut)}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 14,
          paddingTop: 8,
          marginTop: 4,
          borderTop: `1px solid ${t.border}`,
          fontWeight: 600,
        }}
      >
        <span style={{ color: t.text }}>Monthly surplus</span>
        <span
          style={{
            color: surplusColor,
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 18,
            fontWeight: t.weightAmount,
          }}
          className={privacy ? 'private-blur' : ''}
        >
          {sign}{fmt(Math.abs(health.surplus))}
        </span>
      </div>

      {!isHealthy && (
        <div style={{ marginTop: 10, fontSize: 11, color: t.textFaint, fontStyle: 'italic', lineHeight: 1.4 }}>
          Joint outflow exceeds inflow. Consider increasing contributions or reducing household bills.
        </div>
      )}
    </div>
  );
}

function AccountRow({ acc, setModal, data }) {
  const { styles, t, privacy } = useTheme();
  const lastUpdate = new Date(acc.lastUpdated);
  const today = new Date();
  const daysSince = Math.floor((today - lastUpdate) / (1000 * 60 * 60 * 24));

  let expected = Number(acc.balance);
  if (daysSince > 0) {
    const events = generateEvents(data, lastUpdate, today);
    events.forEach((ev) => { if (ev.accountId === acc.id) expected += ev.amount; });
  }

  const showVariance = daysSince > 0 && Math.abs(Number(acc.balance) - expected) > 0.01;
  const accountColor = t.accountColors[acc.colorIdx ?? 0] || t.accent;
  const isHouseholdAcc = acc.ownerId === 'household' || !acc.ownerId;

  // Today's bills/flow for this account - quick "what's draining you right now" glance
  const todaysFlow = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    try {
      const events = generateEvents(data, startOfToday, endOfToday) || [];
      const accEvents = events.filter((ev) => ev.accountId === acc.id);
      let bills = 0;
      let income = 0;
      let transfersOut = 0;
      let transfersIn = 0;
      const billItems = [];
      accEvents.forEach((ev) => {
        const amt = Number(ev.amount) || 0;
        if (ev.type === 'bill') {
          bills += Math.abs(amt);
          billItems.push({ label: ev.label, amount: amt });
        } else if (ev.type === 'job' || ev.type === 'salary' || ev.type === 'extincome') {
          income += amt;
        } else if (ev.type === 'transfer-out') {
          transfersOut += Math.abs(amt);
        } else if (ev.type === 'transfer-in') {
          transfersIn += amt;
        }
      });
      const net = income + transfersIn - bills - transfersOut;
      const total = accEvents.length;
      return { bills, income, transfersOut, transfersIn, net, total, billItems };
    } catch {
      return { bills: 0, income: 0, transfersOut: 0, transfersIn: 0, net: 0, total: 0, billItems: [] };
    }
  }, [data, acc.id]);

  // Build a short "today" summary line
  const todayParts = [];
  if (todaysFlow.bills > 0) todayParts.push({ label: 'bills', amount: -todaysFlow.bills, color: t.expense });
  if (todaysFlow.transfersOut > 0) todayParts.push({ label: 'transfer out', amount: -todaysFlow.transfersOut, color: t.expense });
  if (todaysFlow.transfersIn > 0) todayParts.push({ label: 'transfer in', amount: todaysFlow.transfersIn, color: t.income });
  if (todaysFlow.income > 0) todayParts.push({ label: 'income', amount: todaysFlow.income, color: t.income });

  // Tint the card with the account colour. Hex + alpha suffix for translucency.
  // Theme colours are full hex (#rrggbb), so we append alpha bytes.
  const tintBg = accountColor + '14';     // ~8% alpha
  const tintBorder = accountColor + '55'; // ~33% alpha

  return (
    <div
      style={{
        ...styles.accountRow,
        cursor: 'pointer',
        background: tintBg,
        border: `1px solid ${tintBorder}`,
      }}
      onClick={() => setModal({ type: 'reconcile', payload: acc })}
      title="Tap to update balance"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{ ...styles.accountDot, background: accountColor }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 15, color: t.text }}>
              {acc.name}
              {isHouseholdAcc && (
                <HomeIcon size={12} style={{ color: t.secondary, opacity: 0.8 }} title="Household account" />
              )}
            </div>
            <div style={styles.accountMeta}>
              {daysSince === 0 ? 'updated today · tap to update' : `${daysSince}d ago · tap to update`}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={privacy ? 'private-blur' : ''} style={styles.accountBal}>{fmt(acc.balance)}</div>
          {showVariance && (
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }} className={privacy ? 'private-blur' : ''}>
              expected {fmt(expected)}
            </div>
          )}
        </div>
      </div>
      {todayParts.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 12px',
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${tintBorder}`,
          fontSize: 11,
          color: t.textFaint,
        }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>today</span>
          {todayParts.map((part, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: t.textDim }}>{part.label}</span>
              <span style={{ color: part.color, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
                {part.amount >= 0 ? '+' : '−'}{fmt(Math.abs(part.amount))}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickCard({ icon, label, value, sub, onClick, noPrivacy }) {
  const { styles, t, privacy } = useTheme();
  return (
    <div style={styles.quickCard} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, color: t.textDim }}>
        {icon}
      </div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 22,
          fontWeight: 500,
          color: t.text,
          lineHeight: 1.1,
        }}
        className={!noPrivacy && privacy ? 'private-blur' : ''}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// Tiny inline sparkline for the Joint health card.
function Sparkline({ points, privacy }) {
  const { t } = useTheme();
  if (!points || points.length < 2) return null;

  // SVG uses a 4:1 aspect ratio - scales down nicely on mobile, doesn't feel cramped
  const W = 400;
  const H = 80;
  const padX = 10;
  const padY = 14;

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const dataRange = Math.max(1, dataMax - dataMin);

  // Y-axis range: show data with comfortable headroom. Always include zero
  // if the values get close to it (within 25% of the range), so a deficit
  // is visually obvious.
  const includeZero = dataMin < 0 || dataMin < dataRange * 0.25;
  const min = includeZero ? Math.min(dataMin, 0) : dataMin;
  const max = dataMax;
  const range = Math.max(1, max - min);
  const minP = min - range * 0.18;
  const maxP = max + range * 0.18;
  const yRange = Math.max(1, maxP - minP);

  const x = (i) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v) => padY + (1 - (v - minP) / yRange) * (H - padY * 2);

  const startVal = values[0];
  const endVal = values[values.length - 1];
  // Colour reflects whether the household pot will be in the black or in the red
  // by the end of the window. End value > 0 = green (sustainable), end < 0 = red (broke).
  const isUp = endVal >= 0;
  const stroke = isUp ? t.income : t.expense;

  // Smooth Catmull-Rom path - tension makes it less wavy than the default
  const buildSmoothPath = () => {
    if (points.length < 3) {
      return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    }
    const pts = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    const tension = 0.4;  // lower = smoother curves, less faithful to bumps
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || pts[i + 1];
      const cp1x = p1.x + (p2.x - p0.x) * tension / 2;
      const cp1y = p1.y + (p2.y - p0.y) * tension / 2;
      const cp2x = p2.x - (p3.x - p1.x) * tension / 2;
      const cp2y = p2.y - (p3.y - p1.y) * tension / 2;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const linePath = buildSmoothPath();
  const fillPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(H - padY).toFixed(1)} L ${x(0).toFixed(1)} ${(H - padY).toFixed(1)} Z`;

  const zeroY = y(0);
  const showZero = includeZero && min < 0;

  // Unique gradient id per render so multiple sparklines don't conflict
  const gradId = `sparkFill-${stroke.replace('#', '')}`;

  return (
    <div style={{ marginBottom: 12, marginTop: 4 }}>
      {/* Chart sits above the labels, with the now/forecast values inline */}
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', height: H, overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill={`url(#${gradId})`} />
        {showZero && (
          <line
            x1={padX}
            x2={W - padX}
            y1={zeroY}
            y2={zeroY}
            stroke={t.textFaint}
            strokeWidth="0.6"
            strokeDasharray="2 4"
            opacity="0.6"
          />
        )}
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* End dot only - clean single emphasis */}
        <circle cx={x(points.length - 1)} cy={y(endVal)} r="7" fill={stroke} opacity="0.15" />
        <circle cx={x(points.length - 1)} cy={y(endVal)} r="3" fill={stroke} />
      </svg>

      {/* Two-up legend underneath: now and forecast in 30 days */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          alignItems: 'baseline',
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px solid ${t.border}`,
        }}
      >
        <div>
          <div style={{ fontSize: 9, color: t.textFaint, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600, marginBottom: 1 }}>
            Now
          </div>
          <div
            style={{
              fontSize: 14,
              color: t.text,
              fontWeight: 600,
            }}
            className={privacy ? 'private-blur' : ''}
          >
            {fmtShort(startVal)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: t.textFaint, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600, marginBottom: 1 }}>
            In 30 days
          </div>
          <div
            style={{
              fontSize: 14,
              color: stroke,
              fontWeight: 600,
            }}
            className={privacy ? 'private-blur' : ''}
          >
            {fmtShort(endVal)}
          </div>
        </div>
      </div>
    </div>
  );
}
