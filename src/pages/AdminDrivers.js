import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, C, fmt, Spinner } from '../components/UI';

const STATUS_FILTERS = ['All', 'Completed', 'On Track', 'In Progress', 'At Risk'];
const CHART_OPTS     = ['Cost vs Paid', 'Progress %'];

const STATUS_STYLE = {
  'Completed'  : { bg:'#D5F5E3', color: C.green  },
  'On Track'   : { bg:'#D6EAF8', color:'#2980B9' },
  'In Progress': { bg:'#FEF9E7', color: C.amber  },
  'At Risk'    : { bg:'#FADBD8', color: C.red     },
};

const AVATAR_COLORS = [C.teal,'#8E44AD',C.navy,'#E74C3C','#27AE60','#2980B9','#E67E22','#1ABC9C',C.gold,'#C0392B','#16A085','#8E44AD','#2C3E50','#D35400'];

function initials(name) {
  return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
}

export default function AdminDrivers() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');
  const [chart,   setChart]   = useState('Cost vs Paid');
  const [search,  setSearch]  = useState('');
  const [invFilter, setInvFilter] = useState('All');
  const [investors, setInvestors] = useState([]);

  useEffect(() => {
    supabase.from('v_driver_summary').select('*').then(({ data }) => {
      const d = data || [];
      setRows(d);
      const invs = ['All', ...new Set(d.map(r => r.investor_name).filter(Boolean))];
      setInvestors(invs);
      setLoading(false);
    });
  }, []);

  function getStatus(row) {
    const pct = row.vehicle_cost > 0 ? row.total_paid / row.vehicle_cost : 0;
    if (pct >= 1)   return 'Completed';
    if (pct >= 0.5) return 'On Track';
    if (pct >= 0.1) return 'In Progress';
    return 'At Risk';
  }

  const enriched = rows.map(r => ({
    ...r,
    status: r.status || getStatus(r),
    pct: r.vehicle_cost > 0 ? (r.total_paid / r.vehicle_cost * 100) : 0,
  }));

  const filtered = enriched
    .filter(r => filter === 'All' || r.status === filter)
    .filter(r => invFilter === 'All' || r.investor_name === invFilter)
    .filter(r => !search || r.full_name.toLowerCase().includes(search.toLowerCase()));

  const totalCost    = enriched.reduce((s,r) => s + (r.vehicle_cost || 0), 0);
  const totalPaid    = enriched.reduce((s,r) => s + (r.total_paid   || 0), 0);
  const totalBalance = enriched.reduce((s,r) => s + (r.balance      || 0), 0);
  const avgProgress  = enriched.length ? enriched.reduce((s,r)=>s+(r.pct||0),0)/enriched.length : 0;

  const chartData = filtered.map(r => ({
    name   : r.full_name.split(' ')[0],
    cost   : r.vehicle_cost,
    paid   : r.total_paid,
    pct    : r.pct,
  }));

  return (
    <AppLayout>
      <PageHeader title="Driver Accounts" subtitle="Full view — admin only. Each driver sees only their own progress." />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {[
          { label:'TOTAL VEHICLES',      value:enriched.length,             sub:`${enriched.filter(r=>r.status==='Completed').length} fully paid`, colour:C.navy },
          { label:'TOTAL VEHICLE COST',  value:`GH₵ ${fmt(totalCost)}`,    sub:'Combined fleet value',               colour:C.gold  },
          { label:'TOTAL COLLECTED',     value:`GH₵ ${fmt(totalPaid)}`,    sub:`GH₵ ${fmt(totalBalance)} remaining`, colour:C.teal  },
          { label:'AVG PROGRESS',        value:`${avgProgress.toFixed(1)}%`,sub:'Across all drivers',                colour:C.green },
        ].map(k => (
          <div key={k.label} style={{ background:C.white, borderRadius:12, padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', borderTop:`4px solid ${k.colour}` }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#999', textTransform:'uppercase', letterSpacing:.8 }}>{k.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.colour, margin:'6px 0 4px' }}>{k.value}</div>
            <div style={{ fontSize:12, color:'#888' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:.5 }}>Status</span>
        {STATUS_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
            background: filter===f ? C.navy : C.lgray,
            color: filter===f ? C.white : C.dgray,
            transition:'all .15s',
          }}>{f}</button>
        ))}
        <span style={{ fontSize:12, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:.5, marginLeft:8 }}>Chart</span>
        {CHART_OPTS.map(o => (
          <button key={o} onClick={() => setChart(o)} style={{
            padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
            background: chart===o ? C.navy : C.lgray,
            color: chart===o ? C.white : C.dgray,
            transition:'all .15s',
          }}>{o}</button>
        ))}
      </div>

      {/* Investor filter row */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:.5 }}>Investor</span>
        {investors.map(inv => (
          <button key={inv} onClick={() => setInvFilter(inv)} style={{
            padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
            background: invFilter===inv ? C.teal : C.lgray,
            color: invFilter===inv ? C.white : C.dgray,
            transition:'all .15s',
            maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>{inv}</button>
        ))}
        <input
          placeholder="Search driver…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft:'auto', padding:'7px 14px', borderRadius:20, border:`1.5px solid #DDD`, fontSize:13, outline:'none', width:200 }}
        />
      </div>

      {loading ? <Spinner /> : <>
        {/* Driver cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:16, marginBottom:28 }}>
          {filtered.map((row, i) => {
            const ss = STATUS_STYLE[row.status] || {};
            const weeksLeft = row.weekly_amount > 0 ? Math.ceil((row.balance || 0) / row.weekly_amount) : '—';
            return (
              <div key={row.id} style={{
                background:C.white, borderRadius:14,
                boxShadow:'0 2px 12px rgba(0,0,0,0.08)',
                padding:'20px', border:`1px solid ${C.lgray}`,
                transition:'box-shadow .2s',
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow='0 6px 24px rgba(0,0,0,0.13)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'}
              >
                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                  <div style={{
                    width:44, height:44, borderRadius:12,
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:C.white, fontWeight:800, fontSize:14, flexShrink:0,
                  }}>
                    {initials(row.full_name)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:C.navy, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{row.full_name}</div>
                    <div style={{ fontSize:11, color:'#888', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {row.vehicle || 'No vehicle'} · {row.registration || '—'}
                    </div>
                  </div>
                  <span style={{ background:ss.bg, color:ss.color, borderRadius:10, padding:'3px 10px', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {row.status}
                  </span>
                </div>

                {/* Investor tag */}
                <div style={{ marginBottom:12 }}>
                  <span style={{ background:C.lnav||'#E8EDF5', color:C.navy, borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:600 }}>
                    👤 {row.investor_name || 'No investor'}
                  </span>
                </div>

                {/* Stats */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                  <Stat label="Cost"    value={`GH₵${fmt(row.vehicle_cost)}`} colour={C.navy}  />
                  <Stat label="Paid"    value={`GH₵${fmt(row.total_paid)}`}   colour={C.teal}  />
                  <Stat label="Weekly"  value={`GH₵${fmt(row.weekly_amount)}`}colour={C.gold}  />
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#888', marginBottom:4 }}>
                    <span>Payment progress</span>
                    <span style={{ fontWeight:700, color:C.teal }}>{row.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ background:'#EEE', borderRadius:6, height:8, overflow:'hidden' }}>
                    <div style={{ width:`${Math.min(row.pct,100)}%`, height:'100%', background:`linear-gradient(90deg,${C.teal},${C.navy})`, borderRadius:6 }} />
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#aaa', marginTop:4 }}>
                    <span>Balance: <strong style={{ color:C.dgray }}>GH₵ {fmt(row.balance)}</strong></span>
                    <span>{weeksLeft !== '—' ? `~${weeksLeft} wks left` : '—'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div style={{ background:C.white, borderRadius:14, padding:'20px 16px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin:'0 0 16px', fontSize:14, fontWeight:700, color:C.navy }}>Driver Comparison — {chart}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ bottom:30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize:11 }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => chart==='Progress %' ? `${v}%` : `GH₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => chart==='Progress %' ? `${Number(v).toFixed(1)}%` : `GH₵ ${fmt(v)}`} />
              {chart === 'Cost vs Paid'
                ? <><Bar dataKey="cost" name="Vehicle Cost" fill={C.navy} radius={[4,4,0,0]} /><Bar dataKey="paid" name="Total Paid" fill={C.teal} radius={[4,4,0,0]} /></>
                : <Bar dataKey="pct" name="Progress %" fill={C.teal} radius={[4,4,0,0]} />
              }
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}
    </AppLayout>
  );
}

function Stat({ label, value, colour }) {
  return (
    <div style={{ background:C.lgray, borderRadius:8, padding:'8px 10px' }}>
      <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:.5, fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:12, fontWeight:800, color:colour, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{value}</div>
    </div>
  );
}
