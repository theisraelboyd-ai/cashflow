import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'cashflow_v3';

export const defaultData = {
  schemaVersion: 5,
  earners: [
    { id: 'self', name: 'You', isPrimary: true },
  ],
  accounts: [
    {
      id: 'acc1',
      name: 'Personal',
      balance: 0,
      lastUpdated: new Date().toISOString(),
      colorIdx: 0,
      ownerId: 'self',
    },
    {
      id: 'acc2',
      name: 'Joint',
      balance: 0,
      lastUpdated: new Date().toISOString(),
      colorIdx: 1,
      ownerId: 'household',
    },
    {
      id: 'acc3',
      name: 'Savings',
      balance: 0,
      lastUpdated: new Date().toISOString(),
      colorIdx: 5,
      ownerId: 'household',
    },
  ],
  jobs: [],
  salaries: [],
  bills: [],
  externalIncome: [],
  transfers: [],
  assets: [],
  reconciliations: [],
};

export function useStoredData() {
  const [data, setData] = useState(null);
  const isFirstWrite = useRef(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = {
          ...defaultData,
          ...parsed,
          earners: parsed.earners || defaultData.earners,
          salaries: parsed.salaries || [],
          accounts: parsed.accounts || defaultData.accounts,
          jobs: parsed.jobs || [],
          bills: parsed.bills || [],
          externalIncome: parsed.externalIncome || [],
          transfers: parsed.transfers || [],
          assets: parsed.assets || [],
          reconciliations: parsed.reconciliations || [],
        };
        // migrate legacy 'service' tax mode -> 'malta'
        merged.jobs = merged.jobs.map((j) => ({
          ...j,
          taxMode: j.taxMode === 'service' ? 'malta' : j.taxMode,
          earnerId: j.earnerId || 'self',
        }));
        // Schema v5: add ownerId to accounts and bills (defaults to household)
        merged.accounts = merged.accounts.map((a) => ({
          ...a,
          ownerId: a.ownerId || 'household',
        }));
        merged.bills = merged.bills.map((b) => ({
          ...b,
          ownerId: b.ownerId || 'household',
        }));
        merged.schemaVersion = 5;
        setData(merged);
      } else {
        setData(defaultData);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
      setData(defaultData);
    }
  }, []);

  useEffect(() => {
    if (data === null) return;
    if (isFirstWrite.current) {
      isFirstWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }, [data]);

  const update = (fn) => {
    setData((prev) => {
      const next = structuredClone(prev);
      const result = fn(next);
      return result || next;
    });
  };

  return [data, setData, update];
}

export function exportData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cashflow-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importDataFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
