import React, { useState, useMemo, useRef } from 'react';
import { Trash2, AlertCircle, Download, Upload, Sun, Moon, Smartphone, Eye, EyeOff, Contrast, Type, Home as HomeIcon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, uid, dayLabel, calendarDaysBetween, addDays } from '../lib/format.js';
import { generateEvents } from '../lib/projection.js';
import { previewJobTax, jobPayDate, calcAnnualHMRCTax, DEFAULT_EARNER_ID } from '../lib/tax.js';
import { ModalHeader, Field, Seg, OwnerSelector } from './atoms.jsx';
import { exportData, importDataFromFile, defaultData } from '../hooks/useStoredData.js';

export function Modal({ modal, setModal, data, update, setData }) {
  const { styles, isDesktop } = useTheme();
  const close = () => setModal(null);
  return (
    <div style={styles.modalOverlay} onClick={close}>
      <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
        {!isDesktop && <div style={styles.modalHandle} />}
        {modal.type === 'account' && <AccountForm item={modal.payload} data={data} update={update} close={close} />}
        {modal.type === 'reconcile' && <ReconcileForm acc={modal.payload} data={data} update={update} close={close} setModal={setModal} />}
        {modal.type === 'job' && <JobForm item={modal.payload} data={data} update={update} close={close} />}
        {modal.type === 'salary' && <SalaryForm item={modal.payload} data={data} update={update} close={close} />}
        {modal.type === 'workpicker' && <WorkPickerForm setModal={setModal} close={close} />}
        {modal.type === 'movementpicker' && <MovementPickerForm setModal={setModal} close={close} />}
        {modal.type === 'bill' && <BillForm item={modal.payload} data={data} update={update} close={close} />}
        {modal.type === 'extincome' && <ExtIncomeForm item={modal.payload} data={data} update={update} close={close} />}
        {modal.type === 'transfer' && <TransferForm item={modal.payload} data={data} update={update} close={close} />}
        {modal.type === 'asset' && <AssetForm item={modal.payload} update={update} close={close} />}
        {modal.type === 'earner' && <EarnerForm item={modal.payload} data={data} update={update} close={close} />}
        {modal.type === 'settings' && <SettingsForm data={data} update={update} setData={setData} close={close} setModal={setModal} />}
      </div>
    </div>
  );
}

function ReconcileForm({ acc, data, update, close, setModal }) {
  const { styles, t } = useTheme();
  const [newBalance, setNewBalance] = useState(acc.balance);

  const lastUpdate = new Date(acc.lastUpdated);
  const today = new Date();
  const daysSince = Math.max(0, Math.floor((today - lastUpdate) / (1000 * 60 * 60 * 24)));

  const events = useMemo(() => {
    if (daysSince === 0) return [];
    return generateEvents(data, lastUpdate, today).filter((e) => e.accountId === acc.id);
  }, [data, lastUpdate, today, acc.id, daysSince]);

  let expected = Number(acc.balance);
  events.forEach((e) => {
    expected += e.amount;
  });

  const variance = Number(newBalance) - expected;
  const hasVariance = Math.abs(variance) > 0.01;

  const submit = () => {
    update((d) => {
      const target = d.accounts.find((a) => a.id === acc.id);
      target.balance = Number(newBalance);
      target.lastUpdated = new Date().toISOString();
      d.reconciliations = d.reconciliations || [];
      d.reconciliations.push({
        id: uid(),
        accountId: acc.id,
        date: new Date().toISOString(),
        previousBalance: acc.balance,
        newBalance: Number(newBalance),
        expected,
        variance,
        daysSince,
      });
      d.reconciliations = d.reconciliations.slice(-50);
    });
    close();
  };

  return (
    <div>
      <ModalHeader title={acc.name} sub="Update balance" />
      <div style={styles.reconcileBox}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: t.textDim, marginBottom: 6 }}>
          Today's actual balance
        </div>
        <input type="number" step="0.01" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} style={styles.bigInput} autoFocus />
      </div>

      {daysSince > 0 && (
        <div style={{ marginTop: 16, padding: 14, background: t.bgInset, borderRadius: 12, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: t.textDim, marginBottom: 8 }}>
            Since last update · {daysSince}d ago
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
            <span style={{ color: t.textDim }}>Previous</span>
            <span style={{ color: t.text }}>{fmt(acc.balance)}</span>
          </div>
          {events.map((ev, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: t.textFaint }}>
              <span>{ev.amount > 0 ? '+' : '−'} {ev.label}</span>
              <span>{ev.amount > 0 ? '+' : '−'}{fmt(Math.abs(ev.amount))}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0 4px', borderTop: `1px solid ${t.border}`, marginTop: 4 }}>
            <span style={{ color: t.textDim }}>Expected</span>
            <span style={{ color: t.text }}>{fmt(expected)}</span>
          </div>
        </div>
      )}

      {hasVariance && daysSince > 0 && (
        <div style={{ marginTop: 14, padding: 14, background: variance < 0 ? t.expenseBg : t.incomeBg, border: `1px solid ${variance < 0 ? t.expense : t.income}`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={20} color={variance < 0 ? t.expense : t.income} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: t.text }}>
              {variance < 0 ? `Spent ${fmt(Math.abs(variance))} unplanned` : `${fmt(variance)} more than expected`}
            </div>
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 2 }}>
              over {daysSince}d · {fmt(Math.abs(variance) / daysSince)}/day
            </div>
          </div>
        </div>
      )}

      <div style={styles.formActions}>
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Update</button>
      </div>

      {setModal && (
        <button
          onClick={() => {
            close();
            setTimeout(() => setModal({ type: 'account', payload: acc }), 50);
          }}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '10px 14px',
            background: 'transparent',
            border: 'none',
            color: t.textDim,
            fontSize: 12,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Edit account details · rename · delete
        </button>
      )}
    </div>
  );
}

function AccountForm({ item, data, update, close }) {
  const { styles, t, viewingAs } = useTheme();
  const [name, setName] = useState(item?.name || '');
  const [balance, setBalance] = useState(item?.balance ?? 0);
  const [colorIdx, setColorIdx] = useState(item?.colorIdx ?? 0);
  // Default new account owner to the currently-viewed earner, falling back to household
  const [ownerId, setOwnerId] = useState(
    item?.ownerId || (viewingAs !== 'household' ? viewingAs : 'household')
  );

  const submit = () => {
    update((d) => {
      if (item) {
        const target = d.accounts.find((a) => a.id === item.id);
        const balanceChanged = Math.abs(Number(target.balance) - Number(balance)) > 0.001;
        target.name = name;
        target.balance = Number(balance);
        target.colorIdx = colorIdx;
        target.ownerId = ownerId;
        // If the user changed the balance, treat this as a reconciliation:
        // bump lastUpdated to now so the variance/expected calculation resets.
        // Otherwise the "expected" line on Home becomes nonsense - it'd add
        // stale events to the new balance.
        if (balanceChanged) {
          target.lastUpdated = new Date().toISOString();
        }
      } else {
        d.accounts.push({
          id: uid(),
          name,
          balance: Number(balance),
          colorIdx,
          ownerId,
          lastUpdated: new Date().toISOString(),
        });
      }
    });
    close();
  };

  const remove = () => {
    if (!confirm('Delete this account?')) return;
    update((d) => {
      d.accounts = d.accounts.filter((a) => a.id !== item.id);
    });
    close();
  };

  const showOwners = data.earners && data.earners.length > 0;

  return (
    <div>
      <ModalHeader title={item ? 'Edit account' : 'New account'} />
      <Field label="Name">
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Personal" />
      </Field>
      <Field label="Current balance">
        <input style={styles.input} type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} />
      </Field>
      {showOwners && (
        <Field label="Belongs to">
          <OwnerSelector value={ownerId} onChange={setOwnerId} earners={data.earners} />
        </Field>
      )}
      <Field label="Colour">
        <div style={{ display: 'flex', gap: 8 }}>
          {t.accountColors.map((c, i) => (
            <div
              key={i}
              onClick={() => setColorIdx(i)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: c,
                border: colorIdx === i ? `2px solid ${t.text}` : '2px solid transparent',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </Field>
      <div style={styles.formActions}>
        {item && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function EarnerSelector({ value, onChange, earners }) {
  const { styles } = useTheme();
  return (
    <div style={styles.segGroup}>
      {earners.map((e) => (
        <Seg key={e.id} active={value === e.id} onClick={() => onChange(e.id)}>
          {e.name}
        </Seg>
      ))}
    </div>
  );
}

function JobForm({ item, data, update, close }) {
  const { styles, t } = useTheme();
  const [title, setTitle] = useState(item?.title || '');
  const [client, setClient] = useState(item?.client || '');
  const [startDate, setStartDate] = useState(item?.startDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(item?.endDate || new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(item?.days ?? 1);
  const [dayRate, setDayRate] = useState(item?.dayRate ?? 0);
  const [taxMode, setTaxMode] = useState(item?.taxMode || 'malta');
  const [serviceChargePercent, setServiceChargePercent] = useState(item?.serviceChargePercent ?? 6);
  const [confidence, setConfidence] = useState(item?.confidence || 'confirmed');
  const [accountId, setAccountId] = useState(item?.accountId || data.accounts[0]?.id);
  const [payMode, setPayMode] = useState(item?.payMode || 'end');
  const [payDate, setPayDate] = useState(item?.payDate || '');
  const [earnerId, setEarnerId] = useState(item?.earnerId || DEFAULT_EARNER_ID);
  const [lastEdit, setLastEdit] = useState(null);

  const onStartChange = (v) => {
    setStartDate(v);
    setLastEdit('start');
    if (v && endDate) {
      const newDays = calendarDaysBetween(v, endDate);
      if (newDays > 0) setDays(newDays);
    }
  };

  const onEndChange = (v) => {
    setEndDate(v);
    setLastEdit('end');
    if (startDate && v) {
      const newDays = calendarDaysBetween(startDate, v);
      if (newDays > 0) setDays(newDays);
    }
  };

  const onDaysChange = (v) => {
    setDays(v);
    setLastEdit('days');
    const n = Number(v);
    if (n > 0 && startDate) {
      const newEnd = addDays(new Date(startDate), n - 1);
      setEndDate(newEnd.toISOString().slice(0, 10));
    }
  };

  const preview = previewJobTax(
    {
      id: item?.id || 'preview',
      days: Number(days) || 0,
      dayRate: Number(dayRate) || 0,
      taxMode,
      serviceChargePercent: Number(serviceChargePercent) || 0,
      payMode,
      payDate,
      endDate,
      startDate,
      earnerId,
    },
    data.jobs
  );

  const submit = () => {
    const obj = {
      title, client, startDate, endDate,
      days: Number(days), dayRate: Number(dayRate),
      taxMode, serviceChargePercent: Number(serviceChargePercent),
      confidence, accountId, payMode, payDate, earnerId,
    };
    update((d) => {
      if (item) {
        const idx = d.jobs.findIndex((j) => j.id === item.id);
        d.jobs[idx] = { ...item, ...obj };
      } else {
        d.jobs.push({ id: uid(), ...obj });
      }
    });
    close();
  };

  const remove = () => {
    if (!confirm('Delete this job?')) return;
    update((d) => {
      d.jobs = d.jobs.filter((j) => j.id !== item.id);
    });
    close();
  };

  const showEarners = data.earners && data.earners.length > 1;

  return (
    <div>
      <ModalHeader title={item ? 'Edit job' : 'New job'} />

      {showEarners && (
        <Field label="For">
          <EarnerSelector value={earnerId} onChange={setEarnerId} earners={data.earners} />
        </Field>
      )}

      <Field label="Title">
        <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Studio session" />
      </Field>
      <Field label="Client">
        <input style={styles.input} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Optional" />
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Start">
          <input style={styles.input} type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} />
        </Field>
        <Field label="End">
          <input style={styles.input} type="date" value={endDate} onChange={(e) => onEndChange(e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Days">
          <input style={styles.input} type="number" step="0.5" value={days} onChange={(e) => onDaysChange(e.target.value)} />
        </Field>
        <Field label="Day rate (£)">
          <input style={styles.input} type="number" step="1" value={dayRate} onChange={(e) => setDayRate(e.target.value)} />
        </Field>
      </div>

      <div style={{ fontSize: 10, color: t.textFaint, marginTop: -8, marginBottom: 12, fontStyle: 'italic' }}>
        {lastEdit === 'days' ? 'end date set from days' : lastEdit === 'end' || lastEdit === 'start' ? 'days set from dates' : 'edit dates or days — the other will recalculate'}
      </div>

      <Field label="Payment type">
        <div style={styles.segGroup}>
          <Seg active={taxMode === 'malta'} onClick={() => setTaxMode('malta')}>Malta</Seg>
          <Seg active={taxMode === 'paye'} onClick={() => setTaxMode('paye')}>PAYE</Seg>
        </div>
      </Field>

      {taxMode === 'malta' && (
        <Field label="Service charge %">
          <input style={styles.input} type="number" step="0.1" value={serviceChargePercent} onChange={(e) => setServiceChargePercent(e.target.value)} />
          <div style={{ fontSize: 10, color: t.textFaint, marginTop: 4, fontStyle: 'italic' }}>
            Umbrella's fee deducted from gross. No UK tax/NI. Class 2 voluntary at year-end.
          </div>
        </Field>
      )}

      {taxMode === 'paye' && (
        <div style={{ fontSize: 11, color: t.textFaint, marginTop: -8, marginBottom: 14, padding: '8px 12px', background: t.bgInset, borderRadius: 8 }}>
          Cumulative Income Tax + Class 1 NI based on prior PAYE for {data.earners.find((e) => e.id === earnerId)?.name || 'this earner'} this tax year.
        </div>
      )}

      <Field label="Confidence">
        <div style={styles.segGroup}>
          <Seg active={confidence === 'confirmed'} onClick={() => setConfidence('confirmed')}>Confirmed</Seg>
          <Seg active={confidence === 'likely'} onClick={() => setConfidence('likely')}>Likely</Seg>
          <Seg active={confidence === 'speculative'} onClick={() => setConfidence('speculative')}>Spec</Seg>
        </div>
      </Field>

      <Field label="Pays into">
        <select style={styles.input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      <Field label="When paid">
        <div style={styles.segGroup}>
          <Seg active={payMode === 'end'} onClick={() => setPayMode('end')}>End date</Seg>
          <Seg active={payMode === 'custom'} onClick={() => setPayMode('custom')}>Custom</Seg>
        </div>
      </Field>
      {payMode === 'custom' && (
        <Field label="Pay date">
          <input style={styles.input} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
      )}

      <div style={styles.previewBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
          <span>Gross</span><span>{fmt(preview.gross)}</span>
        </div>
        {preview.breakdown.serviceCharge > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
            <span>Service charge</span><span>−{fmt(preview.breakdown.serviceCharge)}</span>
          </div>
        )}
        {preview.breakdown.incomeTax > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
            <span>Income tax</span><span>−{fmt(preview.breakdown.incomeTax)}</span>
          </div>
        )}
        {preview.breakdown.ni > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
            <span>Class 1 NI</span><span>−{fmt(preview.breakdown.ni)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 500, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${t.border}`, color: t.text }}>
          <span>Net</span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22 }}>{fmt(preview.net)}</span>
        </div>
        {taxMode === 'paye' && (
          <div style={{ fontSize: 10, color: t.textFaint, marginTop: 6, fontStyle: 'italic' }}>
            depends on cumulative position when this pays
          </div>
        )}
      </div>

      <div style={styles.formActions}>
        {item && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function WorkPickerForm({ setModal, close }) {
  const { styles, t } = useTheme();

  const choose = (type) => {
    close();
    setTimeout(() => setModal({ type, payload: null }), 50);
  };

  return (
    <div>
      <ModalHeader title="Add new work" sub="What kind of income are you adding?" />

      <button
        onClick={() => choose('job')}
        style={{
          width: '100%',
          padding: '18px 16px',
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          marginBottom: 10,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ color: t.text, fontWeight: 600, fontSize: 16 }}>Freelance job</div>
        <div style={{ color: t.textDim, fontSize: 12 }}>One-off work — day rate × days. Malta or PAYE tax.</div>
      </button>

      <button
        onClick={() => choose('salary')}
        style={{
          width: '100%',
          padding: '18px 16px',
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          marginBottom: 10,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ color: t.text, fontWeight: 600, fontSize: 16 }}>Regular salary</div>
        <div style={{ color: t.textDim, fontSize: 12 }}>Annual gross paid monthly/weekly. Cumulative PAYE.</div>
      </button>

      <div style={styles.formActions}>
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

function MovementPickerForm({ setModal, close }) {
  const { styles, t } = useTheme();

  const choose = (type) => {
    close();
    setTimeout(() => setModal({ type, payload: null }), 50);
  };

  return (
    <div>
      <ModalHeader title="Add new movement" sub="Money flowing through your accounts" />

      <button
        onClick={() => choose('transfer')}
        style={{
          width: '100%',
          padding: '18px 16px',
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          marginBottom: 10,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ color: t.text, fontWeight: 600, fontSize: 16 }}>Transfer</div>
        <div style={{ color: t.textDim, fontSize: 12 }}>Move money between your own accounts (standing order).</div>
      </button>

      <button
        onClick={() => choose('extincome')}
        style={{
          width: '100%',
          padding: '18px 16px',
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          marginBottom: 10,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ color: t.text, fontWeight: 600, fontSize: 16 }}>Other income</div>
        <div style={{ color: t.textDim, fontSize: 12 }}>External money in — e.g. partner's contribution to joint.</div>
      </button>

      <div style={styles.formActions}>
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
      </div>
    </div>
  );
}

function SalaryForm({ item, data, update, close }) {
  const { styles, t } = useTheme();
  const [name, setName] = useState(item?.name || '');
  const [annualGross, setAnnualGross] = useState(item?.annualGross ?? 0);
  const [frequency, setFrequency] = useState(item?.frequency || 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(item?.dayOfMonth ?? 25);
  const [startDate, setStartDate] = useState(item?.startDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(item?.endDate || '');
  const [accountId, setAccountId] = useState(item?.accountId || data.accounts[0]?.id);
  const [earnerId, setEarnerId] = useState(item?.earnerId || data.earners[0]?.id || DEFAULT_EARNER_ID);

  const annual = Number(annualGross) || 0;
  const tax = calcAnnualHMRCTax(annual);
  const monthlyGross = frequency === 'monthly' ? annual / 12 : frequency === 'weekly' ? annual / 52 : annual / 13;
  const monthlyTax = tax.total / (frequency === 'monthly' ? 12 : frequency === 'weekly' ? 52 : 13);

  const submit = () => {
    const obj = {
      name, annualGross: Number(annualGross), frequency,
      dayOfMonth: Number(dayOfMonth), startDate, endDate: endDate || null,
      accountId, earnerId,
    };
    update((d) => {
      if (!d.salaries) d.salaries = [];
      if (item) {
        const idx = d.salaries.findIndex((s) => s.id === item.id);
        d.salaries[idx] = { ...item, ...obj };
      } else {
        d.salaries.push({ id: uid(), ...obj });
      }
    });
    close();
  };

  const remove = () => {
    if (!confirm('Delete this salary?')) return;
    update((d) => {
      d.salaries = (d.salaries || []).filter((s) => s.id !== item.id);
    });
    close();
  };

  const showEarners = data.earners && data.earners.length > 1;

  return (
    <div>
      <ModalHeader title={item ? 'Edit salary' : 'New salary'} sub="Regular employed income (PAYE)" />

      {showEarners && (
        <Field label="Earner">
          <EarnerSelector value={earnerId} onChange={setEarnerId} earners={data.earners} />
        </Field>
      )}

      <Field label="Name">
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="ACME Co — full time" />
      </Field>
      <Field label="Annual gross (£)">
        <input style={styles.input} type="number" step="100" value={annualGross} onChange={(e) => setAnnualGross(e.target.value)} />
      </Field>
      <Field label="Pay frequency">
        <div style={styles.segGroup}>
          <Seg active={frequency === 'monthly'} onClick={() => setFrequency('monthly')}>Monthly</Seg>
          <Seg active={frequency === 'fourweekly'} onClick={() => setFrequency('fourweekly')}>4-weekly</Seg>
          <Seg active={frequency === 'weekly'} onClick={() => setFrequency('weekly')}>Weekly</Seg>
        </div>
      </Field>
      {frequency === 'monthly' && (
        <Field label="Pay day of month">
          <input style={styles.input} type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </Field>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Started">
          <input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Ends (optional)">
          <input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Pays into">
        <select style={styles.input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      <div style={styles.previewBox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
          <span>Annual gross</span><span>{fmt(annual)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
          <span>Income tax (annual)</span><span>−{fmt(tax.incomeTax)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.textDim }}>
          <span>NI (annual)</span><span>−{fmt(tax.ni)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${t.border}`, color: t.text }}>
          <span>Per pay (net)</span>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{fmt(monthlyGross - monthlyTax)}</span>
        </div>
      </div>

      <div style={styles.formActions}>
        {item && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function BillForm({ item, data, update, close }) {
  const { styles, viewingAs, t } = useTheme();
  const [name, setName] = useState(item?.name || '');
  const [amount, setAmount] = useState(item?.amount ?? 0);
  const [frequency, setFrequency] = useState(item?.frequency || 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(item?.dayOfMonth ?? 1);
  const [date, setDate] = useState(item?.date || new Date().toISOString().slice(0, 10));
  // Default account: if viewing as a specific earner, default to one of their accounts;
  // otherwise default to the first account
  const defaultAccount = useMemo(() => {
    if (item?.accountId) return item.accountId;
    if (viewingAs !== 'household') {
      const own = data.accounts.find((a) => a.ownerId === viewingAs);
      if (own) return own.id;
    }
    return data.accounts[0]?.id;
  }, [item, viewingAs, data.accounts]);
  const [accountId, setAccountId] = useState(defaultAccount);
  const [category, setCategory] = useState(item?.category || '');

  const submit = () => {
    const obj = { name, amount: Number(amount), frequency, dayOfMonth: Number(dayOfMonth), date, accountId, category };
    update((d) => {
      if (item) {
        const idx = d.bills.findIndex((b) => b.id === item.id);
        // Strip any legacy ownerId
        const { ownerId, ...keep } = d.bills[idx];
        d.bills[idx] = { ...keep, ...obj };
      } else {
        d.bills.push({ id: uid(), ...obj });
      }
    });
    close();
  };

  const remove = () => {
    if (!confirm('Delete this bill?')) return;
    update((d) => { d.bills = d.bills.filter((b) => b.id !== item.id); });
    close();
  };

  // Helper to show whose bill this becomes based on selected account
  const selectedAccount = data.accounts.find((a) => a.id === accountId);
  const ownerLabel = (() => {
    if (!selectedAccount) return null;
    if (selectedAccount.ownerId === 'household' || !selectedAccount.ownerId) return 'Household bill';
    const earner = data.earners.find((e) => e.id === selectedAccount.ownerId);
    return earner ? `${earner.name}'s bill` : null;
  })();

  return (
    <div>
      <ModalHeader title={item ? 'Edit bill' : 'New bill'} />
      <Field label="Name">
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mortgage" />
      </Field>
      <Field label="Amount (£)">
        <input style={styles.input} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Frequency">
        <div style={styles.segGroup}>
          <Seg active={frequency === 'monthly'} onClick={() => setFrequency('monthly')}>Monthly</Seg>
          <Seg active={frequency === 'weekly'} onClick={() => setFrequency('weekly')}>Weekly</Seg>
          <Seg active={frequency === 'yearly'} onClick={() => setFrequency('yearly')}>Yearly</Seg>
          <Seg active={frequency === 'oneoff'} onClick={() => setFrequency('oneoff')}>One-off</Seg>
        </div>
      </Field>
      {frequency === 'monthly' && (
        <Field label="Day of month">
          <input style={styles.input} type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </Field>
      )}
      {(frequency === 'oneoff' || frequency === 'yearly') && (
        <Field label="Date">
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <Field label="Pays from">
        <select style={styles.input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {ownerLabel && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: ownerLabel === 'Household bill' ? t.secondarySoft : t.accentSoft,
              border: `1px solid ${ownerLabel === 'Household bill' ? t.secondary + '55' : t.accent + '55'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: ownerLabel === 'Household bill' ? t.secondary : t.accent,
              fontWeight: 600,
            }}
          >
            {ownerLabel === 'Household bill' && <HomeIcon size={13} />}
            {ownerLabel}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: t.textFaint, fontWeight: 500, fontStyle: 'italic' }}>
              change account to reassign
            </span>
          </div>
        )}
      </Field>
      <Field label="Category">
        <input style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optional" />
      </Field>
      <div style={styles.formActions}>
        {item && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function ExtIncomeForm({ item, data, update, close }) {
  const { styles } = useTheme();
  const [name, setName] = useState(item?.name || '');
  const [amount, setAmount] = useState(item?.amount ?? 0);
  const [frequency, setFrequency] = useState(item?.frequency || 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(item?.dayOfMonth ?? 1);
  const [date, setDate] = useState(item?.date || new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(item?.accountId || data.accounts[0]?.id);
  const [earnerId, setEarnerId] = useState(item?.earnerId || DEFAULT_EARNER_ID);

  const submit = () => {
    const obj = { name, amount: Number(amount), frequency, dayOfMonth: Number(dayOfMonth), date, accountId, earnerId };
    update((d) => {
      if (item) {
        const idx = d.externalIncome.findIndex((e) => e.id === item.id);
        d.externalIncome[idx] = { ...item, ...obj };
      } else {
        d.externalIncome.push({ id: uid(), ...obj });
      }
    });
    close();
  };

  const remove = () => {
    if (!confirm('Delete this income source?')) return;
    update((d) => { d.externalIncome = d.externalIncome.filter((e) => e.id !== item.id); });
    close();
  };

  const showEarners = data.earners && data.earners.length > 1;

  return (
    <div>
      <ModalHeader title={item ? 'Edit income' : 'New income source'} sub="External recurring money in" />
      {showEarners && (
        <Field label="For">
          <EarnerSelector value={earnerId} onChange={setEarnerId} earners={data.earners} />
        </Field>
      )}
      <Field label="Name">
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Wife — joint contribution" />
      </Field>
      <Field label="Amount (£)">
        <input style={styles.input} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Frequency">
        <div style={styles.segGroup}>
          <Seg active={frequency === 'monthly'} onClick={() => setFrequency('monthly')}>Monthly</Seg>
          <Seg active={frequency === 'weekly'} onClick={() => setFrequency('weekly')}>Weekly</Seg>
          <Seg active={frequency === 'oneoff'} onClick={() => setFrequency('oneoff')}>One-off</Seg>
        </div>
      </Field>
      {frequency === 'monthly' && (
        <Field label="Day of month">
          <input style={styles.input} type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </Field>
      )}
      {frequency === 'oneoff' && (
        <Field label="Date">
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <Field label="Pays into">
        <select style={styles.input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <div style={styles.formActions}>
        {item && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function TransferForm({ item, data, update, close }) {
  const { styles } = useTheme();
  const [amount, setAmount] = useState(item?.amount ?? 0);
  const [fromAccountId, setFromAccountId] = useState(item?.fromAccountId || data.accounts[0]?.id);
  const [toAccountId, setToAccountId] = useState(item?.toAccountId || data.accounts[1]?.id);
  const [frequency, setFrequency] = useState(item?.frequency || 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(item?.dayOfMonth ?? 1);
  const [date, setDate] = useState(item?.date || new Date().toISOString().slice(0, 10));

  const submit = () => {
    if (fromAccountId === toAccountId) { alert('From and To must differ'); return; }
    const obj = { amount: Number(amount), fromAccountId, toAccountId, frequency, dayOfMonth: Number(dayOfMonth), date };
    update((d) => {
      if (item) {
        const idx = d.transfers.findIndex((tr) => tr.id === item.id);
        d.transfers[idx] = { ...item, ...obj };
      } else {
        d.transfers.push({ id: uid(), ...obj });
      }
    });
    close();
  };

  const remove = () => {
    if (!confirm('Delete this transfer?')) return;
    update((d) => { d.transfers = d.transfers.filter((tr) => tr.id !== item.id); });
    close();
  };

  return (
    <div>
      <ModalHeader title={item ? 'Edit transfer' : 'New transfer'} sub="Standing order between your accounts" />
      <Field label="Amount (£)">
        <input style={styles.input} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="From">
          <select style={styles.input} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="To">
          <select style={styles.input} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Frequency">
        <div style={styles.segGroup}>
          <Seg active={frequency === 'monthly'} onClick={() => setFrequency('monthly')}>Monthly</Seg>
          <Seg active={frequency === 'weekly'} onClick={() => setFrequency('weekly')}>Weekly</Seg>
          <Seg active={frequency === 'oneoff'} onClick={() => setFrequency('oneoff')}>One-off</Seg>
        </div>
      </Field>
      {frequency === 'monthly' && (
        <Field label="Day of month">
          <input style={styles.input} type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </Field>
      )}
      {frequency === 'oneoff' && (
        <Field label="Date">
          <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <div style={styles.formActions}>
        {item && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function AssetForm({ item, update, close }) {
  const { styles } = useTheme();
  const [name, setName] = useState(item?.name || '');
  const [value, setValue] = useState(item?.value ?? 0);
  const [category, setCategory] = useState(item?.category || 'other');
  const cats = ['property', 'pension', 'shares', 'crypto', 'gold', 'vehicle', 'other'];

  const submit = () => {
    update((d) => {
      if (item) {
        const idx = d.assets.findIndex((a) => a.id === item.id);
        d.assets[idx] = { ...item, name, value: Number(value), category };
      } else {
        d.assets.push({ id: uid(), name, value: Number(value), category });
      }
    });
    close();
  };

  const remove = () => {
    if (!confirm('Delete this asset?')) return;
    update((d) => { d.assets = d.assets.filter((a) => a.id !== item.id); });
    close();
  };

  return (
    <div>
      <ModalHeader title={item ? 'Edit asset' : 'New asset'} sub="Things you could liquidate or that hold long-term value" />
      <Field label="Name">
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="House, ISA, car..." />
      </Field>
      <Field label="Value (£)">
        <input style={styles.input} type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Field label="Category">
        <div style={{ ...styles.segGroup, flexWrap: 'wrap' }}>
          {cats.map((c) => <Seg key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Seg>)}
        </div>
      </Field>
      <div style={styles.formActions}>
        {item && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function EarnerForm({ item, data, update, close }) {
  const { styles } = useTheme();
  const [name, setName] = useState(item?.name || '');

  const submit = () => {
    if (!name.trim()) return;
    update((d) => {
      if (item) {
        const target = d.earners.find((e) => e.id === item.id);
        target.name = name;
      } else {
        d.earners.push({ id: uid(), name, isPrimary: false });
      }
    });
    close();
  };

  const remove = () => {
    if (item.isPrimary) { alert('Cannot delete primary earner'); return; }
    if (!confirm(`Delete ${item.name}? Income tagged to them will become un-tagged.`)) return;
    update((d) => {
      d.earners = d.earners.filter((e) => e.id !== item.id);
      d.jobs.forEach((j) => { if (j.earnerId === item.id) j.earnerId = DEFAULT_EARNER_ID; });
      d.salaries = (d.salaries || []).filter((s) => s.earnerId !== item.id);
      d.externalIncome.forEach((e) => { if (e.earnerId === item.id) e.earnerId = DEFAULT_EARNER_ID; });
    });
    close();
  };

  return (
    <div>
      <ModalHeader title={item ? 'Edit earner' : 'Add earner'} sub="A separate person whose tax is calculated independently" />
      <Field label="Name">
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Her name" autoFocus />
      </Field>
      <div style={styles.formActions}>
        {item && !item.isPrimary && <button style={styles.btnDanger} onClick={remove}><Trash2 size={14} /></button>}
        <button style={styles.btnGhost} onClick={close}>Cancel</button>
        <button style={styles.btnPrimary} onClick={submit}>Save</button>
      </div>
    </div>
  );
}

function SettingsForm({ data, update, setData, close, setModal }) {
  const { styles, t, settings, setTheme, setTextScale, privacy, togglePrivacy, textScale } = useTheme();
  const fileRef = useRef(null);

  const onExport = () => exportData(data);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importDataFromFile(file);
      if (!imported.accounts || !Array.isArray(imported.accounts)) {
        alert('That doesn\'t look like a valid Cash Flow export');
        return;
      }
      if (!confirm(`Import ${imported.accounts.length} accounts, ${imported.jobs?.length || 0} jobs, ${imported.bills?.length || 0} bills, ${imported.salaries?.length || 0} salaries? This replaces your current data.`)) return;
      setData(imported);
      close();
    } catch (err) {
      alert('Could not parse file: ' + err.message);
    }
  };

  const onReset = () => {
    if (!confirm('Wipe all data and start over? This cannot be undone.')) return;
    setData({ ...defaultData, accounts: defaultData.accounts.map((a) => ({ ...a, lastUpdated: new Date().toISOString() })) });
    close();
  };

  return (
    <div>
      <ModalHeader title="Settings" />

      {/* Theme */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim, marginBottom: 10, fontWeight: 600 }}>Theme</div>
        <div style={{ ...styles.segGroup, flexWrap: 'wrap' }}>
          <Seg active={settings.theme === 'dark'} onClick={() => setTheme('dark')}>
            <Moon size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Dark
          </Seg>
          <Seg active={settings.theme === 'light'} onClick={() => setTheme('light')}>
            <Sun size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Light
          </Seg>
          <Seg active={settings.theme === 'auto'} onClick={() => setTheme('auto')}>
            <Smartphone size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> Auto
          </Seg>
        </div>
        <div style={{ marginTop: 6 }}>
          <Seg active={settings.theme === 'hicontrast'} onClick={() => setTheme('hicontrast')}>
            <Contrast size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> High contrast (accessibility)
          </Seg>
        </div>
      </div>

      {/* Text size */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim, marginBottom: 10, fontWeight: 600 }}>
          <Type size={11} style={{ marginRight: 4, verticalAlign: -1 }} />
          Text size
        </div>
        <div style={styles.segGroup}>
          <Seg active={textScale === 0.9} onClick={() => setTextScale(0.9)}>Small</Seg>
          <Seg active={textScale === 1.0} onClick={() => setTextScale(1.0)}>Default</Seg>
          <Seg active={textScale === 1.15} onClick={() => setTextScale(1.15)}>Large</Seg>
          <Seg active={textScale === 1.3} onClick={() => setTextScale(1.3)}>X-Large</Seg>
        </div>
      </div>

      {/* Privacy */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim, marginBottom: 10 }}>Privacy</div>
        <button
          onClick={togglePrivacy}
          style={{
            width: '100%',
            padding: '12px 14px',
            background: privacy ? t.accentSoft : 'transparent',
            color: privacy ? t.accent : t.text,
            border: `1px solid ${privacy ? t.accent : t.border}`,
            borderRadius: 10,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {privacy ? <EyeOff size={14} /> : <Eye size={14} />}
            Hide all amounts
          </span>
          <span style={{ fontSize: 11, color: t.textDim }}>
            {privacy ? 'on' : 'off'}
          </span>
        </button>
      </div>

      {/* Earners */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim }}>Earners</div>
          <button
            onClick={() => setModal({ type: 'earner', payload: null })}
            style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, cursor: 'pointer' }}
          >
            + Add
          </button>
        </div>
        {data.earners.map((e) => (
          <div
            key={e.id}
            onClick={() => setModal({ type: 'earner', payload: e })}
            style={{
              padding: '10px 14px',
              background: t.bgElev,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              marginBottom: 6,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ color: t.text }}>{e.name}</span>
            {e.isPrimary && <span style={{ fontSize: 11, color: t.textFaint }}>primary</span>}
          </div>
        ))}
      </div>

      {/* Data */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim, marginBottom: 8 }}>Data</div>
        <div style={{ fontSize: 12, color: t.textFaint, marginBottom: 12, lineHeight: 1.5 }}>
          Export to back up or share with your partner. Import a file to replace your data.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ ...styles.btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={onExport}>
            <Download size={14} /> Export
          </button>
          <button style={{ ...styles.btnGhost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Import
          </button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onImport} />
        </div>
      </div>

      {/* Diagnostics - quick view of data integrity */}
      <Diagnostics data={data} update={update} />

      <div style={{ marginTop: 28, padding: 14, background: t.expenseBg, border: `1px solid ${t.expense}`, borderRadius: 12 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.expense, marginBottom: 6 }}>Danger</div>
        <button style={{ ...styles.btnDanger, width: '100%', justifyContent: 'flex-start', padding: '10px 14px' }} onClick={onReset}>
          Reset all data
        </button>
      </div>

      <div style={styles.formActions}>
        <button style={styles.btnPrimary} onClick={close}>Done</button>
      </div>
    </div>
  );
}

// Diagnostics panel - shows accounts and their ownership tags so the user can
// spot misconfigurations and fix them inline without needing to re-import data.
function Diagnostics({ data, update }) {
  const { styles, t } = useTheme();
  const [open, setOpen] = useState(false);

  const earners = data.earners || [];
  const accounts = data.accounts || [];

  // Detect anomalies
  const validOwnerIds = new Set(['household', ...earners.map((e) => e.id)]);
  const issues = [];
  accounts.forEach((a) => {
    if (!a.ownerId) {
      issues.push({ accId: a.id, msg: `${a.name} has no owner tag` });
    } else if (!validOwnerIds.has(a.ownerId)) {
      issues.push({ accId: a.id, msg: `${a.name} is tagged "${a.ownerId}" but no such earner exists` });
    }
  });

  const allHousehold = accounts.length > 0 && accounts.every((a) => !a.ownerId || a.ownerId === 'household');
  const hasMultipleEarners = earners.length >= 1;
  if (allHousehold && hasMultipleEarners) {
    issues.push({ accId: null, msg: 'All accounts are tagged household. Personal/Joint split won\'t work until at least one account is assigned to a specific person.' });
  }

  const setOwner = (accId, newOwner) => {
    update((d) => {
      const acc = d.accounts.find((a) => a.id === accId);
      if (acc) acc.ownerId = newOwner;
    });
  };

  return (
    <div style={{ marginTop: 22 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          color: t.text,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.3,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          Diagnostics
          {issues.length > 0 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 10,
                padding: '2px 7px',
                borderRadius: 999,
                background: t.expenseBg,
                color: t.expense,
                fontWeight: 700,
              }}
            >
              {issues.length} issue{issues.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span style={{ fontSize: 11, color: t.textFaint }}>{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div style={{ padding: '12px 14px', background: t.bgInset || t.bgElev, border: `1px solid ${t.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px', fontSize: 12 }}>
          {/* Earners list */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
              Earners ({earners.length})
            </div>
            {earners.length === 0 ? (
              <div style={{ color: t.textFaint, fontStyle: 'italic' }}>No earners defined.</div>
            ) : (
              earners.map((e) => (
                <div key={e.id} style={{ color: t.textDim, fontSize: 12, marginBottom: 2 }}>
                  • {e.name} <span style={{ color: t.textFaint, fontFamily: 'monospace', fontSize: 10 }}>({e.id})</span>
                </div>
              ))
            )}
          </div>

          {/* Accounts list with current ownership */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
              Account ownership
            </div>
            {accounts.length === 0 ? (
              <div style={{ color: t.textFaint, fontStyle: 'italic' }}>No accounts.</div>
            ) : (
              accounts.map((a) => {
                const ownerLabel = !a.ownerId
                  ? '(no owner — defaults to household)'
                  : a.ownerId === 'household'
                    ? 'Household'
                    : (earners.find((e) => e.id === a.ownerId)?.name || `Unknown: ${a.ownerId}`);
                const isProblem = !a.ownerId || (a.ownerId !== 'household' && !earners.find((e) => e.id === a.ownerId));
                return (
                  <div
                    key={a.id}
                    style={{
                      padding: '8px 10px',
                      marginBottom: 6,
                      background: t.bg,
                      border: `1px solid ${isProblem ? t.expense + '66' : t.border}`,
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: t.text, fontSize: 13 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: isProblem ? t.expense : t.textDim }}>
                        {ownerLabel}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <button
                        onClick={() => setOwner(a.id, 'household')}
                        style={{
                          padding: '3px 8px',
                          fontSize: 10,
                          fontWeight: 600,
                          background: a.ownerId === 'household' ? t.accent : 'transparent',
                          color: a.ownerId === 'household' ? '#fff' : t.textDim,
                          border: `1px solid ${a.ownerId === 'household' ? t.accent : t.border}`,
                          borderRadius: 999,
                          cursor: 'pointer',
                        }}
                      >
                        Household
                      </button>
                      {earners.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setOwner(a.id, e.id)}
                          style={{
                            padding: '3px 8px',
                            fontSize: 10,
                            fontWeight: 600,
                            background: a.ownerId === e.id ? t.accent : 'transparent',
                            color: a.ownerId === e.id ? '#fff' : t.textDim,
                            border: `1px solid ${a.ownerId === e.id ? t.accent : t.border}`,
                            borderRadius: 999,
                            cursor: 'pointer',
                          }}
                        >
                          {e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Issues */}
          {issues.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: t.expense, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
                Detected issues
              </div>
              {issues.map((iss, i) => (
                <div key={i} style={{ color: t.expense, fontSize: 11, marginBottom: 4, paddingLeft: 8 }}>
                  • {iss.msg}
                </div>
              ))}
            </div>
          )}

          {/* Storage info */}
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${t.border}`, fontSize: 10, color: t.textFaint }}>
            Schema v{data.schemaVersion} ·{' '}
            {accounts.length} account{accounts.length === 1 ? '' : 's'} ·{' '}
            {(data.bills || []).length} bill{(data.bills || []).length === 1 ? '' : 's'} ·{' '}
            {(data.jobs || []).length} job{(data.jobs || []).length === 1 ? '' : 's'} ·{' '}
            {(data.transfers || []).length} transfer{(data.transfers || []).length === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
}
