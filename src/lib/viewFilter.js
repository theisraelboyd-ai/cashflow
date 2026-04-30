// View filter helpers.
//
// Account ownership rules:
//   accounts.ownerId === 'household'  -> the Joint pot, shared
//   accounts.ownerId === earnerId     -> belongs to that specific earner
//   accounts.ownerId === undefined    -> legacy data, treat as household
//
// Bills, transfers, external income are ALL filtered by their associated account.
// Bill ownership is DERIVED from the account that pays the bill - we no longer
// store ownerId on the bill itself.
//
// View modes:
//   viewingAs === 'household' -> show everything
//   viewingAs === earnerId    -> show that earner's accounts AND household accounts
//                                (because everyone needs to see the joint pot)

const isHouseholdAccount = (acc) => !acc || acc.ownerId === 'household' || !acc.ownerId;
const isOwnedByEarner = (acc, earnerId) => acc && acc.ownerId === earnerId;

export function filterAccounts(accounts, viewingAs) {
  if (viewingAs === 'household') return accounts;
  return accounts.filter((a) => isOwnedByEarner(a, viewingAs) || isHouseholdAccount(a));
}

// Bills are visible if they pay from a visible account.
export function filterBills(bills, viewingAs, accounts) {
  if (viewingAs === 'household') return bills;
  const visibleIds = new Set(filterAccounts(accounts || [], viewingAs).map((a) => a.id));
  return bills.filter((b) => visibleIds.has(b.accountId));
}

// Jobs filtered by earner.
export function filterJobs(jobs, viewingAs) {
  if (viewingAs === 'household') return jobs;
  return jobs.filter((j) => j.earnerId === viewingAs);
}

// Salaries filtered by earner.
export function filterSalaries(salaries, viewingAs) {
  if (viewingAs === 'household') return salaries;
  return salaries.filter((s) => s.earnerId === viewingAs);
}

// External income: filter by account visibility.
export function filterExtIncome(items, viewingAs, accounts) {
  if (viewingAs === 'household') return items;
  const visibleIds = new Set(filterAccounts(accounts || [], viewingAs).map((a) => a.id));
  return items.filter((i) => visibleIds.has(i.accountId));
}

// Transfers visible if either side is a visible account.
export function filterTransfers(transfers, viewingAs, accounts) {
  if (viewingAs === 'household') return transfers;
  const visibleIds = new Set(filterAccounts(accounts || [], viewingAs).map((a) => a.id));
  return transfers.filter((tr) => visibleIds.has(tr.fromAccountId) || visibleIds.has(tr.toAccountId));
}

// Apply view filter to entire data object.
// Defensive: if viewingAs points to an earner that no longer exists in data,
// fall back to 'household' so the user doesn't end up looking at an empty
// filtered view because of stale localStorage state.
export function applyViewFilter(data, viewingAs) {
  const earners = data.earners || [];
  const validEarnerIds = new Set(earners.map((e) => e.id));
  const effectiveView = (viewingAs === 'household' || validEarnerIds.has(viewingAs))
    ? viewingAs
    : 'household';
  if (effectiveView === 'household') return data;
  const accounts = filterAccounts(data.accounts || [], effectiveView);
  return {
    ...data,
    accounts,
    bills: filterBills(data.bills || [], effectiveView, data.accounts || []),
    jobs: filterJobs(data.jobs || [], effectiveView),
    salaries: filterSalaries(data.salaries || [], effectiveView),
    externalIncome: filterExtIncome(data.externalIncome || [], effectiveView, data.accounts || []),
    transfers: filterTransfers(data.transfers || [], effectiveView, data.accounts || []),
  };
}

// Helper: classify a bill as 'yours' or 'household' given the viewing earner.
// Returns 'household' if the bill pays from a household account,
// 'mine' if it pays from the viewing earner's account,
// 'other' if it pays from another earner's account (shouldn't normally be visible).
export function classifyBillOwnership(bill, accounts, viewingAs) {
  const acc = (accounts || []).find((a) => a.id === bill.accountId);
  if (!acc || isHouseholdAccount(acc)) return 'household';
  if (isOwnedByEarner(acc, viewingAs)) return 'mine';
  return 'other';
}

// Same for any item with an accountId
export function classifyByAccount(item, accounts, viewingAs) {
  const acc = (accounts || []).find((a) => a.id === item.accountId);
  if (!acc || isHouseholdAccount(acc)) return 'household';
  if (isOwnedByEarner(acc, viewingAs)) return 'mine';
  return 'other';
}

export { isHouseholdAccount, isOwnedByEarner };
