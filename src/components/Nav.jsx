import React from 'react';
import { Wallet, Briefcase, Calendar as CalIcon, TrendingUp, Coins } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';

export function Nav({ page, setPage }) {
  const { styles, t } = useTheme();
  const items = [
    { id: 'home', label: 'Home', icon: <Wallet size={18} /> },
    { id: 'activity', label: 'Activity', icon: <Briefcase size={18} /> },
    { id: 'calendar', label: 'Calendar', icon: <CalIcon size={20} />, center: true },
    { id: 'budget', label: 'Budget', icon: <TrendingUp size={18} /> },
    { id: 'wealth', label: 'Wealth', icon: <Coins size={18} /> },
  ];
  return (
    <div style={styles.nav}>
      {items.map((it) => {
        const active = page === it.id;
        const isCenter = !!it.center;
        return (
          <div
            key={it.id}
            onClick={() => setPage(it.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: isCenter ? '8px 0 10px' : '10px 0',
              color: active ? t.accent : t.textFaint,
              cursor: 'pointer',
              transition: 'color 0.15s',
              position: 'relative',
            }}
          >
            {isCenter ? (
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  background: active ? t.accentSoft : 'transparent',
                  border: `1px solid ${active ? t.accent : t.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 2,
                }}
              >
                {it.icon}
              </div>
            ) : (
              it.icon
            )}
            <div style={{ fontSize: 10, letterSpacing: 0.5 }}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}
