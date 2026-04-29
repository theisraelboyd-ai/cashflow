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

// External income: filter on DESTINATION account visibility, not earner.
// Joanne paying into a Joint account is income I (Israel) need to see.
export function filterExtIncome(items, viewingAs, accounts) {
  if (viewingAs === 'household') return items;
  const visibleAccountIds = new Set(filterAccounts(accounts, viewingAs).map((a) => a.id));
  return items.filter((i) => visibleAccountIds.has(i.accountId));
}

// Transfers: visible if EITHER side of the transfer is to/from a visible account.
export function filterTransfers(transfers, viewingAs, accounts) {
  if (viewingAs === 'household') return transfers;
  const visibleAccountIds = new Set(filterAccounts(accounts, viewingAs).map((a) => a.id));
  return transfers.filter((tr) => visibleAccountIds.has(tr.fromAccountId) || visibleAccountIds.has(tr.toAccountId));
}

// Apply view filter to an entire data object - returns a new object with filtered arrays.
export function applyViewFilter(data, viewingAs) {
  if (viewingAs === 'household') return data;
  const accounts = filterAccounts(data.accounts || [], viewingAs);
  return {
    ...data,
    accounts,
    bills: filterBills(data.bills || [], viewingAs),
    jobs: filterJobs(data.jobs || [], viewingAs),
    salaries: filterSalaries(data.salaries || [], viewingAs),
    externalIncome: filterExtIncome(data.externalIncome || [], viewingAs, data.accounts || []),
    transfers: filterTransfers(data.transfers || [], viewingAs, data.accounts || []),
    // Assets stay household-level for now
  };
}
