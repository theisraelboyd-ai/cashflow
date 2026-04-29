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
  start.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  const balances = {};
  (data.accounts || []).forEach((a) => {
    balances[a.id] = Number(a.balance);
  });

  const events = generateEvents(data, start, end, options);

  const dayPoints = [];
  const cursor = new Date(start);
  let eventIdx = 0;

  while (cursor <= end) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(23, 59, 59, 999);

    while (eventIdx < events.length && events[eventIdx].date <= dayEnd) {
      const ev = events[eventIdx];
      if (balances[ev.accountId] !== undefined) {
        balances[ev.accountId] += ev.amount;
      }
      eventIdx++;
    }

    const total = Object.values(balances).reduce((s, v) => s + v, 0);
    dayPoints.push({
      date: new Date(cursor),
      total,
      perAccount: { ...balances },
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return { dayPoints, events };
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
