import React, { useState, useMemo } from 'react';
import { Plus, ArrowRightLeft, Home } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, dayLabel, monthLongLabel, startOfMonth } from '../lib/format.js';
import {
  buildJobTaxLedger,
  jobPayDate,
  getTaxYearStart,
  getTaxYearLabel,
  earnerPayeYTD,
  earnerMaltaYTD,
  CLASS_2_ANNUAL,
  DEFAULT_EARNER_ID,
} from '../lib/tax.js';
import { applyViewFilter, classifyBillOwnership } from '../lib/viewFilter.js';
import { PageHeader, SummaryCell, Empty, Toggle, AddButton, Money, ViewingAsSwitch } from './atoms.jsx';

export function Activity({ data, setModal }) {
  const { styles, viewingAs } = useTheme();
  const [tab, setTab] = useState('work');

  // Filtered view of data for what's displayed
  const viewData = useMemo(() => applyViewFilter(data, viewingAs), [data, viewingAs]);

  const onAdd = () => {
    if (tab === 'work') {
      setModal({ type: 'workpicker', payload: null });
    } else if (tab === 'bills') {
      setModal({ type: 'bill', payload: null });
    } else {
      // Movements tab - default to transfer add
      setModal({ type: 'movementpicker', payload: null });
    }
  };

  return (
    <div style={styles.page}>
      <PageHeader
        title="Activity"
        eyebrow="Work, bills, movements"
        right={<ViewingAsSwitch earners={data.earners} />}
        action={<AddButton onClick={onAdd} />}
      />

      <div style={styles.toggleRow}>
        <Toggle active={tab === 'work'} onClick={() => setTab('work')}>Work</Toggle>
        <Toggle active={tab === 'bills'} onClick={() => setTab('bills')}>Bills</Toggle>
        <Toggle active={tab === 'movements'} onClick={() => setTab('movements')}>Movements</Toggle>
      </div>

      {tab === 'work' && <WorkContent data={data} viewData={viewData} setModal={setModal} />}
      {tab === 'bills' && <BillsContent data={data} viewData={viewData} setModal={setModal} />}
      {tab === 'movements' && <MovementsContent data={data} viewData={viewData} setModal={setModal} />}
    </div>
  );
}

function WorkContent({ data, viewData, setModal }) {
  const { styles, t } = useTheme();
  const ledger = useMemo(() => buildJobTaxLedger(viewData.jobs, viewData.salaries), [viewData.jobs, viewData.salaries]);

  const sumNet = (jobs) => jobs.reduce((s, j) => s + (ledger.get(j.id)?.net || 0), 0);
  const confirmed = viewData.jobs.filter((j) => j.confidence === 'confirmed');
  const likely = viewData.jobs.filter((j) => j.confidence === 'likely');
  const speculative = viewData.jobs.filter((j) => j.confidence === 'speculative');

  const tyStart = getTaxYearStart(new Date());

  // Group jobs by month of pay date
  const groupedByMonth = useMemo(() => {
    const map = new Map();
    [...viewData.jobs]
      .sort((a, b) => jobPayDate(a) - jobPayDate(b))
      .forEach((j) => {
        const d = jobPayDate(j);
        const key = startOfMonth(d).toISOString();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(j);
      });
    return map;
  }, [viewData.jobs]);

  // Tax cards always show both earners — viewing as someone shouldn't hide the household tax picture
  const taxEarnersToShow = data.earners;

  return (
    <div>
      <div style={styles.summaryGrid3}>
        <SummaryCell label="Confirmed" value={fmt(sumNet(confirmed))} accent={t.income} />
        <SummaryCell label="Likely" value={fmt(sumNet(likely))} accent={t.accent} />
        <SummaryCell label="Speculative" value={fmt(sumNet(speculative))} accent={t.textFaint} />
      </div>

      {/* Per-earner tax-year cards - always full data */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {taxEarnersToShow.map((earner) => (
          <TaxYearCard key={earner.id} earner={earner} data={data} />
        ))}
      </div>

      {/* Salaries section */}
      {(viewData.salaries || []).length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={styles.sectionHead}>
            <h2 style={styles.h2}>Salaries</h2>
            <button style={styles.iconBtn} onClick={() => setModal({ type: 'salary', payload: null })}>
              <Plus size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {viewData.salaries.map((s) => (
              <SalaryCard key={s.id} salary={s} setModal={setModal} data={data} />
            ))}
          </div>
        </div>
      )}

      {/* Jobs grouped by month */}
      {viewData.jobs.length === 0 && (
        <div style={{ marginTop: 22 }}>
          <Empty msg={`No jobs yet. Tap + to add a freelance job or salary.`} />
        </div>
      )}

      {[...groupedByMonth.keys()].sort().map((monthKey) => (
        <div key={monthKey}>
          <div style={styles.monthHeader}>{monthLongLabel(new Date(monthKey))}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groupedByMonth.get(monthKey).map((j) => (
              <JobCard key={j.id} job={j} setModal={setModal} data={data} ledger={ledger} />
            ))}
          </div>
        </div>
      ))}

      {/* Add Salary CTA if none exist */}
      {(viewData.salaries || []).length === 0 && (
        <div style={{ marginTop: 18 }}>
          <button
            onClick={() => setModal({ type: 'salary', payload: null })}
            style={{
              width: '100%',
              padding: '14px',
              background: 'transparent',
              border: `1px dashed ${t.border}`,
              borderRadius: 12,
              color: t.textDim,
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            + Add salary (regular employed income)
          </button>
        </div>
      )}
    </div>
  );
}

function TaxYearCard({ earner, data }) {
  const { t, privacy } = useTheme();
  const earnerId = earner.id;

  const paye = earnerPayeYTD(data.jobs, data.salaries || [], earnerId);
  const malta = earnerMaltaYTD(data.jobs, earnerId);
  const tyLabel = getTaxYearLabel(new Date());

  const hasAny = paye.gross > 0 || malta > 0;

  return (
    <div
      style={{
        background: t.bgElev,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: t.secondary }}>
          {earner.name}
        </div>
        <div style={{ fontSize: 10, color: t.textFaint, letterSpacing: 1, textTransform: 'uppercase' }}>
          {tyLabel}
        </div>
      </div>

      {!hasAny && (
        <div style={{ fontSize: 12, color: t.textFaint, fontStyle: 'italic' }}>
          No income recorded this tax year yet.
        </div>
      )}

      {malta > 0 && (
        <>
          <div style={{ fontSize: 10, color: t.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Malta
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
            <span style={{ color: t.textDim }}>Gross YTD</span>
            <span className={privacy ? 'private-blur' : ''} style={{ color: t.text, fontFamily: "'Cormorant Garamond', serif", fontSize: 15 }}>
              {fmt(malta)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
            <span style={{ color: t.textDim }}>Class 2 NI (voluntary)</span>
            <span className={privacy ? 'private-blur' : ''} style={{ color: t.text, fontFamily: "'Cormorant Garamond', serif", fontSize: 15 }}>
              {fmt(CLASS_2_ANNUAL)}
            </span>
          </div>
        </>
      )}

      {paye.gross > 0 && (
        <>
          <div style={{ fontSize: 10, color: t.textDim, textTransform: 'uppercase', letterSpacing: 1, marginTop: malta > 0 ? 10 : 0, marginBottom: 4 }}>
            PAYE
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
            <span style={{ color: t.textDim }}>Gross YTD</span>
            <span className={privacy ? 'private-blur' : ''} style={{ color: t.text, fontFamily: "'Cormorant Garamond', serif", fontSize: 15 }}>
              {fmt(paye.gross)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
            <span style={{ color: t.textDim }}>Income tax + NI</span>
            <span className={privacy ? 'private-blur' : ''} style={{ color: t.expense, fontFamily: "'Cormorant Garamond', serif", fontSize: 15 }}>
              −{fmt(paye.deduction)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0 3px', borderTop: `1px solid ${t.border}`, marginTop: 4 }}>
            <span style={{ color: t.textDim }}>Net YTD</span>
            <span className={privacy ? 'private-blur' : ''} style={{ color: t.income, fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 500 }}>
              {fmt(paye.net)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function SalaryCard({ salary, setModal, data }) {
  const { styles, t, privacy } = useTheme();
  const earner = data.earners.find((e) => e.id === salary.earnerId);
  const acc = data.accounts.find((a) => a.id === salary.accountId);
  const monthlyGross = salary.frequency === 'monthly' ? salary.annualGross / 12 : salary.frequency === 'weekly' ? salary.annualGross / 52 : salary.annualGross / 13;

  return (
    <div style={styles.jobCard} onClick={() => setModal({ type: 'salary', payload: salary })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: t.secondary }} />
          <div style={{ fontWeight: 500, fontSize: 15, color: t.text }}>{salary.name || 'Salary'}</div>
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: t.text }} className={privacy ? 'private-blur' : ''}>
          {fmt(salary.annualGross)}/yr
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
        <div>{earner?.name || 'unknown'} · {salary.frequency}</div>
        <div>→ {acc?.name || 'no account'}</div>
      </div>
      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }} className={privacy ? 'private-blur' : ''}>
        ~{fmt(monthlyGross)} per pay (gross)
      </div>
    </div>
  );
}

function JobCard({ job, setModal, data, ledger }) {
  const { styles, t, privacy } = useTheme();
  const calc = ledger.get(job.id) || { gross: 0, deduction: 0, net: 0 };
  const acc = data.accounts.find((a) => a.id === job.accountId);
  const earner = data.earners.find((e) => e.id === (job.earnerId || DEFAULT_EARNER_ID));
  const incomeDate = jobPayDate(job);

  const taxLabel = job.taxMode === 'malta'
    ? `−${fmt(calc.deduction)} svc`
    : `−${fmt(calc.deduction)} PAYE`;

  const confidenceDot = {
    confirmed: t.income,
    likely: t.accent,
    speculative: t.textFaint,
  }[job.confidence];

  return (
    <div style={styles.jobCard} onClick={() => setModal({ type: 'job', payload: job })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: confidenceDot }} />
          <div style={{ fontWeight: 500, fontSize: 15, color: t.text }}>{job.title || 'Untitled'}</div>
        </div>
        <Money value={calc.net} color={t.text} size={18} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
        <div className={privacy ? 'private-blur' : ''}>
          {job.days || 0}d × {fmt(job.dayRate)}
        </div>
        <div>pays {dayLabel(incomeDate)}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.textFaint, marginTop: 4 }}>
        <div className={privacy ? 'private-blur' : ''}>
          {data.earners.length > 1 ? `${earner?.name} · ` : ''}{taxLabel}
        </div>
        <div>→ {acc?.name || 'no account'}</div>
      </div>
    </div>
  );
}

function BillsContent({ data, viewData, setModal }) {
  const { styles, t, viewingAs } = useTheme();
  const [sortMode, setSortMode] = useState('date');  // 'date' or 'amount'

  // Classify each bill as 'mine' or 'household' based on its account ownership.
  // Always split into sections - household bills are conceptually distinct
  // even when viewing the whole household.
  const classified = useMemo(() => {
    const mine = [];
    const household = [];
    viewData.bills.forEach((b) => {
      const which = classifyBillOwnership(b, data.accounts, viewingAs);
      if (which === 'household') household.push(b);
      else mine.push(b);
    });
    return { mine, household };
  }, [viewData.bills, data.accounts, viewingAs]);

  const computeMonthlyEquivalent = (bills) => {
    let total = 0;
    bills.forEach((b) => {
      const amt = Number(b.amount) || 0;
      if (b.frequency === 'monthly') total += amt;
      else if (b.frequency === 'weekly') total += amt * 4.33;
      else if (b.frequency === 'yearly') total += amt / 12;
      // one-off excluded from monthly equivalent
    });
    return total;
  };

  const myMonthly = computeMonthlyEquivalent(classified.mine);
  const householdMonthly = computeMonthlyEquivalent(classified.household);
  const totalMonthly = myMonthly + householdMonthly;

  // Compute monthly-equivalent amount for sorting purposes (so weekly bills
  // are compared on a like-for-like basis with monthly bills)
  const monthlyEquiv = (b) => {
    const amt = Math.abs(Number(b.amount) || 0);
    if (b.frequency === 'monthly') return amt;
    if (b.frequency === 'weekly') return amt * 4.33;
    if (b.frequency === 'yearly') return amt / 12;
    return amt;  // one-off treated raw
  };

  const sortBills = (arr) => {
    if (sortMode === 'amount') {
      // Highest cost first, regardless of frequency
      return [...arr].sort((a, b) => monthlyEquiv(b) - monthlyEquiv(a));
    }
    // Chronological - by frequency group, then by day-of-month/date within group
    return [...arr].sort((a, b) => {
      const order = { monthly: 0, weekly: 1, yearly: 2, oneoff: 3 };
      const fa = order[a.frequency] ?? 9;
      const fb = order[b.frequency] ?? 9;
      if (fa !== fb) return fa - fb;
      if (a.frequency === 'monthly') return (a.dayOfMonth || 1) - (b.dayOfMonth || 1);
      if (a.frequency === 'oneoff' || a.frequency === 'yearly') {
        return new Date(a.date) - new Date(b.date);
      }
      return 0;
    });
  };

  // Always show split when there's content in both - section structure is
  // valuable for the household-vs-yours mental model regardless of view mode.
  const showSplit = classified.mine.length > 0 && classified.household.length > 0;

  return (
    <div>
      {/* Summary cards - split into mine + household when viewing as a single earner */}
      {showSplit ? (
        <div style={styles.summaryGrid3}>
          <SummaryCell label="Yours" value={fmt(myMonthly)} accent={t.accent} />
          <SummaryCell label="Household" value={fmt(householdMonthly)} accent={t.secondary} />
          <SummaryCell label="Total" value={fmt(totalMonthly)} />
        </div>
      ) : (
        <div style={styles.summaryGrid2}>
          <SummaryCell label="Monthly" value={fmt(totalMonthly)} />
          <SummaryCell label="Annualised" value={fmt(totalMonthly * 12)} />
        </div>
      )}

      {viewData.bills.length === 0 && (
        <div style={{ marginTop: 22 }}>
          <Empty msg="No bills yet. Tap + to add one." />
        </div>
      )}

      {viewData.bills.length > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 18,
            marginBottom: -8,
          }}
        >
          <span style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginRight: 4 }}>
            Sort:
          </span>
          <Toggle active={sortMode === 'date'} onClick={() => setSortMode('date')} small>
            Chronological
          </Toggle>
          <Toggle active={sortMode === 'amount'} onClick={() => setSortMode('amount')} small>
            By amount
          </Toggle>
        </div>
      )}

      {/* Sectioned bills - Yours first, then Household */}
      {showSplit ? (
        <>
          {classified.mine.length > 0 && (
            <BillSection
              title="Yours"
              monthlyTotal={myMonthly}
              bills={sortBills(classified.mine)}
              setModal={setModal}
              data={data}
            />
          )}
          {classified.household.length > 0 && (
            <BillSection
              title="Household"
              monthlyTotal={householdMonthly}
              bills={sortBills(classified.household)}
              setModal={setModal}
              data={data}
              isHousehold
            />
          )}
        </>
      ) : (
        <BillSection
          title="All bills"
          monthlyTotal={totalMonthly}
          bills={sortBills(viewData.bills)}
          setModal={setModal}
          data={data}
        />
      )}
    </div>
  );
}

function BillSection({ title, monthlyTotal, bills, setModal, data, isHousehold }) {
  const { t } = useTheme();
  return (
    <div style={{ marginTop: 22 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          paddingBottom: 6,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: t.textDim, fontWeight: 600 }}>
          {isHousehold && <Home size={11} style={{ color: t.secondary }} />}
          {title}
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: t.weightAmount, color: isHousehold ? t.secondary : t.accent }}>
          {fmt(monthlyTotal)}/mo
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bills.map((b) => <BillCard key={b.id} bill={b} setModal={setModal} data={data} hideOwnerIcon={isHousehold} />)}
      </div>
    </div>
  );
}

function MovementsContent({ data, viewData, setModal }) {
  const { styles, t } = useTheme();

  return (
    <div>
      <div style={{ marginTop: 4 }}>
        <div style={styles.sectionHead}>
          <h2 style={styles.h2}>Transfers</h2>
          <button style={styles.iconBtn} onClick={() => setModal({ type: 'transfer', payload: null })}>
            <Plus size={16} />
          </button>
        </div>
        {viewData.transfers.length === 0 && <Empty msg="Movements between your own accounts" small />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {viewData.transfers.map((tr) => <TransferCard key={tr.id} item={tr} setModal={setModal} data={data} />)}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={styles.sectionHead}>
          <h2 style={styles.h2}>Other income</h2>
          <button style={styles.iconBtn} onClick={() => setModal({ type: 'extincome', payload: null })}>
            <Plus size={16} />
          </button>
        </div>
        {viewData.externalIncome.length === 0 && <Empty msg="e.g. partner contributions to joint" small />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {viewData.externalIncome.map((e) => <ExtIncomeCard key={e.id} item={e} setModal={setModal} data={data} />)}
        </div>
      </div>
    </div>
  );
}

function BillCard({ bill, setModal, data, hideOwnerIcon }) {
  const { styles, t, privacy } = useTheme();
  const acc = data.accounts.find((a) => a.id === bill.accountId);
  const isHouseholdBill = !acc || acc.ownerId === 'household' || !acc.ownerId;
  const showIcon = isHouseholdBill && !hideOwnerIcon;
  const dateLabel = bill.frequency === 'oneoff' ? dayLabel(bill.date)
    : bill.frequency === 'monthly' ? `day ${bill.dayOfMonth || 1}`
    : bill.frequency === 'yearly' ? dayLabel(bill.date)
    : 'weekly';

  return (
    <div style={styles.billCard} onClick={() => setModal({ type: 'bill', payload: bill })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {showIcon && (
          <Home size={13} style={{ color: t.secondary, flexShrink: 0 }} title="Household bill" />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bill.name || 'Untitled'}
          </div>
          <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
            {dateLabel} · {acc?.name || 'no account'}
          </div>
        </div>
      </div>
      <Money value={bill.amount} sign="-" color={t.text} size={17} />
    </div>
  );
}

function TransferCard({ item, setModal, data }) {
  const { styles, t, privacy } = useTheme();
  const from = data.accounts.find((a) => a.id === item.fromAccountId);
  const to = data.accounts.find((a) => a.id === item.toAccountId);
  const dateLabel = item.frequency === 'oneoff' ? dayLabel(item.date)
    : item.frequency === 'monthly' ? `day ${item.dayOfMonth || 1}`
    : item.frequency;

  return (
    <div style={styles.billCard} onClick={() => setModal({ type: 'transfer', payload: item })}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, fontSize: 14, color: t.text }}>
          <span>{from?.name}</span>
          <ArrowRightLeft size={11} style={{ color: t.textDim }} />
          <span>{to?.name}</span>
        </div>
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>{dateLabel}</div>
      </div>
      <Money value={item.amount} color={t.textDim} size={17} />
    </div>
  );
}

function ExtIncomeCard({ item, setModal, data }) {
  const { styles, t } = useTheme();
  const acc = data.accounts.find((a) => a.id === item.accountId);
  const earner = data.earners.find((e) => e.id === (item.earnerId || DEFAULT_EARNER_ID));
  return (
    <div style={styles.billCard} onClick={() => setModal({ type: 'extincome', payload: item })}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 14, color: t.text }}>{item.name || 'Income'}</div>
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
          {data.earners.length > 1 ? `${earner?.name} · ` : ''}
          {item.frequency === 'monthly' ? `day ${item.dayOfMonth || 1}` : item.frequency} · → {acc?.name || 'no account'}
        </div>
      </div>
      <Money value={item.amount} sign="+" color={t.income} size={17} />
    </div>
  );
}
