// HMRC tax engine - per-earner cumulative PAYE, Malta with service charge, salary support
//
// Each earner has their own cumulative tax-year position. Jobs and Salaries from
// the same earner combine into a single cumulative stream for PAYE calculations.
// Malta jobs (taxMode: 'malta') are kept entirely separate - they do NOT count
// toward the PAYE cumulative position, since they're a different tax stream.

export const TAX_BANDS = {
  personalAllowance: 12570,
  basicRateTop: 50270,
  higherRateTop: 125140,
  niLower: 12570,
  niUpper: 50270,
};

export const CLASS_2_WEEKLY = 3.45;
export const CLASS_2_ANNUAL = CLASS_2_WEEKLY * 52;

// Default earner ID for solo users
export const DEFAULT_EARNER_ID = 'self';

export function getTaxYearStart(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const aprilSixth = new Date(year, 3, 6);
  return d >= aprilSixth ? aprilSixth : new Date(year - 1, 3, 6);
}

export function getTaxYearEnd(date) {
  const start = getTaxYearStart(date);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getTaxYearLabel(date) {
  const start = getTaxYearStart(date);
  const startYr = start.getFullYear();
  const endYr = (startYr + 1).toString().slice(2);
  return `${startYr}/${endYr}`;
}

/**
 * Annual HMRC tax calc - Income Tax + Class 1 employee NI.
 */
export function calcAnnualHMRCTax(annualGross) {
  if (annualGross <= 0) return { incomeTax: 0, ni: 0, total: 0 };

  let pa = TAX_BANDS.personalAllowance;
  if (annualGross > 100000) {
    pa = Math.max(0, pa - (annualGross - 100000) / 2);
  }

  let incomeTax = 0;
  const taxable = Math.max(0, annualGross - pa);
  const basicBand = TAX_BANDS.basicRateTop - TAX_BANDS.personalAllowance;
  const higherBand = TAX_BANDS.higherRateTop - TAX_BANDS.basicRateTop;

  if (taxable <= basicBand) {
    incomeTax = taxable * 0.20;
  } else if (taxable <= basicBand + higherBand) {
    incomeTax = basicBand * 0.20 + (taxable - basicBand) * 0.40;
  } else {
    incomeTax = basicBand * 0.20 + higherBand * 0.40 + (taxable - basicBand - higherBand) * 0.45;
  }

  let ni = 0;
  if (annualGross > TAX_BANDS.niLower) {
    ni = (Math.min(annualGross, TAX_BANDS.niUpper) - TAX_BANDS.niLower) * 0.08;
  }
  if (annualGross > TAX_BANDS.niUpper) {
    ni += (annualGross - TAX_BANDS.niUpper) * 0.02;
  }

  return { incomeTax, ni, total: incomeTax + ni };
}

/**
 * Generate salary pay events within a date range.
 * Returns array of { date, gross, salaryId, earnerId }
 */
export function salaryPayDates(salary, rangeStart, rangeEnd) {
  if (!salary || !salary.annualGross || !salary.startDate) return [];

  const start = new Date(Math.max(new Date(salary.startDate), rangeStart));
  const end = salary.endDate ? new Date(Math.min(new Date(salary.endDate), rangeEnd)) : rangeEnd;

  const events = [];
  const freq = salary.frequency || 'monthly';

  if (freq === 'monthly') {
    const dom = Math.min(28, Number(salary.dayOfMonth) || 25);
    const monthly = Number(salary.annualGross) / 12;
    let cursor = new Date(start.getFullYear(), start.getMonth(), dom);
    if (cursor < start) cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, dom);
    while (cursor <= end) {
      events.push({ date: new Date(cursor), gross: monthly });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, dom);
    }
  } else if (freq === 'weekly') {
    const weekly = Number(salary.annualGross) / 52;
    let cursor = new Date(start);
    while (cursor <= end) {
      events.push({ date: new Date(cursor), gross: weekly });
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (freq === 'fourweekly') {
    const fourwk = Number(salary.annualGross) / 13;
    let cursor = new Date(start);
    while (cursor <= end) {
      events.push({ date: new Date(cursor), gross: fourwk });
      cursor.setDate(cursor.getDate() + 28);
    }
  }

  return events;
}

export const jobPayDate = (job) => {
  if (job.payMode === 'custom' && job.payDate) return new Date(job.payDate);
  return new Date(job.endDate || job.startDate);
};

const jobGross = (job) => (Number(job.days) || 0) * (Number(job.dayRate) || 0);

/**
 * Build a per-job tax ledger for ALL earners combined.
 * Returns Map<jobId, { gross, deduction, net, breakdown }>
 *
 * Cumulative PAYE works per-earner per-tax-year.
 * Salaries are NOT in this ledger (they're projected as monthly events at simulation time).
 */
export function buildJobTaxLedger(jobs, salaries = []) {
  const ledger = new Map();

  // Group PAYE jobs by earner+tax-year
  const buckets = new Map();
  jobs.forEach((job) => {
    if (job.taxMode !== 'paye') return;
    const earnerId = job.earnerId || DEFAULT_EARNER_ID;
    const payDate = jobPayDate(job);
    const tyStart = getTaxYearStart(payDate);
    const key = `${earnerId}:${tyStart.toISOString()}`;
    if (!buckets.has(key)) buckets.set(key, { earnerId, tyStart, items: [] });
    buckets.get(key).items.push(job);
  });

  buckets.forEach(({ earnerId, tyStart, items }) => {
    // Sort all PAYE income for this earner+TY by date - jobs only here.
    // For cumulative correctness against salary, we'd need to interleave salary events.
    // Salaries are processed per-event in projection.js with their own cumulative tracker.
    items.sort((a, b) => jobPayDate(a) - jobPayDate(b));

    let cumGross = 0, cumTax = 0, cumNI = 0;
    items.forEach((job) => {
      const gross = jobGross(job);
      const newCumGross = cumGross + gross;
      const newTotals = calcAnnualHMRCTax(newCumGross);

      const incomeTax = Math.max(0, newTotals.incomeTax - cumTax);
      const ni = Math.max(0, newTotals.ni - cumNI);
      const deduction = incomeTax + ni;

      ledger.set(job.id, {
        gross,
        deduction,
        net: gross - deduction,
        breakdown: { incomeTax, ni, serviceCharge: 0 },
      });

      cumGross = newCumGross;
      cumTax = newTotals.incomeTax;
      cumNI = newTotals.ni;
    });
  });

  // Malta and gross jobs - independent calc per job
  jobs.forEach((job) => {
    if (job.taxMode === 'paye') return;
    const gross = jobGross(job);
    let serviceCharge = 0;
    if (job.taxMode === 'malta' || job.taxMode === 'service') {
      serviceCharge = gross * (Number(job.serviceChargePercent) || 0) / 100;
    }
    ledger.set(job.id, {
      gross,
      deduction: serviceCharge,
      net: gross - serviceCharge,
      breakdown: { incomeTax: 0, ni: 0, serviceCharge },
    });
  });

  return ledger;
}

/**
 * Form preview: simulate cumulative position for THIS job given prior PAYE jobs
 * for the same earner in the same tax year.
 */
export function previewJobTax(job, allJobs) {
  const gross = jobGross(job);

  if (job.taxMode === 'malta' || job.taxMode === 'service') {
    const serviceCharge = gross * (Number(job.serviceChargePercent) || 0) / 100;
    return {
      gross,
      deduction: serviceCharge,
      net: gross - serviceCharge,
      breakdown: { incomeTax: 0, ni: 0, serviceCharge },
    };
  }

  if (job.taxMode === 'gross') {
    return { gross, deduction: 0, net: gross, breakdown: { incomeTax: 0, ni: 0, serviceCharge: 0 } };
  }

  // PAYE preview
  const earnerId = job.earnerId || DEFAULT_EARNER_ID;
  const payDate = jobPayDate(job);
  const tyStart = getTaxYearStart(payDate);

  const priorPaye = allJobs.filter((j) => {
    if (j.id === job.id) return false;
    if (j.taxMode !== 'paye') return false;
    if ((j.earnerId || DEFAULT_EARNER_ID) !== earnerId) return false;
    const jDate = jobPayDate(j);
    return jDate >= tyStart && jDate <= payDate;
  });

  const priorGross = priorPaye.reduce((s, j) => s + jobGross(j), 0);
  const priorTotals = calcAnnualHMRCTax(priorGross);
  const newTotals = calcAnnualHMRCTax(priorGross + gross);

  const incomeTax = Math.max(0, newTotals.incomeTax - priorTotals.incomeTax);
  const ni = Math.max(0, newTotals.ni - priorTotals.ni);

  return {
    gross,
    deduction: incomeTax + ni,
    net: gross - incomeTax - ni,
    breakdown: { incomeTax, ni, serviceCharge: 0 },
  };
}

/**
 * For a given earner + tax year, compute their YTD position.
 * Combines Salary events + PAYE jobs.
 */
export function earnerPayeYTD(jobs, salaries, earnerId, asOfDate = new Date()) {
  const tyStart = getTaxYearStart(asOfDate);
  const tyEnd = getTaxYearEnd(asOfDate);

  // Salary events within tax year, up to asOfDate
  const salaryEvents = [];
  salaries.forEach((sal) => {
    if ((sal.earnerId || DEFAULT_EARNER_ID) !== earnerId) return;
    salaryPayDates(sal, tyStart, tyEnd).forEach((ev) => {
      if (ev.date <= asOfDate) salaryEvents.push({ ...ev, salary: sal });
    });
  });

  // PAYE jobs within tax year, up to asOfDate
  const payeJobs = jobs.filter((j) => {
    if (j.taxMode !== 'paye') return false;
    if ((j.earnerId || DEFAULT_EARNER_ID) !== earnerId) return false;
    if (j.confidence === 'speculative') return false;
    const d = jobPayDate(j);
    return d >= tyStart && d <= asOfDate;
  });

  // Merge events sorted by date and compute cumulatively
  const merged = [
    ...salaryEvents.map((ev) => ({ date: ev.date, gross: ev.gross, kind: 'salary' })),
    ...payeJobs.map((j) => ({ date: jobPayDate(j), gross: jobGross(j), kind: 'job' })),
  ].sort((a, b) => a.date - b.date);

  let cumGross = 0, cumTax = 0, cumNI = 0;
  merged.forEach((ev) => {
    cumGross += ev.gross;
    const t = calcAnnualHMRCTax(cumGross);
    cumTax = t.incomeTax;
    cumNI = t.ni;
  });

  return {
    gross: cumGross,
    incomeTax: cumTax,
    ni: cumNI,
    deduction: cumTax + cumNI,
    net: cumGross - cumTax - cumNI,
  };
}

/**
 * Malta gross income for an earner this tax year.
 */
export function earnerMaltaYTD(jobs, earnerId, asOfDate = new Date()) {
  const tyStart = getTaxYearStart(asOfDate);
  return jobs
    .filter((j) => {
      if (j.taxMode !== 'malta' && j.taxMode !== 'service') return false;
      if ((j.earnerId || DEFAULT_EARNER_ID) !== earnerId) return false;
      if (j.confidence === 'speculative') return false;
      const d = jobPayDate(j);
      return d >= tyStart && d <= asOfDate;
    })
    .reduce((s, j) => s + jobGross(j), 0);
}
