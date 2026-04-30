import React, { useState, useEffect } from 'react';
import { useStoredData } from './hooks/useStoredData.js';
import { ThemeProvider, useTheme } from './lib/ThemeContext.jsx';
import { Home } from './components/Home.jsx';
import { Activity } from './components/Activity.jsx';
import { CalendarPage } from './components/CalendarPage.jsx';
import { Budget } from './components/Budget.jsx';
import { Wealth } from './components/Wealth.jsx';
import { Modal } from './components/Modal.jsx';
import { Nav } from './components/Nav.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

function AppShell() {
  const { styles, viewingAs, setViewingAs } = useTheme();
  const [data, setData, update] = useStoredData();
  const [page, setPage] = useState('home');
  const [modal, setModal] = useState(null);

  // Self-heal: if stored viewingAs points to an earner that no longer exists
  // in the current data, reset it to 'household' so the user doesn't end up
  // looking at an empty filtered view because of stale localStorage state.
  useEffect(() => {
    if (!data) return;
    if (viewingAs === 'household') return;
    const earnerIds = new Set((data.earners || []).map((e) => e.id));
    if (!earnerIds.has(viewingAs)) {
      setViewingAs('household');
    }
  }, [data, viewingAs, setViewingAs]);

  if (!data) {
    return (
      <div style={{ ...styles.app, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, opacity: 0.6, fontFamily: "'Cormorant Garamond', serif" }}>Loading…</div>
      </div>
    );
  }

  // Use page name as the boundary key so changing pages forces a fresh boundary,
  // letting users navigate away from a crashed page and recover.
  return (
    <div style={styles.app}>
      <div style={styles.shell}>
        <ErrorBoundary key={page}>
          {page === 'home' && <Home data={data} setPage={setPage} setModal={setModal} />}
          {page === 'activity' && <Activity data={data} setModal={setModal} />}
          {page === 'calendar' && <CalendarPage data={data} setModal={setModal} />}
          {page === 'budget' && <Budget data={data} setModal={setModal} setPage={setPage} />}
          {page === 'wealth' && <Wealth data={data} setModal={setModal} />}
        </ErrorBoundary>
        <Nav page={page} setPage={setPage} />
      </div>
      {modal && (
        <ErrorBoundary>
          <Modal modal={modal} setModal={setModal} data={data} update={update} setData={setData} />
        </ErrorBoundary>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
