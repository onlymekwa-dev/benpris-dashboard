import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// ── Colour tokens ────────────────────────────────────────────────────────────
export const C = {
  navy : '#1F2D4E',
  teal : '#00838F',
  gold : '#F5A623',
  white: '#FFFFFF',
  lgray: '#F2F4F7',
  dgray: '#4A4A4A',
  green: '#27AE60',
  red  : '#E74C3C',
  amber: '#F39C12',
  lteal: '#E0F4F6',
};

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 32 }) {
  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:24 }}>
      <div style={{
        width: size, height: size,
        border: `4px solid ${C.lteal}`,
        borderTop: `4px solid ${C.teal}`,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    'Completed'  : { bg: '#D5F5E3', color: C.green },
    'On Track'   : { bg: '#D6EAF8', color: '#2980B9' },
    'In Progress': { bg: '#FEF9E7', color: C.amber },
    'At Risk'    : { bg: '#FADBD8', color: C.red },
  };
  const s = map[status] || { bg: C.lgray, color: C.dgray };
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: 12, padding: '3px 10px',
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {status || '—'}
    </span>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, colour = C.teal, sub }) {
  return (
    <div style={{
      background: C.white, borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      padding: '20px 24px', flex: 1, minWidth: 160,
      borderTop: `4px solid ${colour}`,
    }}>
      <div style={{ fontSize: 12, color: C.dgray, fontWeight: 600, textTransform:'uppercase', letterSpacing:1 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: colour, marginTop: 6 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = {
  admin   : [
    { to: '/admin',          label: 'Overview'       },
    { to: '/admin/drivers',  label: 'Drivers'        },
    { to: '/admin/investors',label: 'Investors'      },
    { to: '/admin/payments', label: 'Payments'       },
    { to: '/admin/upload',   label: 'Upload Excel'   },
    { to: '/admin/history',  label: 'Upload History' },
    { to: '/admin/users',    label: 'Manage Users'   },
  ],
  investor: [
    { to: '/investor',         label: 'My Overview'  },
    { to: '/investor/vehicles',label: 'My Vehicles'  },
    { to: '/investor/payouts', label: 'My Payouts'   },
  ],
  driver  : [
    { to: '/driver',          label: 'My Overview'  },
    { to: '/driver/payments', label: 'My Payments'  },
  ],
};

export function Sidebar() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const links = NAV[profile?.role] || [];

  const roleColour = { admin: C.navy, investor: C.gold, driver: C.teal }[profile?.role] || C.navy;

  return (
    <aside style={{
      width: 220, minHeight: '100vh',
      background: C.navy, color: C.white,
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '24px 20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>BenPris</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Auto Services</div>
      </div>

      {/* Role pill */}
      <div style={{ padding: '12px 20px' }}>
        <span style={{
          background: roleColour, color: C.white,
          borderRadius: 10, padding: '2px 10px',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        }}>
          {profile?.role || 'user'}
        </span>
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{profile?.full_name}</div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to.split('/').length <= 2}
            style={({ isActive }) => ({
              display: 'block',
              padding: '10px 20px',
              color: isActive ? C.teal : 'rgba(255,255,255,0.75)',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 700 : 400,
              background: isActive ? 'rgba(0,131,143,0.15)' : 'transparent',
              borderLeft: isActive ? `3px solid ${C.teal}` : '3px solid transparent',
              transition: 'all 0.15s',
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <button
        onClick={async () => { await signOut(); navigate('/login'); }}
        style={{
          margin: 16, padding: '10px 0',
          background: 'rgba(231,76,60,0.15)',
          border: '1px solid rgba(231,76,60,0.4)',
          borderRadius: 8, color: '#E74C3C',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Sign Out
      </button>
    </aside>
  );
}

// ── Layout wrapper ────────────────────────────────────────────────────────────
export function AppLayout({ children }) {
  return (
    <div style={{ display:'flex', minHeight:'100vh', background: C.lgray, fontFamily:'Arial, sans-serif' }}>
      <Sidebar />
      <main style={{ flex:1, padding: 28, overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

// ── Page heading ─────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ margin:0, fontSize:24, fontWeight:800, color: C.navy }}>{title}</h1>
      {subtitle && <p style={{ margin:'4px 0 0', color: C.dgray, fontSize:14 }}>{subtitle}</p>}
    </div>
  );
}

// ── Simple table ─────────────────────────────────────────────────────────────
export function Table({ columns, rows, emptyMsg = 'No data' }) {
  return (
    <div style={{ overflowX:'auto', borderRadius:10, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', background:C.white }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ background: C.navy }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding:'11px 14px', textAlign:'left',
                color: C.white, fontWeight:700, fontSize:12,
                textTransform:'uppercase', letterSpacing:0.5,
                whiteSpace:'nowrap',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length} style={{ padding:24, textAlign:'center', color:'#999' }}>{emptyMsg}</td></tr>
            : rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.lgray }}>
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding:'10px 14px', color: C.dgray,
                    borderBottom:`1px solid ${C.lgray}`,
                  }}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

export function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
