import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, fmtShort, dayLabel, dateKey, monthLabel, startOfMonth } from '../lib/format.js';

const FLOOR = -3000;

export function TrajectoryChart({ dayPoints, events }) {
  const { t, privacy } = useTheme();
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  // Map events to days for tooltip detail
  const eventsByDayKey = useMemo(() => {
    const map = new Map();
    events.forEach((ev) => {
      const k = dateKey(ev.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    });
    return map;
  }, [events]);

  if (!dayPoints || dayPoints.length === 0) return null;

  // SVG geometry
  const W = 320;
  const H = 200;
  const padTop = 14;
  const padBottom = 22;
  const padX = 10;

  // X scale across days
  const xDay = (i) =>
    padX + (i / Math.max(1, dayPoints.length - 1)) * (W - padX * 2);

  // Y scale on balance (with floor)
  const totals = dayPoints.map((p) => p.total);
  const maxBalance = Math.max(...totals, 100);
  const minBalance = Math.min(...totals, 0);

  // Provide some headroom and add floor when going negative
  let yMin = Math.min(minBalance, 0);
  let yMax = maxBalance;
  if (yMax - yMin < 100) yMax = yMin + 100;
  const yMinPadded = yMin - (yMax - yMin) * 0.05;
  const yMaxPadded = yMax + (yMax - yMin) * 0.08;
  const yRange = Math.max(1, yMaxPadded - yMinPadded);

  const y = (v) => {
    const capped = Math.max(v, FLOOR);
    return padTop + (1 - (capped - yMinPadded) / yRange) * (H - padTop - padBottom);
  };

  const yZero = y(0);
  const linePath = dayPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xDay(i)} ${y(p.total)}`).join(' ');
  const fillPath =
    `M ${xDay(0)} ${yZero} ` +
    dayPoints.map((p, i) => `L ${xDay(i)} ${y(p.total)}`).join(' ') +
    ` L ${xDay(dayPoints.length - 1)} ${yZero} Z`;

  const firstNegativeIdx = dayPoints.findIndex((p) => p.total < 0);

  // Month boundary lines for visual rhythm
  const monthBoundaries = useMemo(() => {
    const boundaries = [];
    let lastMonth = null;
    dayPoints.forEach((p, i) => {
      const m = p.date.getMonth();
      if (lastMonth !== null && m !== lastMonth) {
        boundaries.push({ idx: i, label: monthLabel(p.date), date: p.date });
      }
      lastMonth = m;
    });
    return boundaries;
  }, [dayPoints]);

  // Bill markers - one dot per day with bill activity
  const billDays = useMemo(() => {
    const set = new Map();
    events.forEach((ev) => {
      if (ev.type !== 'bill' && ev.type !== 'transfer-out') return;
      const k = dateKey(ev.date);
      if (!set.has(k)) set.set(k, { date: ev.date, items: [], total: 0 });
      const entry = set.get(k);
      entry.items.push(ev);
      entry.total += Math.abs(ev.amount);
    });
    // Map to indices
    const result = [];
    dayPoints.forEach((p, i) => {
      const k = dateKey(p.date);
      const entry = set.get(k);
      if (entry) result.push({ idx: i, ...entry });
    });
    return result;
  }, [events, dayPoints]);

  // Income markers
  const incomeDays = useMemo(() => {
    const set = new Map();
    events.forEach((ev) => {
      if (ev.type !== 'job' && ev.type !== 'salary' && ev.type !== 'extincome' && ev.type !== 'transfer-in') return;
      const k = dateKey(ev.date);
      if (!set.has(k)) set.set(k, { date: ev.date, items: [], total: 0 });
      const entry = set.get(k);
      entry.items.push(ev);
      entry.total += ev.amount;
    });
    const result = [];
    dayPoints.forEach((p, i) => {
      const k = dateKey(p.date);
      const entry = set.get(k);
      if (entry) result.push({ idx: i, ...entry });
    });
    return result;
  }, [events, dayPoints]);

  const hoveredPoint = hoverIdx !== null ? dayPoints[hoverIdx] : null;
  const hoveredDayEvents = hoveredPoint ? eventsByDayKey.get(dateKey(hoveredPoint.date)) || [] : [];

  // Touch/mouse handlers - extract from event coords
  const setIdxFromClientX = (clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padX) / (W - padX * 2)) * (dayPoints.length - 1));
    if (i >= 0 && i < dayPoints.length) setHoverIdx(i);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    setIdxFromClientX(e.clientX);
  };
  const handlePointerMove = (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') {
      setIdxFromClientX(e.clientX);
    } else {
      setIdxFromClientX(e.clientX);
    }
  };
  const handlePointerLeave = () => setHoverIdx(null);

  // Touch handling separately for mobile
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onTouch = (e) => {
      e.preventDefault();
      const t = e.touches[0] || e.changedTouches[0];
      if (t) setIdxFromClientX(t.clientX);
    };
    const onTouchEnd = () => setHoverIdx(null);
    svg.addEventListener('touchstart', onTouch, { passive: false });
    svg.addEventListener('touchmove', onTouch, { passive: false });
    svg.addEventListener('touchend', onTouchEnd);
    svg.addEventListener('touchcancel', onTouchEnd);
    return () => {
      svg.removeEventListener('touchstart', onTouch);
      svg.removeEventListener('touchmove', onTouch);
      svg.removeEventListener('touchend', onTouchEnd);
      svg.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [dayPoints.length]);

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
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: t.textDim, fontWeight: 600 }}>
          Balance trajectory
        </div>
        <div style={{ fontSize: 10, color: t.textFaint, letterSpacing: 0.4 }}>
          {dayPoints.length} days
        </div>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{
          display: 'block',
          cursor: 'crosshair',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <defs>
          <linearGradient id="gradPos" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={t.accent} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gradNeg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={t.expense} stopOpacity="0" />
            <stop offset="100%" stopColor={t.expense} stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Month boundary verticals */}
        {monthBoundaries.map((b, i) => (
          <g key={i}>
            <line
              x1={xDay(b.idx)}
              x2={xDay(b.idx)}
              y1={padTop}
              y2={H - padBottom}
              stroke={t.border}
              strokeWidth="1"
              opacity="0.6"
            />
            <text
              x={xDay(b.idx) + 3}
              y={H - padBottom + 13}
              fontSize="9"
              fill={t.textFaint}
              fontWeight="600"
              letterSpacing="0.5"
            >
              {b.label}
            </text>
          </g>
        ))}

        {/* First-month label */}
        <text
          x={padX + 2}
          y={H - padBottom + 13}
          fontSize="9"
          fill={t.textFaint}
          fontWeight="600"
          letterSpacing="0.5"
        >
          {monthLabel(dayPoints[0].date)}
        </text>

        {/* Zero baseline */}
        {yZero > padTop && yZero < H - padBottom && (
          <line
            x1={padX}
            x2={W - padX}
            y1={yZero}
            y2={yZero}
            stroke={t.borderStrong}
            strokeDasharray="3 3"
            strokeWidth="1"
            opacity="0.5"
          />
        )}

        {/* Fill - green above zero, red below */}
        <path d={fillPath} fill="url(#gradPos)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={t.accent}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Bill activity dots - small, on the line */}
        {billDays.map((bd, i) => (
          <circle
            key={`b-${i}`}
            cx={xDay(bd.idx)}
            cy={y(dayPoints[bd.idx].total)}
            r="2.5"
            fill={t.expense}
            opacity="0.8"
          />
        ))}

        {/* Income dots */}
        {incomeDays.map((id, i) => (
          <circle
            key={`i-${i}`}
            cx={xDay(id.idx)}
            cy={y(dayPoints[id.idx].total)}
            r="3"
            fill={t.income}
            stroke={t.bg}
            strokeWidth="1"
          />
        ))}

        {/* Negative crossing marker */}
        {firstNegativeIdx > 0 && (
          <g>
            <circle
              cx={xDay(firstNegativeIdx)}
              cy={y(dayPoints[firstNegativeIdx].total)}
              r="4.5"
              fill={t.expense}
              stroke={t.bg}
              strokeWidth="1.5"
            />
            {hoverIdx === null && !privacy && (
              <text
                x={xDay(firstNegativeIdx)}
                y={y(dayPoints[firstNegativeIdx].total) - 8}
                textAnchor="middle"
                fontSize="9"
                fill={t.expense}
                fontWeight="700"
              >
                negative
              </text>
            )}
          </g>
        )}

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <g>
            <line
              x1={xDay(hoverIdx)}
              x2={xDay(hoverIdx)}
              y1={padTop}
              y2={H - padBottom}
              stroke={t.accent}
              strokeWidth="1"
              opacity="0.7"
            />
            <circle
              cx={xDay(hoverIdx)}
              cy={y(dayPoints[hoverIdx].total)}
              r="4.5"
              fill={t.accent}
              stroke={t.bg}
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Tooltip area */}
      <div
        style={{
          marginTop: 10,
          minHeight: 56,
          padding: '10px 12px',
          background: hoveredPoint ? t.bgInset : 'transparent',
          borderRadius: 8,
          transition: 'background 0.15s',
        }}
      >
        {hoveredPoint ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: t.textDim, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {dayLabel(hoveredPoint.date)}
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 18,
                  fontWeight: t.weightAmount,
                  color: hoveredPoint.total < 0 ? t.expense : t.text,
                }}
                className={privacy ? 'private-blur' : ''}
              >
                {fmt(hoveredPoint.total)}
              </div>
            </div>
            {hoveredDayEvents.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {hoveredDayEvents.slice(0, 3).map((ev, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      color: t.textDim,
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                      {ev.label}
                    </span>
                    <span
                      className={privacy ? 'private-blur' : ''}
                      style={{
                        color: ev.amount > 0 ? t.income : t.expense,
                        fontWeight: 600,
                      }}
                    >
                      {ev.amount > 0 ? '+' : '−'}{fmt(Math.abs(ev.amount))}
                    </span>
                  </div>
                ))}
                {hoveredDayEvents.length > 3 && (
                  <div style={{ fontSize: 10, color: t.textFaint, fontStyle: 'italic' }}>
                    + {hoveredDayEvents.length - 3} more
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: t.textFaint, textAlign: 'center', paddingTop: 4 }}>
            tap or drag the chart to inspect any day
          </div>
        )}
      </div>
    </div>
  );
}
