import React, { useState, useMemo } from 'react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, fmtShort, dayLabel, dateKey } from '../lib/format.js';

const FLOOR = -3000;

const MODES = [
  { id: 'balance', label: 'Balance' },
  { id: 'bills', label: 'Bills out' },
  { id: 'income', label: 'Money in' },
];

// Group events by week for chunkier bars on multi-month views
function aggregateByWeek(events) {
  const map = new Map();
  events.forEach((ev) => {
    const d = new Date(ev.date);
    // Bucket to Monday of that week
    const dow = (d.getDay() + 6) % 7;
    const weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - dow);
    weekStart.setHours(0, 0, 0, 0);
    const k = weekStart.toISOString().slice(0, 10);
    if (!map.has(k)) map.set(k, { date: weekStart, in: 0, out: 0, items: [] });
    const bucket = map.get(k);
    if (ev.amount > 0 && ev.type !== 'transfer-in') {
      bucket.in += ev.amount;
      bucket.items.push(ev);
    } else if (ev.amount < 0 && ev.type !== 'transfer-out') {
      bucket.out += Math.abs(ev.amount);
      bucket.items.push(ev);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.date - b.date);
}

export function TrajectoryChart({ dayPoints, events }) {
  const { t, privacy } = useTheme();
  const [mode, setMode] = useState('balance');
  const [hoverIdx, setHoverIdx] = useState(null);

  const weekly = useMemo(() => aggregateByWeek(events), [events]);

  if (!dayPoints || dayPoints.length === 0) return null;

  const W = 320, H = 200, pad = 8, xPad = 10;

  // X scale across days
  const xDay = (i) => xPad + (i / Math.max(1, dayPoints.length - 1)) * (W - xPad * 2);

  // For weekly bars, map a date to x coordinate based on day index
  const dateToX = (date) => {
    const startMs = dayPoints[0].date.getTime();
    const endMs = dayPoints[dayPoints.length - 1].date.getTime();
    const t = (date.getTime() - startMs) / Math.max(1, endMs - startMs);
    return xPad + t * (W - xPad * 2);
  };

  const totals = dayPoints.map((p) => p.total);
  const maxBalance = Math.max(...totals, 100);
  const minBalance = Math.min(...totals, 0, FLOOR);

  const maxOut = weekly.length ? Math.max(...weekly.map((w) => w.out)) : 100;
  const maxIn = weekly.length ? Math.max(...weekly.map((w) => w.in)) : 100;

  let yMin, yMax;
  if (mode === 'balance') {
    yMin = Math.min(minBalance, 0);
    yMax = Math.max(maxBalance * 1.1, 100);
  } else if (mode === 'bills') {
    yMin = 0;
    yMax = Math.max(maxOut * 1.1, 100);
  } else {
    yMin = 0;
    yMax = Math.max(maxIn * 1.1, 100);
  }
  const yRange = Math.max(1, yMax - yMin);

  const y = (v) => {
    const capped = Math.max(v, FLOOR);
    return pad + (1 - (capped - yMin) / yRange) * (H - pad * 2);
  };

  const yZero = y(0);
  const linePath = dayPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xDay(i)} ${y(p.total)}`).join(' ');
  const fillPath =
    `M ${xDay(0)} ${yZero} ` +
    dayPoints.map((p, i) => `L ${xDay(i)} ${y(p.total)}`).join(' ') +
    ` L ${xDay(dayPoints.length - 1)} ${yZero} Z`;

  const firstNegativeIdx = dayPoints.findIndex((p) => p.total < 0);

  // Bar width: across visible weeks
  const weekCount = Math.max(1, weekly.length);
  const barW = Math.min(20, Math.max(8, (W - xPad * 2) / weekCount * 0.7));

  const cycleMode = () => {
    const idx = MODES.findIndex((m) => m.id === mode);
    setMode(MODES[(idx + 1) % MODES.length].id);
  };

  // Find biggest bar for callout
  const showCallouts = mode !== 'balance' && weekly.length <= 14;
  const calloutThreshold = mode === 'bills' ? maxOut * 0.6 : maxIn * 0.6;

  const hoveredWeek = hoverIdx !== null ? weekly[hoverIdx] : null;
  const hoveredDay = hoverIdx !== null && mode === 'balance' ? dayPoints[hoverIdx] : null;

  return (
    <div
      style={{
        background: t.bgElev,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        padding: '14px 12px',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim }}>
          {MODES.find((m) => m.id === mode).label}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: mode === m.id ? t.accent : t.border,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: 'block', cursor: 'pointer' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          if (mode === 'balance') {
            const i = Math.round(((px - xPad) / (W - xPad * 2)) * (dayPoints.length - 1));
            if (i >= 0 && i < dayPoints.length) setHoverIdx(i);
          } else {
            // find closest week
            let closest = -1;
            let closestDist = Infinity;
            weekly.forEach((wk, wi) => {
              const wx = dateToX(wk.date);
              const d = Math.abs(wx - px);
              if (d < closestDist) {
                closest = wi;
                closestDist = d;
              }
            });
            if (closest >= 0) setHoverIdx(closest);
          }
        }}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const tch = e.touches[0];
          const px = ((tch.clientX - rect.left) / rect.width) * W;
          if (mode === 'balance') {
            const i = Math.round(((px - xPad) / (W - xPad * 2)) * (dayPoints.length - 1));
            if (i >= 0 && i < dayPoints.length) setHoverIdx(i);
          } else {
            let closest = -1;
            let closestDist = Infinity;
            weekly.forEach((wk, wi) => {
              const wx = dateToX(wk.date);
              const d = Math.abs(wx - px);
              if (d < closestDist) {
                closest = wi;
                closestDist = d;
              }
            });
            if (closest >= 0) setHoverIdx(closest);
          }
        }}
        onTouchEnd={() => setHoverIdx(null)}
        onClick={cycleMode}
      >
        <defs>
          <linearGradient id="gradPos" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity="0.25" />
            <stop offset="100%" stopColor={t.accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Zero line */}
        {yZero > pad && yZero < H - pad && (
          <line
            x1={xPad}
            x2={W - xPad}
            y1={yZero}
            y2={yZero}
            stroke={t.borderStrong}
            strokeDasharray="2 3"
            strokeWidth="1"
          />
        )}

        {/* Floor line */}
        {mode === 'balance' && yMin <= FLOOR && (
          <line
            x1={xPad}
            x2={W - xPad}
            y1={y(FLOOR)}
            y2={y(FLOOR)}
            stroke={t.expense}
            strokeDasharray="3 3"
            strokeWidth="1"
            opacity="0.5"
          />
        )}

        {/* Weekly bars */}
        {weekly.map((wk, i) => {
          const wx = dateToX(wk.date);
          let v, color;
          if (mode === 'income') {
            v = wk.in;
            color = t.income;
          } else if (mode === 'bills') {
            v = wk.out;
            color = t.expense;
          } else {
            // balance mode: show outflows below as red, inflows above as green
            v = wk.out;
            color = t.expense;
          }
          if (v <= 0 && mode !== 'balance') return null;
          if (v <= 0 && mode === 'balance' && wk.in <= 0) return null;

          if (mode === 'balance') {
            // Draw both in and out
            const outH = wk.out > 0 ? ((wk.out - 0) / yRange) * (H - pad * 2) : 0;
            const inH = wk.in > 0 ? ((wk.in - 0) / yRange) * (H - pad * 2) : 0;
            return (
              <g key={i}>
                {wk.out > 0 && (
                  <rect
                    x={wx - barW / 2 - 1}
                    y={yZero}
                    width={barW * 0.45}
                    height={Math.min(outH, H - pad - yZero)}
                    fill={t.expense}
                    opacity="0.55"
                    rx="1"
                  />
                )}
                {wk.in > 0 && (
                  <rect
                    x={wx + 1}
                    y={Math.max(pad, yZero - inH)}
                    width={barW * 0.45}
                    height={Math.min(inH, yZero - pad)}
                    fill={t.income}
                    opacity="0.55"
                    rx="1"
                  />
                )}
              </g>
            );
          }

          const barH = ((v - yMin) / yRange) * (H - pad * 2);
          const barTop = y(v);
          const startY = H - pad;
          return (
            <g key={i}>
              <rect
                x={wx - barW / 2}
                y={Math.min(barTop, startY)}
                width={barW}
                height={Math.abs(startY - barTop)}
                fill={color}
                opacity="0.85"
                rx="2"
              />
              {/* Callout for big bars */}
              {showCallouts && v >= calloutThreshold && !privacy && (
                <text
                  x={wx}
                  y={barTop - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fill={color}
                  fontWeight="600"
                >
                  {fmtShort(v)}
                </text>
              )}
            </g>
          );
        })}

        {/* Balance line + fill */}
        {mode === 'balance' && (
          <>
            <path d={fillPath} fill="url(#gradPos)" />
            <path
              d={linePath}
              fill="none"
              stroke={t.accent}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {firstNegativeIdx > 0 && (
              <g>
                <circle
                  cx={xDay(firstNegativeIdx)}
                  cy={y(dayPoints[firstNegativeIdx].total)}
                  r="3.5"
                  fill={t.expense}
                />
                {!privacy && (
                  <text
                    x={xDay(firstNegativeIdx)}
                    y={y(dayPoints[firstNegativeIdx].total) - 7}
                    textAnchor="middle"
                    fontSize="9"
                    fill={t.expense}
                    fontWeight="600"
                  >
                    negative
                  </text>
                )}
              </g>
            )}
          </>
        )}

        {/* Hover indicator */}
        {hoverIdx !== null && mode === 'balance' && hoveredDay && (
          <line
            x1={xDay(hoverIdx)}
            x2={xDay(hoverIdx)}
            y1={pad}
            y2={H - pad}
            stroke={t.accent}
            strokeWidth="0.6"
            strokeDasharray="2 2"
            opacity="0.6"
          />
        )}
      </svg>

      {/* Hover info or footer */}
      {hoveredDay && mode === 'balance' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.accent, marginTop: 6, padding: '0 4px' }}>
          <span>{dayLabel(hoveredDay.date)}</span>
          <span className={privacy ? 'private-blur' : ''}>{fmt(hoveredDay.total)}</span>
        </div>
      ) : hoveredWeek && mode !== 'balance' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.accent, marginTop: 6, padding: '0 4px' }}>
          <span>w/c {dayLabel(hoveredWeek.date)}</span>
          <span className={privacy ? 'private-blur' : ''}>
            {mode === 'bills' ? '−' + fmt(hoveredWeek.out) : '+' + fmt(hoveredWeek.in)}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: t.textFaint, marginTop: 6, padding: '0 4px' }}>
          <span>{dayLabel(dayPoints[0].date)}</span>
          <span style={{ color: t.textDim }}>tap chart to cycle · drag to inspect</span>
          <span>{dayLabel(dayPoints[dayPoints.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}
