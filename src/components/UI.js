import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// ── Colour tokens ─────────────────────────────────────────────────────────
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

// ── Responsive hook ───────────────────────────────────────────────────────
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

// ── Spinner ───────────────────────────────────────────────────────────────
export function Spinner({ size = 32 }) {
  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:40 }}>
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

// ── StatusBadge ───────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const map = {
    'Completed'  : { bg:'#D5F5E3', color: C.green  },
    'On Track'   : { bg:'#D6EAF8', color:'#2980B9' },
    'In Progress': { bg:'#FEF9E7', color: C.amber  },
    'At Risk'    : { bg:'#FADBD8', color: C.red     },
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

// ── StatCard ──────────────────────────────────────────────────────────────
export function StatCard({ label, value, colour = C.teal, sub }) {
  return (
    <div style={{
      background: C.white, borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      padding: '16px 18px', flex: 1, minWidth: 140,
      borderTop: `4px solid ${colour}`,
    }}>
      <div style={{ fontSize: 11, color: C.dgray, fontWeight: 600, textTransform:'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colour, marginTop: 6, wordBreak:'break-word' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────
const NAV = {
  admin   : [
    { to: '/admin',                  label: 'Overview'         },
    { to: '/admin/drivers',          label: 'Drivers'          },
    { to: '/admin/investors',        label: 'Investors'        },
    { to: '/admin/payments',         label: 'Driver Payments'  },
    { to: '/admin/investor-payouts', label: 'Investor Payouts' },
    { to: '/admin/upload',           label: 'Upload Excel'     },
    { to: '/admin/history',          label: 'Upload History'   },
    { to: '/admin/users',            label: 'Manage Users'     },
  ],
  investor: [
    { to: '/investor',          label: 'My Overview'  },
    { to: '/investor/vehicles', label: 'My Vehicles'  },
    { to: '/investor/payouts',  label: 'My Payouts'   },
  ],
  driver  : [
    { to: '/driver',          label: 'My Overview'   },
    { to: '/driver/payments', label: 'My Payments'   },
  ],
};

export function Sidebar({ mobileOpen, onClose }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const links = NAV[profile?.role] || [];
  const roleColour = { admin: C.navy, investor: C.gold, driver: C.teal }[profile?.role] || C.navy;

  const sidebarStyle = isMobile ? {
    position: 'fixed', top: 0, left: mobileOpen ? 0 : '-260px',
    width: 240, height: '100vh', zIndex: 1000,
    background: C.navy, color: C.white,
    display: 'flex', flexDirection: 'column',
    flexShrink: 0, transition: 'left 0.28s ease',
    boxShadow: mobileOpen ? '4px 0 24px rgba(0,0,0,0.35)' : 'none',
  } : {
    width: 220, minHeight: '100vh',
    background: C.navy, color: C.white,
    display: 'flex', flexDirection: 'column',
    flexShrink: 0,
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div onClick={onClose} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:999,
        }} />
      )}

      <aside style={sidebarStyle}>
        {/* Logo */}
        <div style={{
          padding: '20px 16px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>BenPris</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Auto Services</div>
          </div>
          {isMobile && (
            <button onClick={onClose} style={{
              background:'transparent', border:'none', color:'rgba(255,255,255,0.7)',
              fontSize:22, cursor:'pointer', padding:'4px 8px',
            }}>✕</button>
          )}
        </div>

        {/* Role pill */}
        <div style={{ padding: '10px 16px' }}>
          <span style={{
            background: roleColour, color: C.white,
            borderRadius: 10, padding: '2px 10px',
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          }}>
            {profile?.role || 'user'}
          </span>
          <div style={{ marginTop: 5, fontSize: 13, fontWeight: 600, color: C.white }}>
            {profile?.full_name}
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto' }}>
          {links.map(({ to, label }) => (
            <NavLink
              key={to} to={to}
              end={to.split('/').length <= 2}
              onClick={isMobile ? onClose : undefined}
              style={({ isActive }) => ({
                display: 'block', padding: '11px 16px',
                color: isActive ? C.teal : 'rgba(255,255,255,0.75)',
                textDecoration: 'none', fontSize: 14,
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
            margin: 14, padding: '10px 0',
            background: 'rgba(231,76,60,0.15)',
            border: '1px solid rgba(231,76,60,0.4)',
            borderRadius: 8, color: '#E74C3C',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </aside>
    </>
  );
}

// ── AppLayout ─────────────────────────────────────────────────────────────
export function AppLayout({ children }) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ display:'flex', minHeight:'100vh', background: C.lgray, fontFamily:'Arial, sans-serif' }}>
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            display:'flex', alignItems:'center', gap:12,
            background: C.navy, padding:'12px 16px',
            position:'sticky', top:0, zIndex:100,
          }}>
            <button onClick={() => setMenuOpen(true)} style={{
              background:'transparent', border:'none', color:C.white,
              fontSize:22, cursor:'pointer', padding:'2px 6px', lineHeight:1,
            }}>☰</button>
            <span style={{ color:C.white, fontWeight:800, fontSize:16 }}>BenPris Auto</span>
          </div>
        )}

        <main style={{ flex:1, padding: isMobile ? '16px 12px' : 28, overflowY:'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ marginBottom: isMobile ? 16 : 24 }}>
      <h1 style={{ margin:0, fontSize: isMobile ? 20 : 24, fontWeight:800, color: C.navy }}>{title}</h1>
      {subtitle && <p style={{ margin:'4px 0 0', color: C.dgray, fontSize: 13 }}>{subtitle}</p>}
    </div>
  );
}

// ── Responsive KPI row ────────────────────────────────────────────────────
export function KpiRow({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12, marginBottom: 20,
    }}>
      {children}
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────
export function FilterBar({ filters, active, onChange, label = 'Filter' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:14 }}>
      {label && <span style={{ fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:.5 }}>{label}</span>}
      {filters.map(f => (
        <button key={f} onClick={() => onChange(f)} style={{
          padding:'5px 13px', borderRadius:20, border:'none', cursor:'pointer',
          fontSize:12, fontWeight:600, transition:'all .15s',
          background: active===f ? C.navy : C.lgray,
          color: active===f ? C.white : C.dgray,
        }}>{f}</button>
      ))}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────
export function Table({ columns, rows, emptyMsg = 'No data' }) {
  const isMobile = useIsMobile();

  // On mobile render as cards instead of table
  if (isMobile) {
    if (rows.length === 0) return (
      <div style={{ padding:24, textAlign:'center', color:'#999', background:C.white, borderRadius:10 }}>{emptyMsg}</div>
    );
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {rows.map((row, i) => (
          <div key={i} style={{
            background:C.white, borderRadius:10,
            boxShadow:'0 1px 6px rgba(0,0,0,0.07)',
            padding:'14px 16px',
          }}>
            {columns.map(col => (
              <div key={col.key} style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13 }}>
                <span style={{ color:'#888', fontWeight:600, fontSize:11, textTransform:'uppercase', letterSpacing:.4, flexShrink:0, marginRight:12 }}>{col.label}</span>
                <span style={{ color:C.dgray, textAlign:'right', wordBreak:'break-word' }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ overflowX:'auto', borderRadius:10, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', background:C.white }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ background: C.navy }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding:'11px 14px', textAlign:'left',
                color: C.white, fontWeight:700, fontSize:12,
                textTransform:'uppercase', letterSpacing:0.5, whiteSpace:'nowrap',
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

// ── ChartCard ─────────────────────────────────────────────────────────────
export function ChartCard({ title, children, height = 260 }) {
  return (
    <div style={{
      background: C.white, borderRadius:12,
      boxShadow:'0 2px 10px rgba(0,0,0,0.07)',
      padding:'18px 14px',
    }}>
      <h3 style={{ margin:'0 0 14px', fontSize:14, fontWeight:700, color: C.navy }}>{title}</h3>
      <div style={{ height }}>{children}</div>
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
