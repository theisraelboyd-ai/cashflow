import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, fmtShort, dayLabel, dateKey, monthLabel } from '../lib/format.js';

const FLOOR = -3000;

export function TrajectoryChart({ dayPoints, events }) {
  const { t, privacy } = useTheme();
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

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

  const W = 320;
  const H = 200;
  const padTop = 14;
  const padBottom = 22;
  const padX = 10;

  const xDay = (i) =>
    padX + (i / Math.max(1, dayPoints.length - 1)) * (W - padX * 2);

  const totals = dayPoints.map((p) => p.total);
  const maxBalance = Math.max(...totals, 100);
  const minBalance = Math.min(...totals, 0);

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

  // Month boundaries with collision avoidance for the leading-month label
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

  // Suppress the left-edge "first month" label if a month boundary falls within
  // the first 12% of the chart width (would collide visually).
  const showFirstMonthLabel = monthBoundaries.length === 0 || monthBoundaries[0].idx > dayPoints.length * 0.12;

  // Bills + income marker positions, with a hit-test list for snap-to-event
  const billDays = useMemo(() => {
    const dayMap = new Map();
    events.forEach((ev) => {
      if (ev.type !== 'bill' && ev.type !== 'transfer-out') return;
      const k = dateKey(ev.date);
      if (!dayMap.has(k)) dayMap.set(k, { items: [], total: 0 });
      const entry = dayMap.get(k);
      entry.items.push(ev);
      entry.total += Math.abs(ev.amount);
    });
    const result = [];
    dayPoints.forEach((p, i) => {
      const k = dateKey(p.date);
      const entry = dayMap.get(k);
      if (entry) result.push({ idx: i, x: xDay(i), y: y(p.total), ...entry });
    });
    return result;
  }, [events, dayPoints]);

  const incomeDays = useMemo(() => {
    const dayMap = new Map();
    events.forEach((ev) => {
      if (ev.type !== 'job' && ev.type !== 'salary' && ev.type !== 'extincome' && ev.type !== 'transfer-in') return;
      const k = dateKey(ev.date);
      if (!dayMap.has(k)) dayMap.set(k, { items: [], total: 0 });
      const entry = dayMap.get(k);
      entry.items.push(ev);
      entry.total += ev.amount;
    });
    const result = [];
    dayPoints.forEach((p, i) => {
      const k = dateKey(p.date);
      const entry = dayMap.get(k);
      if (entry) result.push({ idx: i, x: xDay(i), y: y(p.total), ...entry });
    });
    return result;
  }, [events, dayPoints]);

  const hoveredPoint = hoverIdx !== null ? dayPoints[hoverIdx] : null;
  const hoveredDayEvents = hoveredPoint ? eventsByDayKey.get(dateKey(hoveredPoint.date)) || [] : [];

  // Convert client X to chart-space X (in viewBox units)
  const clientXToSvgX = (clientX) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  };

  // Snap-to-event: if within 14 SVG units of a marker, lock onto that day.
  // Otherwise, lock to the nearest day on the line.
  const SNAP_RADIUS = 14;

  const findIdxFromX = (svgX) => {
    // First check event markers (bills + income) - these have priority
    let bestEventIdx = -1;
    let bestEventDist = Infinity;
    [...billDays, ...incomeDays].forEach((m) => {
      const d = Math.abs(m.x - svgX);
      if (d < bestEventDist) {
        bestEventDist = d;
        bestEventIdx = m.idx;
      }
    });
    if (bestEventIdx >= 0 && bestEventDist <= SNAP_RADIUS) {
      return bestEventIdx;
    }
    // Otherwise, use the nearest day index
    const i = Math.round(((svgX - padX) / (W - padX * 2)) * (dayPoints.length - 1));
    return Math.max(0, Math.min(dayPoints.length - 1, i));
  };

  const setIdxFromClientX = (clientX) => {
    const svgX = clientXToSvgX(clientX);
    const i = findIdxFromX(svgX);
    setHoverIdx(i);
  };

  // Touch and mouse handling separated. Touch events get full priority on
  // mobile (Pointer Events on iOS Safari are unreliable inside SVG).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let isTouching = false;

    const onTouchStart = (e) => {
      e.preventDefault();
      isTouching = true;
      const touch = e.touches[0];
      if (touch) setIdxFromClientX(touch.clientX);
    };
    const onTouchMove = (e) => {
      if (!isTouching) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) setIdxFromClientX(touch.clientX);
    };
    const onTouchEnd = () => {
      isTouching = false;
      setHoverIdx(null);
    };

    const onMouseMove = (e) => {
      if (isTouching) return;
      setIdxFromClientX(e.clientX);
    };
    const onMouseLeave = () => {
      if (isTouching) return;
      setHoverIdx(null);
    };

    svg.addEventListener('touchstart', onTouchStart, { passive: false });
    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    svg.addEventListener('touchend', onTouchEnd);
    svg.addEventListener('touchcancel', onTouchEnd);
    svg.addEventListener('mousemove', onMouseMove);
    svg.addEventListener('mouseleave', onMouseLeave);

    return () => {
      svg.removeEventListener('touchstart', onTouchStart);
      svg.removeEventListener('touchmove', onTouchMove);
      svg.removeEventListener('touchend', onTouchEnd);
      svg.removeEventListener('touchcancel', onTouchEnd);
      svg.removeEventListener('mousemove', onMouseMove);
      svg.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [dayPoints.length, billDays.length, incomeDays.length]);

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
      >
        <defs>
          <linearGradient id="gradPos" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={t.accent} stopOpacity="0" />
          </linearGradient>
        </defs>

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

        {showFirstMonthLabel && (
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
        )}

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

        <path d={fillPath} fill="url(#gradPos)" />

        <path
          d={linePath}
          fill="none"
          stroke={t.accent}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {billDays.map((bd, i) => (
          <circle
            key={`b-${i}`}
            cx={bd.x}
            cy={bd.y}
            r="2.8"
            fill={t.expense}
            opacity="0.9"
          />
        ))}

        {incomeDays.map((id, i) => (
          <circle
            key={`i-${i}`}
            cx={id.x}
            cy={id.y}
            r="3.5"
            fill={t.income}
            stroke={t.bg}
            strokeWidth="1.2"
          />
        ))}

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
              r="5"
              fill={t.accent}
              stroke={t.bg}
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

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
                {hoveredDayEvents.slice(0, 4).map((ev, i) => (
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
                {hoveredDayEvents.length > 4 && (
                  <div style={{ fontSize: 10, color: t.textFaint, fontStyle: 'italic' }}>
                    + {hoveredDayEvents.length - 4} more
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
