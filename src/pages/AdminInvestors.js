import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, C, fmt, Spinner } from '../components/UI';

const STATUS_FILTERS = ['All', 'Completed', 'On Track', 'In Progress', 'At Risk'];
const CHART_OPTS     = ['Portfolio Value', 'Return %'];

const STATUS_STYLE = {
  'Completed'  : { bg:'#D5F5E3', color: C.green  },
  'On Track'   : { bg:'#D6EAF8', color:'#2980B9' },
  'In Progress': { bg:'#FEF9E7', color: C.amber  },
  'At Risk'    : { bg:'#FADBD8', color: C.red     },
};

function initials(name) {
  return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
}

const AVATAR_COLORS = [C.navy, C.teal, C.gold,'#8E44AD','#E74C3C','#27AE60','#2980B9','#E67E22','#1ABC9C','#C0392B'];

export default function AdminInvestors() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');
  const [chart,   setChart]   = useState('Portfolio Value');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    supabase.from('v_investor_summary').select('*')
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  function getStatus(row) {
    const pct = row.amortized_value > 0 ? row.total_paid_out / row.amortized_value : 0;
    if (pct >= 1)   return 'Completed';
    if (pct >= 0.5) return 'On Track';
    if (pct >= 0.1) return 'In Progress';
    return 'At Risk';
  }

  const enriched = rows.map(r => ({ ...r, status: getStatus(r), pct: r.amortized_value > 0 ? (r.total_paid_out / r.amortized_value * 100) : 0 }));

  const filtered = enriched
    .filter(r => filter === 'All' || r.status === filter)
    .filter(r => !search || r.full_name.toLowerCase().includes(search.toLowerCase()));

  const totalCapital  = enriched.reduce((s,r) => s + (r.capital_invested || 0), 0);
  const totalAmort    = enriched.reduce((s,r) => s + (r.amortized_value  || 0), 0);
  const totalPaidOut  = enriched.reduce((s,r) => s + (r.total_paid_out   || 0), 0);
  const totalBalance  = enriched.reduce((s,r) => s + (r.balance          || 0), 0);

  const chartData = filtered.map(r => ({
    name   : r.full_name.split(' ')[0],
    value  : chart === 'Portfolio Value' ? r.amortized_value : r.pct,
    paid   : chart === 'Portfolio Value' ? r.total_paid_out  : null,
  }));

  return (
    <AppLayout>
      <PageHeader title="Investor Accounts" subtitle="Full view — admin only. Each investor sees only their own data." />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {[
          { label:'TOTAL CAPITAL DEPLOYED',  value:`GH₵ ${fmt(totalCapital)}`,  sub:`${enriched.length} investors`,         colour:C.gold  },
          { label:'TOTAL PORTFOLIO VALUE',   value:`GH₵ ${fmt(totalAmort)}`,    sub:`GH₵ ${fmt(totalAmort-totalCapital)} total gain`, colour:C.green },
          { label:'TOTAL PAID OUT',          value:`GH₵ ${fmt(totalPaidOut)}`,  sub:`GH₵ ${fmt(totalBalance)} remaining`,   colour:C.teal  },
          { label:'AVG RETURN RATE',         value:'20%',                        sub:'Across all portfolios',                colour:'#2980B9'},
        ].map(k => (
          <div key={k.label} style={{ background:C.white, borderRadius:12, padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', borderTop:`4px solid ${k.colour}` }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#999', textTransform:'uppercase', letterSpacing:.8 }}>{k.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.colour, margin:'6px 0 4px' }}>{k.value}</div>
            <div style={{ fontSize:12, color:'#888' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:20 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:.5 }}>Filter</span>
        {STATUS_FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
            background: filter===f ? C.navy : C.lgray,
            color: filter===f ? C.white : C.dgray,
            transition:'all .15s',
          }}>{f}</button>
        ))}
        <span style={{ fontSize:12, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:.5, marginLeft:10 }}>Chart</span>
        {CHART_OPTS.map(o => (
          <button key={o} onClick={() => setChart(o)} style={{
            padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
            background: chart===o ? C.navy : C.lgray,
            color: chart===o ? C.white : C.dgray,
            transition:'all .15s',
          }}>{o}</button>
        ))}
        <input
          placeholder="Search investor…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft:'auto', padding:'7px 14px', borderRadius:20, border:`1.5px solid #DDD`, fontSize:13, outline:'none', width:200 }}
        />
      </div>

      {loading ? <Spinner /> : <>
        {/* Investor cards grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16, marginBottom:28 }}>
          {filtered.map((row, i) => {
            const ss = STATUS_STYLE[row.status] || {};
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
                {/* Card header */}
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
                    <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{row.num_vehicles || 0} vehicle{row.num_vehicles !== 1 ? 's' : ''}</div>
                  </div>
                  <span style={{ background:ss.bg, color:ss.color, borderRadius:10, padding:'3px 10px', fontSize:11, fontWeight:700, flexShrink:0 }}>
                    {row.status}
                  </span>
                </div>

                {/* Stats row */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                  <Stat label="Invested"  value={`GH₵${fmt(row.capital_invested)}`} colour={C.navy} />
                  <Stat label="Value"     value={`GH₵${fmt(row.amortized_value)}`}  colour={C.green} />
                  <Stat label="Paid Out"  value={`GH₵${fmt(row.total_paid_out)}`}   colour={C.teal} />
                </div>

                {/* Progress bar */}
                <div>
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
              </div>
            );
          })}
        </div>

        {/* Portfolio comparison chart */}
        <div style={{ background:C.white, borderRadius:14, padding:'20px 16px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin:'0 0 16px', fontSize:14, fontWeight:700, color:C.navy }}>Portfolio Comparison — {chart}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ bottom:20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize:12 }} />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => chart==='Return %' ? `${v}%` : `GH₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => chart==='Return %' ? `${Number(v).toFixed(1)}%` : `GH₵ ${fmt(v)}`} />
              <Bar dataKey="value" name={chart==='Return %'?'Return %':'Amortized Value'} fill={C.gold}  radius={[4,4,0,0]} />
              {chart==='Portfolio Value' && <Bar dataKey="paid" name="Paid Out" fill={C.teal} radius={[4,4,0,0]} />}
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
