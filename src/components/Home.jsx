import React, { useMemo } from 'react';
import { Plus, AlertTriangle, Briefcase, Receipt, TrendingUp, Coins, Settings, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, greeting, dayLabel, addDays } from '../lib/format.js';
import { generateEvents, projectBalances } from '../lib/projection.js';
import { buildJobTaxLedger } from '../lib/tax.js';
import { Money } from './atoms.jsx';

export function Home({ data, setPage, setModal }) {
  const { styles, t, privacy, togglePrivacy } = useTheme();
  const totalLiquid = data.accounts.reduce((s, a) => s + Number(a.balance), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = addDays(today, 30);

  const projection = useMemo(
    () => projectBalances(data, today, horizon, { includeSpeculative: false, likelyWeight: 0.75 }),
    [data]
  );
  const projectedTotal = projection.dayPoints[projection.dayPoints.length - 1]?.total || totalLiquid;
  const firstNegative = projection.dayPoints.find((p) => p.total < 0);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerEyebrow}>{greeting()}</div>
          <h1 style={styles.headerTitle}>Cash flow</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.iconBtn} onClick={togglePrivacy}>
            {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button style={{ ...styles.iconBtn, color: t.textDim }} onClick={() => setModal({ type: 'settings', payload: null })}>
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div style={styles.heroCard} onClick={() => setPage('budget')}>
        <div style={styles.heroLabel}>Total liquid</div>
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
        {data.accounts.map((acc) => (
          <AccountRow key={acc.id} acc={acc} setModal={setModal} data={data} />
        ))}
      </div>

      <div style={styles.sectionHead}>
        <h2 style={styles.h2}>Quick view</h2>
      </div>

      <div style={styles.quickGrid}>
        <QuickCard
          icon={<Briefcase size={18} />}
          label="Work"
          value={fmt(data.jobs.filter((j) => j.confidence !== 'speculative').reduce((s, j) => {
            const ledger = buildJobTaxLedger(data.jobs, data.salaries);
            return s + (ledger.get(j.id)?.net || 0);
          }, 0))}
          sub={`${data.jobs.length} jobs · ${(data.salaries || []).length} salaries`}
          onClick={() => setPage('activity')}
        />
        <QuickCard
          icon={<Receipt size={18} />}
          label="Monthly bills"
          value={fmt(data.bills.filter((b) => b.frequency === 'monthly').reduce((s, b) => s + Number(b.amount), 0))}
          sub={`${data.bills.length} bills`}
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
          value={fmt(totalLiquid + data.assets.reduce((s, a) => s + Number(a.value), 0))}
          sub="incl. assets"
          onClick={() => setPage('wealth')}
        />
      </div>
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

  return (
    <div style={styles.accountRow} onClick={() => setModal({ type: 'reconcile', payload: acc })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ ...styles.accountDot, background: accountColor }} />
        <div>
          <div style={{ fontWeight: 500, fontSize: 15, color: t.text }}>{acc.name}</div>
          <div style={styles.accountMeta}>
            {daysSince === 0 ? 'updated today' : `${daysSince}d ago`}
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
