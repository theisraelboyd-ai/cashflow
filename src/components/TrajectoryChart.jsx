import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, fmtShort, dayLabel, dateKey, monthLabel } from '../lib/format.js';

export function TrajectoryChart({ dayPoints, events, onTapEvent }) {
  const { t, privacy } = useTheme();
  const [hoverIdx, setHoverIdx] = useState(null);
  const [stickyIdx, setStickyIdx] = useState(null);
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

  // No artificial floor - let chart show the real magnitude. Auto-scale.
  let yMin = minBalance;
  let yMax = maxBalance;
  if (yMax - yMin < 100) yMax = yMin + 100;
  const yMinPadded = yMin - (yMax - yMin) * 0.08;
  const yMaxPadded = yMax + (yMax - yMin) * 0.08;
  const yRange = Math.max(1, yMaxPadded - yMinPadded);

  const y = (v) => {
    return padTop + (1 - (v - yMinPadded) / yRange) * (H - padTop - padBottom);
  };

  const yZero = y(0);
  const linePath = dayPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xDay(i)} ${y(p.total)}`).join(' ');
  const fillPath =
    `M ${xDay(0)} ${yZero} ` +
    dayPoints.map((p, i) => `L ${xDay(i)} ${y(p.total)}`).join(' ') +
    ` L ${xDay(dayPoints.length - 1)} ${yZero} Z`;

  const firstNegativeIdx = dayPoints.findIndex((p) => p.total < 0);

  // Find lowest point for callout
  let lowestIdx = 0;
  for (let i = 1; i < dayPoints.length; i++) {
    if (dayPoints[i].total < dayPoints[lowestIdx].total) lowestIdx = i;
  }
  const lowestPoint = dayPoints[lowestIdx];
  const showLowest = lowestPoint.total < 0;

  // Month boundaries with auto-thinning based on width-per-month
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

  // Auto-thin labels based on horizontal density. Need at least ~32px per label
  // in the SVG viewBox to avoid overlap. Always show the line dividers though,
  // just thin the LABELS.
  const labelStride = useMemo(() => {
    if (monthBoundaries.length === 0) return 1;
    const avgGap = (W - padX * 2) / (monthBoundaries.length + 1);
    if (avgGap < 22) return 3;       // 12m+ — every 3rd
    if (avgGap < 36) return 2;       // 6m — every other
    return 1;                         // 1m/3m — all
  }, [monthBoundaries.length]);

  const showFirstMonthLabel = monthBoundaries.length === 0 || monthBoundaries[0].idx > dayPoints.length * 0.14;

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

  // The "active" point - either currently being scrubbed, or stickily locked
  // const activeIdx already declared below

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

  // The visible index: prefer transient hover (during drag/scrub),
  // otherwise the sticky locked index.
  const activeIdx = hoverIdx !== null ? hoverIdx : stickyIdx;

  // Touch and mouse handling. Touch events get full priority on mobile
  // (Pointer Events on iOS Safari are unreliable inside SVG).
  // Releasing a touch/mouse drag now PERSISTS the selection (sticky mode).
  // Tap outside the chart container clears it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let isTouching = false;
    let didMove = false;

    const onTouchStart = (e) => {
      e.preventDefault();
      isTouching = true;
      didMove = false;
      const touch = e.touches[0];
      if (touch) setIdxFromClientX(touch.clientX);
    };
    const onTouchMove = (e) => {
      if (!isTouching) return;
      e.preventDefault();
      didMove = true;
      const touch = e.touches[0];
      if (touch) setIdxFromClientX(touch.clientX);
    };
    const onTouchEnd = () => {
      isTouching = false;
      // Lock current hover position as sticky, then clear hover
      if (hoverIdx !== null) {
        setStickyIdx(hoverIdx);
      }
      setHoverIdx(null);
    };

    const onMouseDown = (e) => {
      if (isTouching) return;
      setIdxFromClientX(e.clientX);
    };
    const onMouseMove = (e) => {
      if (isTouching) return;
      // Only scrub on drag (button held down)
      if (e.buttons > 0) {
        setIdxFromClientX(e.clientX);
      }
    };
    const onMouseUp = (e) => {
      if (isTouching) return;
      if (hoverIdx !== null) {
        setStickyIdx(hoverIdx);
      }
      setHoverIdx(null);
    };
    const onMouseLeave = () => {
      if (isTouching) return;
      // Don't clear sticky on mouse leave - let it persist
      setHoverIdx(null);
    };
    const onClick = (e) => {
      // Single click sets sticky directly
      setIdxFromClientX(e.clientX);
      setStickyIdx(findIdxFromX(clientXToSvgX(e.clientX)));
    };

    svg.addEventListener('touchstart', onTouchStart, { passive: false });
    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    svg.addEventListener('touchend', onTouchEnd);
    svg.addEventListener('touchcancel', onTouchEnd);
    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('mousemove', onMouseMove);
    svg.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('mouseleave', onMouseLeave);

    return () => {
      svg.removeEventListener('touchstart', onTouchStart);
      svg.removeEventListener('touchmove', onTouchMove);
      svg.removeEventListener('touchend', onTouchEnd);
      svg.removeEventListener('touchcancel', onTouchEnd);
      svg.removeEventListener('mousedown', onMouseDown);
      svg.removeEventListener('mousemove', onMouseMove);
      svg.removeEventListener('mouseup', onMouseUp);
      svg.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [dayPoints.length, billDays.length, incomeDays.length, hoverIdx]);

  // Reset sticky when dayPoints change (new horizon, new data)
  useEffect(() => {
    setStickyIdx(null);
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
      >
        <defs>
          <linearGradient id="gradPos" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={t.accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {monthBoundaries.map((b, i) => {
          const showLabel = i % labelStride === 0;
          return (
            <g key={i}>
              <line
                x1={xDay(b.idx)}
                x2={xDay(b.idx)}
                y1={padTop}
                y2={H - padBottom}
                stroke={t.border}
                strokeWidth="1"
                opacity={showLabel ? 0.6 : 0.3}
              />
              {showLabel && (
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
              )}
            </g>
          );
        })}

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
            {activeIdx === null && !privacy && (
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

        {/* Lowest-point callout when chart goes deeper than zero */}
        {showLowest && lowestIdx !== firstNegativeIdx && activeIdx === null && (
          <g>
            <circle
              cx={xDay(lowestIdx)}
              cy={y(lowestPoint.total)}
              r="3.5"
              fill={t.expense}
              stroke={t.bg}
              strokeWidth="1.2"
              opacity="0.85"
            />
            {!privacy && (
              <text
                x={xDay(lowestIdx)}
                y={y(lowestPoint.total) + 14}
                textAnchor="middle"
                fontSize="9"
                fill={t.expense}
                fontWeight="700"
              >
                low {fmtShort(lowestPoint.total)}
              </text>
            )}
          </g>
        )}

        {activeIdx !== null && (
          <g>
            <line
              x1={xDay(activeIdx)}
              x2={xDay(activeIdx)}
              y1={padTop}
              y2={H - padBottom}
              stroke={t.accent}
              strokeWidth="1"
              opacity="0.7"
            />
            <circle
              cx={xDay(activeIdx)}
              cy={y(dayPoints[activeIdx].total)}
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
          background: activeIdx !== null ? t.bgInset : 'transparent',
          borderRadius: 8,
          transition: 'background 0.15s',
        }}
      >
        {activeIdx !== null ? (
          (() => {
            const activePoint = dayPoints[activeIdx];
            const activeEvents = eventsByDayKey.get(dateKey(activePoint.date)) || [];
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: t.textDim, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {dayLabel(activePoint.date)}
                    {stickyIdx !== null && hoverIdx === null && (
                      <button
                        onClick={() => setStickyIdx(null)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${t.border}`,
                          borderRadius: 4,
                          color: t.textFaint,
                          fontSize: 9,
                          padding: '2px 6px',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                        }}
                      >
                        clear
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 18,
                      fontWeight: t.weightAmount,
                      color: activePoint.total < 0 ? t.expense : t.text,
                    }}
                    className={privacy ? 'private-blur' : ''}
                  >
                    {fmt(activePoint.total)}
                  </div>
                </div>
                {activeEvents.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                    {activeEvents.slice(0, 4).map((ev, i) => (
                      <div
                        key={i}
                        onClick={onTapEvent ? () => onTapEvent(ev) : undefined}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          color: t.textDim,
                          padding: '2px 0',
                          cursor: onTapEvent ? 'pointer' : 'default',
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
                    {activeEvents.length > 4 && (
                      <div style={{ fontSize: 10, color: t.textFaint, fontStyle: 'italic' }}>
                        + {activeEvents.length - 4} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div style={{ fontSize: 11, color: t.textFaint, textAlign: 'center', paddingTop: 4 }}>
            tap or drag the chart to inspect any day
          </div>
        )}
      </div>
    </div>
  );
}
