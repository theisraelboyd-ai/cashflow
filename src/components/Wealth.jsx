import React from 'react';
import { Plus } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext.jsx';
import { fmt } from '../lib/format.js';
import { PageHeader, Empty, Money } from './atoms.jsx';

export function Wealth({ data, setModal }) {
  const { styles, t, privacy } = useTheme();
  const totalAccounts = data.accounts.reduce((s, a) => s + Number(a.balance), 0);
  const totalAssets = data.assets.reduce((s, a) => s + Number(a.value), 0);
  const totalNetWorth = totalAccounts + totalAssets;

  const groups = {};
  data.assets.forEach((a) => {
    const cat = a.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(a);
  });

  const categoryOrder = ['property', 'pension', 'shares', 'crypto', 'gold', 'vehicle', 'other'];
  const sortedCats = Object.keys(groups).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div style={styles.page}>
      <PageHeader title="Wealth" eyebrow="Net position" />

      <div style={styles.heroCard}>
        <div style={styles.heroLabel}>Estimated net worth</div>
        <div className={privacy ? 'private-blur' : ''} style={styles.heroAmount}>{fmt(totalNetWorth)}</div>
        <div style={styles.heroFoot}>
          <span style={{ opacity: 0.7 }} className={privacy ? 'private-blur' : ''}>{fmt(totalAccounts)} liquid</span>
          <span style={{ opacity: 0.7 }} className={privacy ? 'private-blur' : ''}>{fmt(totalAssets)} assets</span>
        </div>
      </div>

      <div style={styles.sectionHead}>
        <h2 style={styles.h2}>Assets</h2>
        <button style={styles.iconBtn} onClick={() => setModal({ type: 'asset', payload: null })}>
          <Plus size={16} />
        </button>
      </div>

      {data.assets.length === 0 && (
        <Empty msg="Add things you could sell or that hold long-term value — house, ISA, pension, gold, car." />
      )}

      {sortedCats.map((cat) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: t.textDim, marginBottom: 8, marginTop: 14 }}>
            {cat}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups[cat].map((a) => (
              <div key={a.id} style={styles.billCard} onClick={() => setModal({ type: 'asset', payload: a })}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14, color: t.text }}>{a.name}</div>
                </div>
                <Money value={a.value} color={t.text} size={17} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
