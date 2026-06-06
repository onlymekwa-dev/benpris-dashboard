import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, KpiRow, StatCard, ChartCard, FilterBar, C, fmt, Spinner, useIsMobile } from '../components/UI';

const STATUS_FILTERS = ['All','Completed','On Track','In Progress'];
const STATUS_STYLE   = {
  'Completed'  : { bg:'#D5F5E3', color: C.green  },
  'On Track'   : { bg:'#D6EAF8', color:'#2980B9' },
  'In Progress': { bg:'#FEF9E7', color: C.amber  },
};
const AVATAR_COLORS = [C.navy, C.teal, C.gold,'#8E44AD','#E74C3C','#27AE60','#2980B9','#E67E22','#1ABC9C','#C0392B'];

function initials(name) { return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); }

export default function AdminInvestors() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');
  const [chart,   setChart]   = useState('Future Value');
  const [search,  setSearch]  = useState('');
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.from('v_investor_summary').select('*')
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  function getStatus(row) {
    const pct = Number(row.pct_paid || 0) / 100;
    if (pct >= 1)   return 'Completed';
    if (pct >= 0.5) return 'On Track';
    return 'In Progress';
  }

  const enriched = rows.map(r => ({
    ...r,
    status: getStatus(r),
    pct: Number(r.pct_paid || 0),
  }));

  const filtered = enriched
    .filter(r => filter === 'All' || r.status === filter)
    .filter(r => !search || r.full_name.toLowerCase().includes(search.toLowerCase()));

  const totalCapital = enriched.reduce((s,r) => s+(r.capital_invested||0), 0);
  const totalFutureValue   = enriched.reduce((s,r) => s+(r.future_value ||0), 0);
  const totalPaidOut = enriched.reduce((s,r) => s+(r.total_paid_out  ||0), 0);
  const totalBalance = enriched.reduce((s,r) => s+(r.balance         ||0), 0);

  const chartData = filtered.map(r => ({
    name : r.full_name.split(' ')[0],
    value: chart === 'Future Value' ? r.future_value : r.pct,
    paid : chart === 'Future Value' ? r.total_paid_out  : null,
  }));

  return (
    <AppLayout>
      <PageHeader title="Investor Accounts" subtitle="Full view — admin only." />

      <KpiRow>
        <StatCard label="Total Capital"   value={`GH₵ ${fmt(totalCapital)}`}  colour={C.gold}  />
        <StatCard label="Future Value" value={`GH₵ ${fmt(totalFutureValue)}`}    colour={C.green} />
        <StatCard label="Paid Out"        value={`GH₵ ${fmt(totalPaidOut)}`}  colour={C.teal}  />
        <StatCard label="Outstanding"     value={`GH₵ ${fmt(totalBalance)}`}  colour={C.red}   />
        <StatCard label="Return Rate"     value="20%"                          colour={C.navy}  />
      </KpiRow>

      {/* Filters */}
      <FilterBar filters={STATUS_FILTERS} active={filter} onChange={setFilter} label="Filter" />

      {/* Chart toggle + search */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {['Future Value','Return %'].map(o => (
          <button key={o} onClick={() => setChart(o)} style={{
            padding:'5px 12px', borderRadius:20, border:'none', cursor:'pointer',
            fontSize:12, fontWeight:600, transition:'all .15s',
            background: chart===o ? C.navy : C.lgray,
            color: chart===o ? C.white : C.dgray,
          }}>{o}</button>
        ))}
        <input
          placeholder="Search investor…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft:'auto', padding:'7px 14px', borderRadius:20,
            border:'1.5px solid #DDD', fontSize:13, outline:'none',
            width: isMobile ? '100%' : 200,
          }}
        />
      </div>

      {loading ? <Spinner /> : <>
        {/* Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(280px,1fr))',
          gap: 14, marginBottom: 24,
        }}>
          {filtered.map((row, i) => {
            const ss = STATUS_STYLE[row.status] || {};
            return (
              <div key={row.id} style={{
                background:C.white, borderRadius:14,
                boxShadow:'0 2px 10px rgba(0,0,0,0.07)',
                padding:'18px', border:`1px solid ${C.lgray}`,
              }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
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
                    <div style={{ fontSize:11, color:'#888', marginTop:2 }}>
                      {row.num_vehicles || 0} vehicle{row.num_vehicles !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span style={{ background:ss.bg, color:ss.color, borderRadius:10, padding:'3px 9px', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {row.status}
                  </span>
                </div>

                {/* Stats */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                  {[
                    { label:'Invested', value:`GH₵${fmt(row.capital_invested)}`, colour:C.navy  },
                    { label:'Value',    value:`GH₵${fmt(row.future_value)}`,  colour:C.green },
                    { label:'Paid Out', value:`GH₵${fmt(row.total_paid_out)}`,   colour:C.teal  },
                  ].map(s => (
                    <div key={s.label} style={{ background:C.lgray, borderRadius:8, padding:'7px 9px' }}>
                      <div style={{ fontSize:9, color:'#888', textTransform:'uppercase', letterSpacing:.5, fontWeight:600 }}>{s.label}</div>
                      <div style={{ fontSize:11, fontWeight:800, color:s.colour, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Progress */}
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#888', marginBottom:4 }}>
                  <span>Payout progress</span>
                  <span style={{ fontWeight:700, color:C.teal }}>{row.pct.toFixed(1)}%</span>
                </div>
                <div style={{ background:'#EEE', borderRadius:6, height:8, overflow:'hidden' }}>
                  <div style={{ width:`${Math.min(row.pct,100)}%`, height:'100%', background:`linear-gradient(90deg,${C.teal},${C.navy})`, borderRadius:6 }} />
                </div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>
                  Balance: <strong style={{ color:C.dgray }}>GH₵ {fmt(row.balance)}</strong>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <ChartCard title={`Portfolio Comparison — ${chart}`} height={isMobile ? 240 : 230}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ bottom: isMobile ? 30 : 10, left:0, right:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 11 }} angle={isMobile ? -30 : 0} textAnchor={isMobile ? 'end' : 'middle'} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => chart==='Return %' ? `${v}%` : `GH₵${(v/1000).toFixed(0)}k`} width={46} />
              <Tooltip formatter={v => chart==='Return %' ? `${Number(v).toFixed(1)}%` : `GH₵ ${fmt(v)}`} />
              <Bar dataKey="value" name={chart==='Return %' ? 'Return %' : 'Future Value'} fill={C.gold} radius={[4,4,0,0]} />
              {chart==='Future Value' && <Bar dataKey="paid" name="Paid Out" fill={C.teal} radius={[4,4,0,0]} />}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </>}
    </AppLayout>
  );
}
