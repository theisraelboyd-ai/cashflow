import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Home as HomeIcon } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { startOfMonth, endOfMonth, addMonths, monthLongLabel, dateKey, sameDay, fmtShort, dayLabel, fmt } from '../lib/format.js';
import { generateEvents } from '../lib/projection.js';
import { applyViewFilter } from '../lib/viewFilter.js';
import { PageHeader, Money, ViewingAsSwitch } from './atoms.jsx';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function CalendarPage({ data, setModal }) {
  const { styles, t, privacy, togglePrivacy, viewingAs } = useTheme();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const viewData = useMemo(() => applyViewFilter(data, viewingAs), [data, viewingAs]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  const events = useMemo(
    () => generateEvents(viewData, monthStart, monthEnd, { includeSpeculative: true, likelyWeight: 1.0 }),
    [viewData, cursor]
  );

  // Working days
  const workDays = useMemo(() => {
    const set = new Set();
    (viewData.jobs || []).forEach((job) => {
      if (!job.startDate) return;
      const s = new Date(job.startDate);
      const e = new Date(job.endDate || job.startDate);
      const cur = new Date(s);
      cur.setHours(0, 0, 0, 0);
      while (cur <= e) {
        if (cur >= monthStart && cur <= monthEnd) {
          set.add(dateKey(cur));
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
    return set;
  }, [viewData.jobs, monthStart, monthEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    events.forEach((ev) => {
      const k = dateKey(ev.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    });
    return map;
  }, [events]);

  const grid = useMemo(() => {
    const firstDay = new Date(monthStart);
    const offset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - offset);
    const cells = [];
    const cur = new Date(gridStart);
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return cells;
  }, [monthStart]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthIncome = events.filter((e) => e.amount > 0 && e.type !== 'transfer-in').reduce((s, e) => s + e.amount, 0);
  const monthOut = events.filter((e) => e.amount < 0 && e.type !== 'transfer-out').reduce((s, e) => s + Math.abs(e.amount), 0);

  const selectedEvents = selectedDay ? (eventsByDay.get(dateKey(selectedDay)) || []) : [];
  const selectedIsWorking = selectedDay && workDays.has(dateKey(selectedDay));

  const selectedWorkingJobs = useMemo(() => {
    if (!selectedDay) return [];
    return (viewData.jobs || []).filter((j) => {
      if (!j.startDate) return false;
      const s = new Date(j.startDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(j.endDate || j.startDate);
      e.setHours(23, 59, 59, 999);
      return selectedDay >= s && selectedDay <= e;
    });
  }, [selectedDay, viewData.jobs]);

  return (
    <div style={styles.page}>
      <PageHeader
        title={monthLongLabel(cursor)}
        eyebrow="Calendar"
        right={
          <>
            <ViewingAsSwitch earners={data.earners} />
            <button style={styles.iconBtn} onClick={togglePrivacy} title="Toggle privacy">
              {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </>
        }
        action={null}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setCursor(addMonths(cursor, -1))} style={styles.iconBtn}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
          <span style={{ color: t.income, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
            +{fmtShort(monthIncome)}
          </span>
          <span style={{ color: t.expense, fontWeight: 600 }} className={privacy ? 'private-blur' : ''}>
            −{fmtShort(monthOut)}
          </span>
        </div>
        <button onClick={() => setCursor(addMonths(cursor, 1))} style={styles.iconBtn}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 6 }}>
        {DOW.map((d, i) => (
          <div key={i} style={{ fontSize: 10, color: t.textFaint, textAlign: 'center', padding: '4px 0', letterSpacing: 0.5, fontWeight: 600 }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {grid.map((day, i) => (
          <DayCell
            key={i}
            day={day}
            inMonth={day.getMonth() === cursor.getMonth()}
            isToday={sameDay(day, today)}
            isSelected={selectedDay && sameDay(day, selectedDay)}
            isWorking={workDays.has(dateKey(day))}
            events={eventsByDay.get(dateKey(day)) || []}
            onClick={() => setSelectedDay(day)}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 14, fontSize: 11, color: t.textFaint, letterSpacing: 0.5, fontWeight: 500 }}>
        <LegendKey color={t.secondary} label="working" tint />
        <LegendKey color={t.income} label="income" />
        <LegendKey color={t.expense} label="bill" />
        <LegendKey color={t.secondary} label="transfer" />
      </div>

      {selectedDay && (
        <DayDetail
          day={selectedDay}
          events={selectedEvents}
          isWorking={selectedIsWorking}
          workingJobs={selectedWorkingJobs}
          accounts={data.accounts}
          setModal={setModal}
        />
      )}
    </div>
  );
}

// Big day cell with event pills
function DayCell({ day, inMonth, isToday, isSelected, isWorking, events, onClick }) {
  const { t, privacy } = useTheme();

  // Consolidate transfer pairs first, then sort
  const sortedEvents = useMemo(() => {
    const consolidated = consolidateTransfers(events);
    const order = { 'salary': 0, 'job': 0, 'extincome': 0, 'transfer': 1, 'bill': 2 };
    return [...consolidated].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  }, [events]);

  const visiblePills = sortedEvents.slice(0, 2);
  const overflowCount = Math.max(0, sortedEvents.length - 2);

  return (
    <div
      onClick={onClick}
      style={{
        aspectRatio: '0.7',
        position: 'relative',
        background: isSelected
          ? t.accentSoft
          : isWorking
          ? t.secondarySoft
          : isToday
          ? t.accentSoft
          : t.bgElev,
        border: `1px solid ${isSelected ? t.accent : isToday ? t.accent : t.border}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        padding: '4px 3px 3px',
        cursor: 'pointer',
        opacity: inMonth ? 1 : 0.35,
        transition: 'background 0.15s',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: isToday ? t.accent : t.text,
          fontWeight: isToday ? 700 : 500,
          lineHeight: 1,
          textAlign: 'center',
          marginBottom: 3,
        }}
      >
        {day.getDate()}
      </div>

      {isWorking && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 6,
            right: 6,
            height: 3,
            background: t.secondary,
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
          }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'auto' }}>
        {visiblePills.map((ev, i) => (
          <EventPill key={i} ev={ev} privacy={privacy} t={t} />
        ))}
        {overflowCount > 0 && (
          <div
            style={{
              fontSize: 9,
              color: t.textFaint,
              textAlign: 'center',
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            +{overflowCount}
          </div>
        )}
      </div>
    </div>
  );
}

function EventPill({ ev, privacy, t }) {
  const isTransfer = ev.type === 'transfer';
  const isIncome = !isTransfer && ev.amount > 0;
  const color = isIncome ? t.income : isTransfer ? t.secondary : t.expense;
  const bg = isIncome ? t.incomeBg : isTransfer ? t.secondarySoft : t.expenseBg;

  // For transfer, label is "From → To" abbreviated
  let label, amountShort;
  if (isTransfer) {
    const fromInit = (ev.fromName || '?')[0];
    const toInit = (ev.toName || '?')[0];
    label = `${fromInit}→${toInit}`;
    amountShort = fmtShort(ev.amount).replace('£', '£');
  } else {
    label = (ev.label || '').slice(0, 10);
    amountShort = fmtShort(Math.abs(ev.amount)).replace('£', '£');
  }

  return (
    <div
      style={{
        background: bg,
        borderLeft: `2px solid ${color}`,
        borderRadius: 2,
        padding: '2px 3px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        minHeight: 18,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 8,
          color,
          fontWeight: 600,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 8,
          color,
          fontWeight: 700,
          lineHeight: 1,
        }}
        className={privacy ? 'private-blur' : ''}
      >
        {isTransfer ? '' : isIncome ? '+' : '−'}{amountShort}
      </div>
    </div>
  );
}

function LegendKey({ color, label, tint }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 10,
          height: 4,
          borderRadius: 2,
          background: tint ? color + '55' : color,
        }}
      />
      {label}
    </span>
  );
}

// Consolidate transfer-out / transfer-in pairs into a single transfer row.
// Each transfer generates two events (one per leg). When the day detail shows
// both legs in the same list, it's confusing because the labels are written
// from each account's perspective and the signs disagree.
function consolidateTransfers(events) {
  const consolidated = [];
  const seenTransfers = new Set();

  events.forEach((ev) => {
    if (ev.type === 'transfer-out' || ev.type === 'transfer-in') {
      if (seenTransfers.has(ev.transferId)) return;
      seenTransfers.add(ev.transferId);
      // Find both legs
      const out = events.find((x) => x.transferId === ev.transferId && x.type === 'transfer-out');
      const inEv = events.find((x) => x.transferId === ev.transferId && x.type === 'transfer-in');
      if (!out || !inEv) {
        // Single leg only (shouldn't happen but be safe)
        consolidated.push(ev);
        return;
      }
      // Extract account names from labels (out label is "→ X", in label is "← Y")
      const toName = (out.label || '').replace(/^→\s*/, '');
      const fromName = (inEv.label || '').replace(/^←\s*/, '');
      consolidated.push({
        type: 'transfer',
        amount: Math.abs(out.amount),
        fromName,
        toName,
        transferId: ev.transferId,
        date: ev.date,
      });
    } else {
      consolidated.push(ev);
    }
  });

  return consolidated;
}

function DayDetail({ day, events, isWorking, workingJobs, accounts, setModal }) {
  const { t, privacy } = useTheme();

  const total = events.reduce((s, e) => {
    if (e.type === 'transfer-in' || e.type === 'transfer-out') return s;
    return s + e.amount;
  }, 0);

  return (
    <div
      style={{
        marginTop: 18,
        padding: 16,
        background: t.bgElev,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingBottom: 10,
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: t.weightHeading, color: t.text }}>
            {day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {events.length > 0 && (
            <div
              style={{
                fontSize: 13,
                color: total >= 0 ? t.income : t.expense,
                marginTop: 2,
                fontWeight: 600,
              }}
              className={privacy ? 'private-blur' : ''}
            >
              net {total >= 0 ? '+' : '−'}{fmt(Math.abs(total))}
            </div>
          )}
        </div>
      </div>

      {workingJobs.length === 0 && events.length === 0 && (
        <div style={{ fontSize: 13, color: t.textFaint, fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
          nothing scheduled
        </div>
      )}

      {workingJobs.length > 0 && (
        <div style={{ marginBottom: events.length > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 10, color: t.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
            Working
          </div>
          {workingJobs.map((j) => (
            <div
              key={j.id}
              onClick={() => setModal && setModal({ type: 'job', payload: j })}
              style={{
                fontSize: 13,
                padding: '8px 10px',
                marginBottom: 4,
                color: t.secondary,
                background: t.secondarySoft,
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {j.title || 'Untitled'}{' '}
              <span style={{ color: t.textFaint, fontSize: 11 }} className={privacy ? 'private-blur' : ''}>
                · {j.days}d × {fmt(j.dayRate)}
              </span>
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: t.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
            Cash flow
          </div>
          {consolidateTransfers(events).map((ev, i) => {
            // Transfer rows get neutral styling to avoid the +/- confusion
            if (ev.type === 'transfer') {
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    marginBottom: 4,
                    background: t.secondarySoft,
                    border: `1px solid ${t.secondary}33`,
                    borderRadius: 6,
                  }}
                >
                  <span style={{ color: t.text, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: t.secondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      transfer
                    </span>
                    {ev.fromName} → {ev.toName}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontWeight: t.weightAmount,
                      fontSize: 16,
                      color: t.secondary,
                    }}
                    className={privacy ? 'private-blur' : ''}
                  >
                    {fmt(ev.amount)}
                  </span>
                </div>
              );
            }
            // Normal event row
            const acc = accounts && ev.accountId ? accounts.find((a) => a.id === ev.accountId) : null;
            const isHouseholdBill = ev.type === 'bill' && acc && (acc.ownerId === 'household' || !acc.ownerId);
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  marginBottom: 4,
                  background: ev.amount > 0 ? t.incomeBg : t.expenseBg,
                  border: `1px solid ${ev.amount > 0 ? t.income : t.expense}33`,
                  borderRadius: 6,
                }}
              >
                <span style={{ color: t.text, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isHouseholdBill && (
                    <HomeIcon size={11} style={{ color: t.secondary, opacity: 0.85, flexShrink: 0 }} />
                  )}
                  {ev.label}
                </span>
                <Money
                  value={ev.amount}
                  sign={ev.amount > 0 ? '+' : '-'}
                  color={ev.amount > 0 ? t.income : t.expense}
                  size={16}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
