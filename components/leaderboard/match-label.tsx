import type { CSSProperties } from 'react';

const BASE: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 999,
  borderStyle: 'solid',
  borderWidth: 1,
  whiteSpace: 'nowrap',
};

export function MatchLabel({ promoPending, shieldActive }: { promoPending: boolean; shieldActive: boolean }) {
  if (promoPending) {
    return (
      <span style={{ ...BASE, color: '#7ff0b0', background: 'rgba(35,180,110,.15)', borderColor: 'rgba(60,210,140,.5)' }}>
        ⬆ Promotion Match
      </span>
    );
  }
  if (shieldActive) {
    return (
      <span style={{ ...BASE, color: '#ff9b9b', background: 'rgba(220,70,70,.15)', borderColor: 'rgba(240,90,90,.5)' }}>
        ⬇ Demotion Match
      </span>
    );
  }
  return null;
}
