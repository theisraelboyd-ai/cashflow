import React, { useState } from 'react';
import { useStoredData } from './hooks/useStoredData.js';
import { ThemeProvider, useTheme } from './lib/ThemeContext.jsx';
import { Home } from './components/Home.jsx';
import { Activity } from './components/Activity.jsx';
import { CalendarPage } from './components/CalendarPage.jsx';
import { Budget } from './components/Budget.jsx';
import { Wealth } from './components/Wealth.jsx';
import { Modal } from './components/Modal.jsx';
import { Nav } from './components/Nav.jsx';

function AppShell() {
  const { styles } = useTheme();
  const [data, setData, update] = useStoredData();
  const [page, setPage] = useState('home');
  const [modal, setModal] = useState(null);

  if (!data) {
    return (
      <div style={{ ...styles.app, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, opacity: 0.6, fontFamily: "'Cormorant Garamond', serif" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <div style={styles.shell}>
        {page === 'home' && <Home data={data} setPage={setPage} setModal={setModal} />}
        {page === 'activity' && <Activity data={data} setModal={setModal} />}
        {page === 'calendar' && <CalendarPage data={data} setModal={setModal} />}
        {page === 'budget' && <Budget data={data} setModal={setModal} />}
        {page === 'wealth' && <Wealth data={data} setModal={setModal} />}
        <Nav page={page} setPage={setPage} />
      </div>
      {modal && <Modal modal={modal} setModal={setModal} data={data} update={update} setData={setData} />}
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
