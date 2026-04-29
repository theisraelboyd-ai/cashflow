import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt, fmtShort, dayLabel, dateKey, monthLabel } from '../lib/format.js';

export function TrajectoryChart({ dayPoints, events, onTapEvent, accounts = [], visibleAccountIds = null }) {
  const { t, privacy, isDesktop } = useTheme();
  const W = isDesktop ? 800 : 320;
  const H = isDesktop ? 280 : 200;
  const [hoverIdx, setHoverIdx] = useState(null);
  const [stickyIdx, setStickyIdx] = useState(null);
  const svgRef = useRef(null);

  const eventsByDayKey = useMemo(() => {
    const map = new Map();
    (events || []).forEach((ev) => {
      if (!ev || !ev.date) return;
      const k = dateKey(ev.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ev);
    });
    return map;
  }, [events]);

  // Don't return early here — that violates rules of hooks since other hooks
  // are declared further down. Use safeDayPoints throughout, and return the
  // empty placeholder at the *end* of the component, after all hooks have run.
  const safeDayPoints = (Array.isArray(dayPoints) && dayPoints.length > 0) ? dayPoints : [];
  const hasData = safeDayPoints.length > 0;

  const padTop = 14;
  const padBottom = 22;
  const padX = 10;
  const padLeft = 36;  // extra room for £k labels on the y-axis

  const xDay = (i) =>
    padLeft + (i / Math.max(1, safeDayPoints.length - 1)) * (W - padLeft - padX);

  const totals = safeDayPoints.map((p) => p.total || 0);
  const maxBalance = totals.length ? Math.max(...totals, 100) : 100;
  const minBalance = totals.length ? Math.min(...totals, 0) : 0;

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
  const linePath = safeDayPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xDay(i)} ${y(p.total || 0)}`).join(' ');
  const fillPath = safeDayPoints.length > 0
    ? `M ${xDay(0)} ${yZero} ` +
      safeDayPoints.map((p, i) => `L ${xDay(i)} ${y(p.total || 0)}`).join(' ') +
      ` L ${xDay(safeDayPoints.length - 1)} ${yZero} Z`
    : '';

  // Compute coloured segments. Always-on now - the convention is
  // green = balance going up, red = balance going down, sage = stable.
  // Threshold is small enough to catch real changes, but large enough to
  // stop noise pixels flipping color back and forth.
  const longHorizon = safeDayPoints.length > 90;

  const segmentColor = (kind) => {
    if (kind === 'down') return t.expense;
    if (kind === 'up') return t.income;
    return t.accent;
  };

  const lineSegments = useMemo(() => {
    if (safeDayPoints.length < 2) return [];
    const classifySeg = (a, b) => {
      const delta = b - a;
      // Threshold scales with magnitude — small movements don't trigger colour change.
      const threshold = Math.max(20, Math.abs(a) * 0.003);
      if (delta < -threshold) return 'down';
      if (delta > threshold) return 'up';
      return 'flat';
    };
    const segments = [];
    let cur = { kind: classifySeg(safeDayPoints[0].total, safeDayPoints[1].total), startIdx: 0 };
    for (let i = 1; i < safeDayPoints.length; i++) {
      const k = classifySeg(safeDayPoints[i - 1].total, safeDayPoints[i].total);
      if (k !== cur.kind) {
        segments.push({ ...cur, endIdx: i });
        cur = { kind: k, startIdx: i };
      }
    }
    segments.push({ ...cur, endIdx: safeDayPoints.length - 1 });
    return segments;
  }, [safeDayPoints]);

  // Per-account paths for overlay lines.
  // We need to recompute the y-axis scale to fit all account values, not just total.
  // But for visual clarity we'll plot each account using its own y at the same scale
  // as the main chart, so they share the chart space.
  const perAccountPaths = useMemo(() => {
    if (!accounts || accounts.length === 0 || safeDayPoints.length === 0) return [];
    const visibleIds = visibleAccountIds || new Set(accounts.map((a) => a.id));
    return accounts
      .filter((a) => visibleIds.has(a.id))
      .map((a) => {
        const path = safeDayPoints.map((p, i) => {
          const balance = (p.perAccount && p.perAccount[a.id] !== undefined) ? p.perAccount[a.id] : 0;
          return `${i === 0 ? 'M' : 'L'} ${xDay(i)} ${y(balance)}`;
        }).join(' ');
        return { id: a.id, name: a.name, path, color: t.accountColors[a.colorIdx ?? 0] || t.accent };
      });
  }, [accounts, visibleAccountIds, safeDayPoints, t]);

  const firstNegativeIdx = safeDayPoints.findIndex((p) => p.total < 0);

  // Find lowest point for callout
  let lowestIdx = 0;
  for (let i = 1; i < safeDayPoints.length; i++) {
    if (safeDayPoints[i].total < safeDayPoints[lowestIdx].total) lowestIdx = i;
  }
  const lowestPoint = safeDayPoints[lowestIdx] || null;
  const showLowest = lowestPoint && lowestPoint.total < 0;

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
    const avgGap = (W - padLeft - padX) / (monthBoundaries.length + 1);
    if (avgGap < 22) return 3;       // 12m+ — every 3rd
    if (avgGap < 36) return 2;       // 6m — every other
    return 1;                         // 1m/3m — all
  }, [monthBoundaries.length]);

  const showFirstMonthLabel = monthBoundaries.length === 0 || monthBoundaries[0].idx > dayPoints.length * 0.14;

  // Y-axis ticks - clean £k increments scaled to the visible range.
  // Picks a "nice" step so we end up with ~4-5 labels.
  const yTicks = useMemo(() => {
    if (safeDayPoints.length === 0) return [];
    const range = yMaxPadded - yMinPadded;
    if (range <= 0) return [];
    // Choose a "nice" step: 100, 250, 500, 1k, 2.5k, 5k, 10k, 25k, 50k, 100k
    const niceSteps = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    const targetTicks = 4;
    const rawStep = range / targetTicks;
    const step = niceSteps.find((s) => s >= rawStep) || niceSteps[niceSteps.length - 1];
    // Find first tick at-or-above yMinPadded, snapped to the step
    const firstTick = Math.ceil(yMinPadded / step) * step;
    const ticks = [];
    for (let v = firstTick; v <= yMaxPadded; v += step) {
      ticks.push(v);
      if (ticks.length > 8) break;  // safety
    }
    return ticks;
  }, [safeDayPoints.length, yMinPadded, yMaxPadded]);

  // Format y-axis tick label - £k for thousands, plain for sub-1k
  const fmtTick = (v) => {
    if (Math.abs(v) >= 1000) {
      const k = v / 1000;
      // 1 decimal if it's not whole, otherwise integer
      return `£${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
    }
    return `£${Math.round(v)}`;
  };

  // Bills + income marker positions, with a hit-test list for snap-to-event
  const billDaysRaw = useMemo(() => {
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

  const incomeDaysRaw = useMemo(() => {
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

  // Density adaptation: only show dots when there's enough room.
  // Approx ~6-8px between dots is the readable threshold.
  // For long horizons, show only the largest-magnitude events.
  const totalDots = billDaysRaw.length + incomeDaysRaw.length;
  const minDotSpacing = 7;  // SVG units
  const availableWidth = W - padLeft - padX;
  const maxComfortableDots = Math.floor(availableWidth / minDotSpacing);

  // If we have too many dots, sort by magnitude and keep the top N
  const billDays = useMemo(() => {
    if (totalDots <= maxComfortableDots) return billDaysRaw;
    // Combine both lists, sort by absolute value, take top maxDots, then split back
    const allMarkers = [...billDaysRaw.map((d) => ({ ...d, _kind: 'bill' })), ...incomeDaysRaw.map((d) => ({ ...d, _kind: 'income' }))];
    allMarkers.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return allMarkers.filter((d) => d._kind === 'bill').slice(0, Math.ceil(maxComfortableDots * 0.6));
  }, [billDaysRaw, incomeDaysRaw, totalDots, maxComfortableDots]);

  const incomeDays = useMemo(() => {
    if (totalDots <= maxComfortableDots) return incomeDaysRaw;
    const allMarkers = [...billDaysRaw.map((d) => ({ ...d, _kind: 'bill' })), ...incomeDaysRaw.map((d) => ({ ...d, _kind: 'income' }))];
    allMarkers.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    return allMarkers.filter((d) => d._kind === 'income').slice(0, Math.ceil(maxComfortableDots * 0.4));
  }, [billDaysRaw, incomeDaysRaw, totalDots, maxComfortableDots]);

  const isCompacted = totalDots > maxComfortableDots;

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
    const i = Math.round(((svgX - padLeft) / (W - padLeft - padX)) * (dayPoints.length - 1));
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
  }, [safeDayPoints.length]);

  // After all hooks: handle empty data
  if (!hasData) {
    return (
      <div
        style={{
          background: t.bgElev,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: '32px 16px',
          textAlign: 'center',
          color: t.textFaint,
          fontSize: 13,
          fontStyle: 'italic',
        }}
      >
        No data to display in this range
      </div>
    );
  }

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

        {/* Y-axis grid lines and £k labels */}
        {yTicks.map((v, i) => {
          const yPos = y(v);
          if (yPos < padTop - 2 || yPos > H - padBottom + 2) return null;
          return (
            <g key={`y-${i}`}>
              <line
                x1={padLeft}
                x2={W - padX}
                y1={yPos}
                y2={yPos}
                stroke={t.border}
                strokeWidth="1"
                opacity="0.35"
                strokeDasharray={v === 0 ? '0' : '2 4'}
              />
              <text
                x={padLeft - 4}
                y={yPos + 3}
                fontSize="9"
                fill={t.textFaint}
                fontWeight="600"
                textAnchor="end"
                letterSpacing="0.3"
              >
                {fmtTick(v)}
              </text>
            </g>
          );
        })}

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
            x={padLeft + 2}
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

        {/* Always coloured segments based on direction */}
        {lineSegments.map((seg, i) => {
          const ptsPath = [];
          for (let j = seg.startIdx; j <= seg.endIdx; j++) {
            ptsPath.push(`${j === seg.startIdx ? 'M' : 'L'} ${xDay(j)} ${y(safeDayPoints[j].total)}`);
          }
          return (
            <path
              key={`seg-${i}`}
              d={ptsPath.join(' ')}
              fill="none"
              stroke={segmentColor(seg.kind)}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={seg.kind === 'flat' ? 0.7 : 0.95}
            />
          );
        })}

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
