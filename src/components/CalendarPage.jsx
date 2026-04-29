import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { startOfMonth, endOfMonth, addMonths, monthLongLabel, dateKey, sameDay, fmtShort, dayLabel, fmt } from '../lib/format.js';
import { generateEvents } from '../lib/projection.js';
import { jobPayDate } from '../lib/tax.js';
import { PageHeader, Money } from './atoms.jsx';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function CalendarPage({ data, setModal }) {
  const { styles, t, privacy, togglePrivacy } = useTheme();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  const events = useMemo(
    () => generateEvents(data, monthStart, monthEnd, { includeSpeculative: true, likelyWeight: 1.0 }),
    [data, cursor]
  );

  // Working days from job spans
  const workDays = useMemo(() => {
    const set = new Set();
    (data.jobs || []).forEach((job) => {
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
  }, [data.jobs, monthStart, monthEnd]);

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

  // Get jobs whose span covers the selected day
  const selectedWorkingJobs = useMemo(() => {
    if (!selectedDay) return [];
    return (data.jobs || []).filter((j) => {
      if (!j.startDate) return false;
      const s = new Date(j.startDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(j.endDate || j.startDate);
      e.setHours(23, 59, 59, 999);
      return selectedDay >= s && selectedDay <= e;
    });
  }, [selectedDay, data.jobs]);

  return (
    <div style={styles.page}>
      <PageHeader
        title="Calendar"
        eyebrow={monthLongLabel(cursor)}
        right={
          <button style={styles.iconBtn} onClick={togglePrivacy} title="Toggle privacy">
            {privacy ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
        action={null}
      />

      {/* Month nav + summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <button onClick={() => setCursor(addMonths(cursor, -1))} style={styles.iconBtn}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          <span style={{ color: t.income }} className={privacy ? 'private-blur' : ''}>
            +{fmtShort(monthIncome)}
          </span>
          <span style={{ color: t.expense }} className={privacy ? 'private-blur' : ''}>
            −{fmtShort(monthOut)}
          </span>
        </div>
        <button onClick={() => setCursor(addMonths(cursor, 1))} style={styles.iconBtn}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* DOW header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 6 }}>
        {DOW.map((d, i) => (
          <div
            key={i}
            style={{
              fontSize: 10,
              color: t.textFaint,
              textAlign: 'center',
              padding: '4px 0',
              letterSpacing: 0.5,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells - taller now since we have a full page */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {grid.map((day, i) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, today);
          const isSelected = selectedDay && sameDay(day, selectedDay);
          const k = dateKey(day);
          const dayEvents = eventsByDay.get(k) || [];
          const isWorking = workDays.has(k);

          // Group events by type for compact display
          const incomeCount = dayEvents.filter((e) => e.type === 'job' || e.type === 'salary' || e.type === 'extincome').length;
          const billCount = dayEvents.filter((e) => e.type === 'bill').length;
          const transferCount = dayEvents.filter((e) => e.type.startsWith('transfer')).length;

          return (
            <div
              key={i}
              onClick={() => setSelectedDay(day)}
              style={{
                aspectRatio: '0.85',
                position: 'relative',
                background: isSelected
                  ? t.accentSoft
                  : isWorking
                  ? t.secondarySoft
                  : isToday
                  ? t.accentSoft
                  : t.bgElev,
                border: `1px solid ${
                  isSelected ? t.accent : isToday ? t.accent : t.border
                }`,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                padding: '4px 4px 3px',
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
                  fontWeight: isToday ? 600 : 400,
                  lineHeight: 1,
                  textAlign: 'center',
                  marginBottom: 2,
                }}
              >
                {day.getDate()}
              </div>

              {/* Working indicator: small bar at top */}
              {isWorking && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 6,
                    right: 6,
                    height: 2,
                    background: t.secondary,
                    borderBottomLeftRadius: 2,
                    borderBottomRightRadius: 2,
                  }}
                />
              )}

              {/* Event pills */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  marginTop: 'auto',
                  alignItems: 'stretch',
                }}
              >
                {incomeCount > 0 && (
                  <div
                    style={{
                      height: 4,
                      background: t.income,
                      borderRadius: 2,
                      opacity: 0.9,
                    }}
                  />
                )}
                {billCount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 1.5,
                      height: 4,
                    }}
                  >
                    {Array.from({ length: Math.min(billCount, 3) }).map((_, j) => (
                      <div
                        key={j}
                        style={{
                          flex: 1,
                          background: t.expense,
                          borderRadius: 2,
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>
                )}
                {transferCount > 0 && (
                  <div
                    style={{
                      height: 3,
                      background: t.textDim,
                      borderRadius: 2,
                      opacity: 0.6,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          justifyContent: 'center',
          marginTop: 14,
          fontSize: 10,
          color: t.textFaint,
          letterSpacing: 0.5,
        }}
      >
        <LegendKey color={t.secondary} label="working" tint />
        <LegendKey color={t.income} label="income" />
        <LegendKey color={t.expense} label="bill" />
        <LegendKey color={t.textDim} label="transfer" />
      </div>

      {/* Day detail */}
      {selectedDay && (
        <DayDetail
          day={selectedDay}
          events={selectedEvents}
          isWorking={selectedIsWorking}
          workingJobs={selectedWorkingJobs}
          setModal={setModal}
        />
      )}
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

function DayDetail({ day, events, isWorking, workingJobs, setModal }) {
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
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: t.text }}>
            {day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {events.length > 0 && (
            <div
              style={{
                fontSize: 12,
                color: total >= 0 ? t.income : t.expense,
                marginTop: 2,
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
          <div style={{ fontSize: 10, color: t.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
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
          <div style={{ fontSize: 10, color: t.textDim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Cash flow
          </div>
          {events.map((ev, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 10px',
                marginBottom: 4,
                background: ev.amount > 0 ? t.incomeBg : t.expenseBg,
                borderRadius: 6,
              }}
            >
              <span style={{ color: t.text, fontSize: 13 }}>{ev.label}</span>
              <Money
                value={ev.amount}
                sign={ev.amount > 0 ? '+' : '-'}
                color={ev.amount > 0 ? t.income : t.expense}
                size={15}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
