// Filter helpers for "viewing as" feature.
// When viewingAs === 'household', show everything.
// When viewingAs === earnerId, show that earner's items + household items.

export function filterAccounts(accounts, viewingAs) {
  if (viewingAs === 'household') return accounts;
  return accounts.filter((a) => a.ownerId === viewingAs || a.ownerId === 'household' || !a.ownerId);
}

export function filterBills(bills, viewingAs) {
  if (viewingAs === 'household') return bills;
  return bills.filter((b) => b.ownerId === viewingAs || b.ownerId === 'household' || !b.ownerId);
}

export function filterJobs(jobs, viewingAs) {
  if (viewingAs === 'household') return jobs;
  return jobs.filter((j) => j.earnerId === viewingAs);
}

export function filterSalaries(salaries, viewingAs) {
  if (viewingAs === 'household') return salaries;
  return salaries.filter((s) => s.earnerId === viewingAs);
}

export function filterExtIncome(items, viewingAs) {
  if (viewingAs === 'household') return items;
  return items.filter((i) => i.earnerId === viewingAs);
}

// Apply view filter to an entire data object - returns a new object with filtered arrays.
export function applyViewFilter(data, viewingAs) {
  if (viewingAs === 'household') return data;
  return {
    ...data,
    accounts: filterAccounts(data.accounts || [], viewingAs),
    bills: filterBills(data.bills || [], viewingAs),
    jobs: filterJobs(data.jobs || [], viewingAs),
    salaries: filterSalaries(data.salaries || [], viewingAs),
    externalIncome: filterExtIncome(data.externalIncome || [], viewingAs),
    // Transfers stay - they reference accounts which already filter themselves
    // Assets stay household-level for now
  };
}
