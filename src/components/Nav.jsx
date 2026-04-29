import React from 'react';
import { Wallet, Briefcase, Calendar as CalIcon, TrendingUp, Coins } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';

export function Nav({ page, setPage }) {
  const { styles, t, isDesktop } = useTheme();
  const items = [
    { id: 'home', label: 'Home', icon: <Wallet size={isDesktop ? 18 : 18} /> },
    { id: 'activity', label: 'Activity', icon: <Briefcase size={isDesktop ? 18 : 18} /> },
    { id: 'calendar', label: 'Calendar', icon: <CalIcon size={isDesktop ? 18 : 20} />, center: !isDesktop },
    { id: 'budget', label: 'Budget', icon: <TrendingUp size={isDesktop ? 18 : 18} /> },
    { id: 'wealth', label: 'Wealth', icon: <Coins size={isDesktop ? 18 : 18} /> },
  ];

  if (isDesktop) {
    return (
      <div style={styles.nav}>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 28,
            fontWeight: 500,
            color: t.text,
            padding: '4px 8px 24px',
            letterSpacing: -0.5,
          }}
        >
          Cash flow
        </div>
        {items.map((it) => {
          const active = page === it.id;
          return (
            <div
              key={it.id}
              onClick={() => setPage(it.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 8,
                color: active ? t.accent : t.textDim,
                background: active ? t.accentSoft : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontSize: 14,
                fontWeight: active ? 600 : 500,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = t.bgInset;
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              {it.icon}
              <span>{it.label}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Mobile: bottom nav
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
