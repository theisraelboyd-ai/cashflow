import React, { useMemo } from 'react';
import { Plus, AlertTriangle, Briefcase, Receipt, TrendingUp, Coins, Settings, Eye, EyeOff, Pencil, Home as HomeIcon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, greeting, dayLabel, addDays } from '../lib/format.js';
import { generateEvents, projectBalances } from '../lib/projection.js';
import { buildJobTaxLedger } from '../lib/tax.js';
import { applyViewFilter, isHouseholdAccount } from '../lib/viewFilter.js';
import { Money, ViewingAsSwitch } from './atoms.jsx';

export function Home({ data, setPage, setModal }) {
  const { styles, t, privacy, togglePrivacy, viewingAs } = useTheme();

  // Apply view filter for displayed data
  const viewData = useMemo(() => applyViewFilter(data, viewingAs), [data, viewingAs]);
  const totalLiquid = viewData.accounts.reduce((s, a) => s + Number(a.balance), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = addDays(today, 30);

  const projection = useMemo(
    () => projectBalances(viewData, today, horizon, { includeSpeculative: false, likelyWeight: 0.75 }),
    [viewData]
  );
  const projectedTotal = projection.dayPoints[projection.dayPoints.length - 1]?.total || totalLiquid;
  const firstNegative = projection.dayPoints.find((p) => p.total < 0);

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
        <JointHealthCard health={householdHealth} />
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

function JointHealthCard({ health }) {
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

  return (
    <div style={styles.accountRow} onClick={() => setModal({ type: 'reconcile', payload: acc })}>
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
            {daysSince === 0 ? 'updated today' : `${daysSince}d ago`}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'right' }}>
          <div className={privacy ? 'private-blur' : ''} style={styles.accountBal}>{fmt(acc.balance)}</div>
          {showVariance && (
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }} className={privacy ? 'private-blur' : ''}>
              expected {fmt(expected)}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setModal({ type: 'account', payload: acc });
          }}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            border: 'none',
            background: 'transparent',
            color: t.textFaint,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title="Edit account"
        >
          <Pencil size={13} />
        </button>
      </div>
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
