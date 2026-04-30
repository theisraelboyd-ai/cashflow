// Event generation and balance projection
// Now handles salaries with cumulative PAYE per earner per tax year

import {
  buildJobTaxLedger,
  jobPayDate,
  salaryPayDates,
  calcAnnualHMRCTax,
  getTaxYearStart,
  DEFAULT_EARNER_ID,
} from './tax.js';

export function occurrencesInRange(item, rangeStart, rangeEnd) {
  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(23, 59, 59, 999);
  const out = [];

  if (item.frequency === 'oneoff') {
    if (item.date) {
      const d = new Date(item.date);
      if (d >= start && d <= end) out.push(d);
    }
    return out;
  }

  if (item.frequency === 'yearly') {
    if (item.date) {
      const d = new Date(item.date);
      for (let y = start.getFullYear(); y <= end.getFullYear() + 1; y++) {
        const occ = new Date(d);
        occ.setFullYear(y);
        if (occ >= start && occ <= end) out.push(occ);
      }
    }
    return out;
  }

  if (item.frequency === 'monthly') {
    const dom = Math.min(28, Number(item.dayOfMonth) || 1);
    let cursor = new Date(start.getFullYear(), start.getMonth(), dom);
    if (cursor < start) {
      cursor = new Date(start.getFullYear(), start.getMonth() + 1, dom);
    }
    while (cursor <= end) {
      out.push(new Date(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, dom);
    }
    return out;
  }

  if (item.frequency === 'weekly') {
    let cursor = new Date(start);
    while (cursor <= end) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return out;
  }

  return out;
}

const getAccountName = (data, id) =>
  data.accounts.find((a) => a.id === id)?.name || '?';

/**
 * Generate every account-affecting event in [start, end] inclusive.
 * Handles salaries with proper cumulative PAYE tracking per earner per tax year.
 */
export function generateEvents(data, start, end, options = {}) {
  const { includeSpeculative = false, likelyWeight = 1.0 } = options;
  const events = [];

  // Job income
  const taxLedger = buildJobTaxLedger(data.jobs || [], data.salaries || []);

  (data.jobs || []).forEach((job) => {
    if (job.confidence === 'speculative' && !includeSpeculative) return;

    const date = jobPayDate(job);
    if (date < start || date > end) return;

    const calc = taxLedger.get(job.id) || { net: 0 };
    let amount = calc.net;
    if (job.confidence === 'likely') amount *= likelyWeight;

    events.push({
      date: new Date(date),
      accountId: job.accountId,
      amount,
      label: job.title || 'Job',
      type: 'job',
      jobId: job.id,
      earnerId: job.earnerId || DEFAULT_EARNER_ID,
      confidence: job.confidence,
    });
  });

  // Salary events - per earner per tax year cumulative PAYE
  // We need to track cumulative position for each earner across the entire window
  // including events BEFORE `start` so the cumulative math is correct mid-year.
  const salariesByEarner = new Map();
  (data.salaries || []).forEach((sal) => {
    const earnerId = sal.earnerId || DEFAULT_EARNER_ID;
    if (!salariesByEarner.has(earnerId)) salariesByEarner.set(earnerId, []);
    salariesByEarner.get(earnerId).push(sal);
  });

  // For each earner, walk through tax years touched by the projection range.
  // For each tax year, build the salary + PAYE-job event stream from TY start
  // and emit only those that fall within [start, end].
  salariesByEarner.forEach((earnerSalaries, earnerId) => {
    // Collect all tax years touched
    const tyStarts = new Set();
    let cursor = new Date(start);
    while (cursor <= end) {
      tyStarts.add(getTaxYearStart(cursor).getTime());
      cursor.setMonth(cursor.getMonth() + 1);
    }

    tyStarts.forEach((tyStartMs) => {
      const tyStart = new Date(tyStartMs);
      const tyEnd = new Date(tyStart);
      tyEnd.setFullYear(tyEnd.getFullYear() + 1);
      tyEnd.setDate(tyEnd.getDate() - 1);

      // Build full event list for this earner+TY (salaries + PAYE jobs)
      const stream = [];
      earnerSalaries.forEach((sal) => {
        salaryPayDates(sal, tyStart, tyEnd).forEach((pe) => {
          stream.push({ date: pe.date, gross: pe.gross, kind: 'salary', salary: sal });
        });
      });
      (data.jobs || []).forEach((job) => {
        if (job.taxMode !== 'paye') return;
        if ((job.earnerId || DEFAULT_EARNER_ID) !== earnerId) return;
        if (job.confidence === 'speculative' && !includeSpeculative) return;
        const d = jobPayDate(job);
        if (d < tyStart || d > tyEnd) return;
        stream.push({ date: d, gross: (Number(job.days) || 0) * (Number(job.dayRate) || 0), kind: 'job', job });
      });

      stream.sort((a, b) => a.date - b.date);

      let cumGross = 0, cumTax = 0, cumNI = 0;
      stream.forEach((ev) => {
        const newCumGross = cumGross + ev.gross;
        const newTotals = calcAnnualHMRCTax(newCumGross);
        const incomeTax = Math.max(0, newTotals.incomeTax - cumTax);
        const ni = Math.max(0, newTotals.ni - cumNI);
        const deduction = incomeTax + ni;
        const net = ev.gross - deduction;

        // Only emit salary events here. Job events were already emitted above
        // using the static ledger, but that ledger doesn't see salaries.
        // We need to re-emit jobs that have salaries in the same TY+earner.
        // Easier: skip jobs here, but adjust the static ledger output later.
        if (ev.kind === 'salary' && ev.date >= start && ev.date <= end) {
          events.push({
            date: new Date(ev.date),
            accountId: ev.salary.accountId,
            amount: net,
            label: ev.salary.name || 'Salary',
            type: 'salary',
            salaryId: ev.salary.id,
            earnerId,
            grossAmount: ev.gross,
            deductionAmount: deduction,
          });
        }

        cumGross = newCumGross;
        cumTax = newTotals.incomeTax;
        cumNI = newTotals.ni;
      });

      // If this earner has both salary and PAYE jobs in this TY, the static
      // ledger output for those jobs is wrong (it didn't account for salary).
      // Override those job events in the events array with re-computed values.
      const hasSalary = earnerSalaries.some(
        (s) => salaryPayDates(s, tyStart, tyEnd).length > 0
      );
      if (hasSalary) {
        // Rebuild stream to compute correct net for jobs
        let cum2 = 0, tax2 = 0, ni2 = 0;
        const correctedJobNets = new Map();
        stream.forEach((ev) => {
          const newCumGross = cum2 + ev.gross;
          const newTotals = calcAnnualHMRCTax(newCumGross);
          const incomeTax = Math.max(0, newTotals.incomeTax - tax2);
          const ni = Math.max(0, newTotals.ni - ni2);
          if (ev.kind === 'job') {
            correctedJobNets.set(ev.job.id, {
              net: ev.gross - incomeTax - ni,
              deduction: incomeTax + ni,
              incomeTax,
              ni,
            });
          }
          cum2 = newCumGross;
          tax2 = newTotals.incomeTax;
          ni2 = newTotals.ni;
        });

        // Patch the existing job events in events[]
        events.forEach((emitted) => {
          if (emitted.type !== 'job') return;
          if (emitted.earnerId !== earnerId) return;
          const corrected = correctedJobNets.get(emitted.jobId);
          if (!corrected) return;
          let amount = corrected.net;
          // re-apply confidence weight
          const job = (data.jobs || []).find((j) => j.id === emitted.jobId);
          if (job?.confidence === 'likely') amount *= likelyWeight;
          emitted.amount = amount;
        });
      }
    });
  });

  // Bills
  (data.bills || []).forEach((bill) => {
    if (bill.appliedToBalance) return;
    occurrencesInRange(bill, start, end).forEach((date) => {
      events.push({
        date,
        accountId: bill.accountId,
        amount: -Number(bill.amount),
        label: bill.name || 'Bill',
        type: 'bill',
        billId: bill.id,
        category: bill.category,
      });
    });
  });

  // External income
  (data.externalIncome || []).forEach((item) => {
    if (item.appliedToBalance) return;
    occurrencesInRange(item, start, end).forEach((date) => {
      events.push({
        date,
        accountId: item.accountId,
        amount: Number(item.amount),
        label: item.name || 'Income',
        type: 'extincome',
        extincomeId: item.id,
        earnerId: item.earnerId || DEFAULT_EARNER_ID,
      });
    });
  });

  // Transfers
  (data.transfers || []).forEach((transfer) => {
    // If a one-off was already applied directly to balances when recorded,
    // don't generate events for it (would double-count)
    if (transfer.appliedToBalance) return;
    occurrencesInRange(transfer, start, end).forEach((date) => {
      events.push({
        date,
        accountId: transfer.fromAccountId,
        amount: -Number(transfer.amount),
        label: `→ ${getAccountName(data, transfer.toAccountId)}`,
        type: 'transfer-out',
        transferId: transfer.id,
      });
      events.push({
        date,
        accountId: transfer.toAccountId,
        amount: Number(transfer.amount),
        label: `← ${getAccountName(data, transfer.fromAccountId)}`,
        type: 'transfer-in',
        transferId: transfer.id,
      });
    });
  });

  events.sort((a, b) => a.date - b.date);
  return events;
}

export function projectBalances(data, fromDate, toDate, options = {}) {
  const start = new Date(fromDate);
  // Track the original "live" start before normalising to midnight - we need
  // it for the skipEventsAtStart logic so we skip events that fired between
  // midnight and the caller's actual "now".
  const liveStartMs = start.getTime();
  start.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  const balances = {};
  (data.accounts || []).forEach((a) => {
    if (!a || !a.id) return;
    const n = Number(a.balance);
    balances[a.id] = Number.isFinite(n) ? n : 0;
  });

  const events = generateEvents(data, start, end, options) || [];

  const dayPoints = [];
  const cursor = new Date(start);
  let eventIdx = 0;

  // skipEventsAtStart: when the caller has forecast-advanced account balances
  // through "now" (i.e. today's already-fired events are baked in), skip
  // events at-or-before liveStartMs to avoid double-counting.
  // Default false to preserve old behaviour for callers that haven't forecast first.
  if (options.skipEventsAtStart) {
    while (eventIdx < events.length && events[eventIdx] && events[eventIdx].date.getTime() <= liveStartMs) {
      eventIdx++;
    }
  }

  // Guard against pathological inputs (e.g. start > end, NaN dates)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    return { dayPoints: [], events: [] };
  }

  // Hard cap iterations so we never hang
  let iterations = 0;
  const maxIterations = 366 * 5;  // 5 years of days max

  while (cursor <= end && iterations < maxIterations) {
    iterations++;
    const dayEnd = new Date(cursor);
    dayEnd.setHours(23, 59, 59, 999);

    while (eventIdx < events.length && events[eventIdx] && events[eventIdx].date <= dayEnd) {
      const ev = events[eventIdx];
      const evAmt = Number(ev.amount);
      if (Number.isFinite(evAmt) && balances[ev.accountId] !== undefined) {
        balances[ev.accountId] += evAmt;
      }
      eventIdx++;
    }

    const total = Object.values(balances).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    dayPoints.push({
      date: new Date(cursor),
      total,
      perAccount: { ...balances },
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return { dayPoints, events };
}

/**
 * Forecast the *current* balance for each account by walking events from each
 * account's lastUpdated forward to today. Returns a new accounts array where
 * each account's `balance` is the forecasted current value, and `lastUpdated`
 * is bumped to today (in memory only — caller decides whether to persist).
 *
 * The original `account.balance` is preserved as `account.anchorBalance` so
 * callers can show "anchor £X — forecasted £Y" if they want to surface drift.
 *
 * Past one-off events that have `appliedToBalance: true` are skipped (they
 * already modified the anchor when recorded).
 *
 * Recurring schedule events that fall between lastUpdated and today ARE
 * applied — the assumption is "this scheduled bill/transfer ran in real life,
 * so the bank balance has changed since the user last reconciled".
 */
export function forecastCurrentBalances(data, today) {
  const todayMs = new Date(today).getTime();
  const todayDate = new Date(todayMs);

  return (data.accounts || []).map((account) => {
    try {
      const anchor = Number(account.balance);
      const anchorBalance = Number.isFinite(anchor) ? anchor : 0;
      const lastUpdatedMs = new Date(account.lastUpdated || todayMs).getTime();

      if (!Number.isFinite(lastUpdatedMs) || lastUpdatedMs >= todayMs) {
        // Reconciled at-or-after the "today" cutoff — no drift to compute.
        return { ...account, anchorBalance, forecastedBalance: anchorBalance };
      }

      // Walk events strictly between lastUpdated and today.
      // Note: the projection that follows this forecast should start AT or
      // AFTER `today`, so events whose date <= todayMs are owned by the
      // forecast, and events > todayMs are owned by the projection.
      const lastUpdated = new Date(lastUpdatedMs);
      const events = generateEvents(data, lastUpdated, todayDate, { includeSpeculative: false, likelyWeight: 1.0 }) || [];

      let forecasted = anchorBalance;
      for (const ev of events) {
        if (!ev || ev.accountId !== account.id) continue;
        const evMs = new Date(ev.date).getTime();
        if (!Number.isFinite(evMs)) continue;
        // Only events strictly AFTER lastUpdated and at-or-before today count
        if (evMs <= lastUpdatedMs) continue;
        if (evMs > todayMs) continue;
        if (ev.appliedToBalance) continue;
        const amt = Number(ev.amount);
        if (!Number.isFinite(amt)) continue;
        forecasted += amt;
      }

      return { ...account, anchorBalance, forecastedBalance: forecasted };
    } catch (e) {
      console.warn('forecastCurrentBalances failed for account', account?.id, e);
      const safeBal = Number.isFinite(Number(account?.balance)) ? Number(account.balance) : 0;
      return { ...account, anchorBalance: safeBal, forecastedBalance: safeBal };
    }
  });
}

export function eventsByDay(events) {
  const map = new Map();
  events.forEach((ev) => {
    const key = new Date(ev.date);
    key.setHours(0, 0, 0, 0);
    const k = key.toISOString().slice(0, 10);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(ev);
  });
  return map;
}
