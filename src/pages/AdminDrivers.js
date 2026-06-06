import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, KpiRow, StatCard, ChartCard, FilterBar, C, fmt, Spinner, useIsMobile } from '../components/UI';

const STATUS_FILTERS = ['All','Completed','On Track','In Progress','At Risk'];
const STATUS_STYLE   = {
  'Completed'  : { bg:'#D5F5E3', color: C.green  },
  'On Track'   : { bg:'#D6EAF8', color:'#2980B9' },
  'In Progress': { bg:'#FEF9E7', color: C.amber  },
  'At Risk'    : { bg:'#FADBD8', color: C.red     },
};
const AVATAR_COLORS = [C.teal,'#8E44AD',C.navy,'#E74C3C','#27AE60','#2980B9','#E67E22','#1ABC9C',C.gold,'#C0392B','#16A085','#8E44AD','#2C3E50','#D35400'];

function initials(name) { return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }

export default function AdminDrivers() {
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('All');
  const [invFilter, setInvFilter] = useState('All');
  const [chart,     setChart]     = useState('Cost vs Paid');
  const [search,    setSearch]    = useState('');
  const [investors, setInvestors] = useState([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.from('v_driver_summary').select('*').then(({ data }) => {
      const d = data || [];
      setRows(d);
      setInvestors(['All', ...new Set(d.map(r => r.investor_name).filter(Boolean))]);
      setLoading(false);
    });
  }, []);

  function getStatus(row) {
    // Fallback only — Excel formula status takes priority on upload
    const pct = row.vehicle_cost > 0 ? row.total_paid / row.vehicle_cost : 0;
    if (pct >= 1)    return 'Completed';
    if (pct >= 0.5)  return 'On Track';
    if (pct >= 0.1)  return 'In Progress';
    return 'At Risk';
  }

  const enriched = rows.map(r => ({
    ...r,
    status: r.status || getStatus(r),
    pct: Number(r.pct_paid || 0),
  }));

  const filtered = enriched
    .filter(r => filter    === 'All' || r.status        === filter)
    .filter(r => invFilter === 'All' || r.investor_name === invFilter)
    .filter(r => !search   || r.full_name.toLowerCase().includes(search.toLowerCase()));

  const totalCost    = enriched.reduce((s,r) => s+(r.vehicle_cost||0), 0);
  const totalPaid    = enriched.reduce((s,r) => s+(r.total_paid  ||0), 0);
  const totalBalance = enriched.reduce((s,r) => s+(r.balance     ||0), 0);
  const avgProgress  = enriched.length ? enriched.reduce((s,r)=>s+(r.pct||0),0)/enriched.length : 0;

  const chartData = filtered.map(r => ({
    name: r.full_name.split(' ')[0],
    cost: r.vehicle_cost,
    paid: r.total_paid,
    pct : r.pct,
  }));

  return (
    <AppLayout>
      <PageHeader title="Driver Accounts" subtitle="Full view — admin only." />

      <KpiRow>
        <StatCard label="Total Drivers"    value={enriched.length}              colour={C.navy} />
        <StatCard label="Fleet Cost"       value={`GH₵ ${fmt(totalCost)}`}     colour={C.gold} />
        <StatCard label="Total Collected"  value={`GH₵ ${fmt(totalPaid)}`}     colour={C.teal} />
        <StatCard label="Outstanding"      value={`GH₵ ${fmt(totalBalance)}`}  colour={C.red}  />
        <StatCard label="Avg Progress"     value={`${avgProgress.toFixed(1)}%`} colour={C.green}/>
      </KpiRow>

      {/* Status filter */}
      <FilterBar filters={STATUS_FILTERS} active={filter} onChange={setFilter} label="Status" />

      {/* Investor filter — scrollable on mobile */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'nowrap', overflowX:'auto', marginBottom:14, paddingBottom:4 }}>
        <span style={{ fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:.5, flexShrink:0 }}>Investor</span>
        {investors.map(inv => (
          <button key={inv} onClick={() => setInvFilter(inv)} style={{
            padding:'5px 12px', borderRadius:20, border:'none', cursor:'pointer',
            fontSize:12, fontWeight:600, flexShrink:0, transition:'all .15s',
            background: invFilter===inv ? C.teal : C.lgray,
            color: invFilter===inv ? C.white : C.dgray,
            maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>{inv}</button>
        ))}
      </div>

      {/* Chart toggle + search */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {['Cost vs Paid','Progress %'].map(o => (
          <button key={o} onClick={() => setChart(o)} style={{
            padding:'5px 12px', borderRadius:20, border:'none', cursor:'pointer',
            fontSize:12, fontWeight:600, transition:'all .15s',
            background: chart===o ? C.navy : C.lgray,
            color: chart===o ? C.white : C.dgray,
          }}>{o}</button>
        ))}
        <input
          placeholder="Search driver…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft:'auto', padding:'7px 14px', borderRadius:20,
            border:'1.5px solid #DDD', fontSize:13, outline:'none',
            width: isMobile ? '100%' : 200,
          }}
        />
      </div>

      {loading ? <Spinner /> : <>
        {/* Cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(270px,1fr))',
          gap: 14, marginBottom: 24,
        }}>
          {filtered.map((row, i) => {
            const ss = STATUS_STYLE[row.status] || {};
            const weeksLeft = row.weekly_amount > 0 ? Math.ceil((row.balance||0)/row.weekly_amount) : '—';
            return (
              <div key={row.id} style={{
                background:C.white, borderRadius:14,
                boxShadow:'0 2px 10px rgba(0,0,0,0.07)',
                padding:'18px', border:`1px solid ${C.lgray}`,
              }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{
                    width:42, height:42, borderRadius:10, flexShrink:0,
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:C.white, fontWeight:800, fontSize:13,
                  }}>
                    {initials(row.full_name)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.full_name}
                    </div>
                    <div style={{ fontSize:11, color:'#888', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.vehicle || '—'} · {row.registration || '—'}
                    </div>
                  </div>
                  <span style={{ background:ss.bg, color:ss.color, borderRadius:10, padding:'3px 9px', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {row.status}
                  </span>
                </div>

                {/* Investor tag */}
                <div style={{ marginBottom:10 }}>
                  <span style={{ background:'#E8EDF5', color:C.navy, borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:600 }}>
                    👤 {row.investor_name || 'No investor'}
                  </span>
                </div>

                {/* Stats */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                  {[
                    { label:'Cost',   value:`GH₵${fmt(row.vehicle_cost)}`,  colour:C.navy },
                    { label:'Paid',   value:`GH₵${fmt(row.total_paid)}`,    colour:C.teal },
                    { label:'Weekly', value:`GH₵${fmt(row.weekly_amount)}`, colour:C.gold },
                  ].map(s => (
                    <div key={s.label} style={{ background:C.lgray, borderRadius:8, padding:'7px 9px' }}>
                      <div style={{ fontSize:9, color:'#888', textTransform:'uppercase', letterSpacing:.5, fontWeight:600 }}>{s.label}</div>
                      <div style={{ fontSize:11, fontWeight:800, color:s.colour, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Progress */}
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#888', marginBottom:4 }}>
                  <span>Progress</span>
                  <span style={{ fontWeight:700, color:C.teal }}>{row.pct.toFixed(1)}%</span>
                </div>
                <div style={{ background:'#EEE', borderRadius:6, height:8, overflow:'hidden' }}>
                  <div style={{ width:`${Math.min(row.pct,100)}%`, height:'100%', background:`linear-gradient(90deg,${C.teal},${C.navy})`, borderRadius:6 }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#aaa', marginTop:4 }}>
                  <span>Bal: <strong style={{ color:C.dgray }}>GH₵{fmt(row.balance)}</strong></span>
                  <span>{weeksLeft !== '—' ? `~${weeksLeft} wks left` : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <ChartCard title={`Driver Comparison — ${chart}`} height={isMobile ? 260 : 240}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ bottom: isMobile ? 30 : 20, left:0, right:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 11 }} angle={isMobile ? -30 : 0} textAnchor={isMobile ? 'end' : 'middle'} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => chart==='Progress %' ? `${v}%` : `GH₵${(v/1000).toFixed(0)}k`} width={46} />
              <Tooltip formatter={v => chart==='Progress %' ? `${Number(v).toFixed(1)}%` : `GH₵ ${fmt(v)}`} />
              {chart === 'Cost vs Paid'
                ? <><Bar dataKey="cost" name="Vehicle Cost" fill={C.navy} radius={[4,4,0,0]} /><Bar dataKey="paid" name="Total Paid" fill={C.teal} radius={[4,4,0,0]} /></>
                : <Bar dataKey="pct" name="Progress %" fill={C.teal} radius={[4,4,0,0]} />
              }
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </>}
    </AppLayout>
  );
}
