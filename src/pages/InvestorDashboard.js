import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { AppLayout, PageHeader, StatCard, Table, C, fmt, Spinner } from '../components/UI';

const STATUS_STYLE = {
  'Completed'  : { bg:'#D5F5E3', color: C.green  },
  'On Track'   : { bg:'#D6EAF8', color:'#2980B9' },
  'In Progress': { bg:'#FEF9E7', color: C.amber  },
  'At Risk'    : { bg:'#FADBD8', color: C.red     },
};

const AVATAR_COLORS = [C.teal, C.navy, C.gold,'#8E44AD','#E74C3C','#27AE60','#2980B9','#E67E22'];

function initials(name) {
  return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
}

// ── Investor Overview ──────────────────────────────────────────────────────
export function InvestorOverview() {
  const { profile } = useAuth();
  const [inv,     setInv]     = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [inflows, setInflows] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dFilter, setDFilter] = useState('All');

  useEffect(() => {
    async function load() {
      const { data: invRec } = await supabase.from('investors').select('*').eq('profile_id', profile.id).single();
      if (!invRec) { setLoading(false); return; }

      const [{ data: summ }, { data: po }, { data: inf }, { data: drvs }] = await Promise.all([
        supabase.from('v_investor_summary').select('*').eq('id', invRec.id).single(),
        supabase.from('investor_payouts').select('*').eq('investor_id', invRec.id).order('payout_date', { ascending:false }),
        supabase.from('investor_inflows').select('*').eq('investor_id', invRec.id).order('investment_date', { ascending:false }),
        supabase.from('v_driver_summary').select('*').eq('investor_id', invRec.id),
      ]);
      setInv(summ);
      setPayouts(po || []);
      setInflows(inf || []);
      setDrivers((drvs || []).map(d => ({
        ...d,
        pct: d.vehicle_cost > 0 ? d.total_paid / d.vehicle_cost * 100 : 0,
        status: d.status || getStatus(d),
      })));
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  function getStatus(d) {
    const pct = d.vehicle_cost > 0 ? d.total_paid / d.vehicle_cost : 0;
    if (pct >= 1) return 'Completed';
    if (pct >= 0.5) return 'On Track';
    if (pct >= 0.1) return 'In Progress';
    return 'At Risk';
  }

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!inv)    return <AppLayout><PageHeader title="My Overview" /><p style={{ color:'#999' }}>No investor record found. Contact admin.</p></AppLayout>;

  const pct = inv.amortized_value > 0 ? (inv.total_paid_out / inv.amortized_value * 100) : 0;
  const pieData = [
    { name:'Paid Out',   value: inv.total_paid_out },
    { name:'Remaining',  value: Math.max(inv.balance, 0) },
  ];
  const filteredDrivers = dFilter === 'All' ? drivers : drivers.filter(d => d.status === dFilter);

  const payoutCols = [
    { key:'payout_date',    label:'Date',           render: v => v || '—' },
    { key:'amount',         label:'Amount (GH₵)',   render: v => fmt(v)   },
    { key:'payment_channel',label:'Channel'                                },
  ];

  return (
    <AppLayout>
      <PageHeader title={`Welcome, ${inv.full_name}`} subtitle="Your investment portfolio at a glance" />

      {/* KPI cards */}
      <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Capital Invested"   value={`GH₵ ${fmt(inv.capital_invested)}`} colour={C.navy} />
        <StatCard label="Portfolio Value"    value={`GH₵ ${fmt(inv.amortized_value)}`}  colour={C.gold} />
        <StatCard label="Total Paid Out"     value={`GH₵ ${fmt(inv.total_paid_out)}`}   colour={C.teal} />
        <StatCard label="Balance Remaining"  value={`GH₵ ${fmt(inv.balance)}`}          colour={C.red}  />
        <StatCard label="Vehicles"           value={inv.num_vehicles || drivers.length}  colour={C.teal} />
      </div>

      {/* Progress bar */}
      <div style={{ background:C.white, borderRadius:12, padding:'20px 24px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontWeight:700, color:C.navy, fontSize:14 }}>Payout Progress</span>
          <span style={{ fontWeight:700, color:C.teal, fontSize:14 }}>{pct.toFixed(2)}%</span>
        </div>
        <div style={{ background:'#EEE', borderRadius:8, height:16, overflow:'hidden' }}>
          <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background:`linear-gradient(90deg,${C.teal},${C.navy})`, borderRadius:8 }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:12, color:'#888' }}>
          <span>GH₵ 0</span>
          <span>Target: GH₵ {fmt(inv.amortized_value)}</span>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        <div style={{ background:C.white, borderRadius:12, padding:'18px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin:'0 0 10px', fontSize:13, color:C.navy }}>Payout Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} fontSize={11}>
                <Cell fill={C.teal} /><Cell fill="#EEE" />
              </Pie>
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:C.white, borderRadius:12, padding:'18px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin:'0 0 10px', fontSize:13, color:C.navy }}>Recent Payouts</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={payouts.slice(0,8).reverse()} margin={{ bottom:20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="payout_date" tick={{ fontSize:9 }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`GH₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v=>`GH₵ ${fmt(v)}`} />
              <Bar dataKey="amount" fill={C.gold} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* My Drivers section */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:14 }}>
          <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:C.navy }}>My Drivers ({drivers.length})</h3>
          {['All','Completed','On Track','In Progress','At Risk'].map(f => (
            <button key={f} onClick={() => setDFilter(f)} style={{
              padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: dFilter===f ? C.teal : C.lgray,
              color: dFilter===f ? C.white : C.dgray,
              transition:'all .15s',
            }}>{f}</button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:14 }}>
          {filteredDrivers.map((d, i) => {
            const ss = STATUS_STYLE[d.status] || {};
            const weeksLeft = d.weekly_amount > 0 ? Math.ceil((d.balance||0)/d.weekly_amount) : '—';
            return (
              <div key={d.id} style={{ background:C.white, borderRadius:12, padding:'18px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:`1px solid ${C.lgray}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:AVATAR_COLORS[i%AVATAR_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', color:C.white, fontWeight:800, fontSize:13, flexShrink:0 }}>
                    {initials(d.full_name)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:C.navy, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.full_name}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{d.vehicle || '—'}</div>
                  </div>
                  <span style={{ background:ss.bg, color:ss.color, borderRadius:8, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{d.status}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  <MiniStat label="Vehicle Cost" value={`GH₵ ${fmt(d.vehicle_cost)}`} />
                  <MiniStat label="Total Paid"   value={`GH₵ ${fmt(d.total_paid)}`}   />
                  <MiniStat label="Weekly"       value={`GH₵ ${fmt(d.weekly_amount)}`} />
                  <MiniStat label="Weeks Left"   value={weeksLeft !== '—' ? `~${weeksLeft}` : '—'} />
                </div>
                <div style={{ background:'#EEE', borderRadius:5, height:7, overflow:'hidden' }}>
                  <div style={{ width:`${Math.min(d.pct,100)}%`, height:'100%', background:`linear-gradient(90deg,${C.teal},${C.navy})`, borderRadius:5 }} />
                </div>
                <div style={{ fontSize:11, color:C.teal, fontWeight:700, marginTop:4, textAlign:'right' }}>{d.pct.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payout history table */}
      <h3 style={{ color:C.navy, marginBottom:10, fontSize:14 }}>Payout History</h3>
      <Table columns={payoutCols} rows={payouts} emptyMsg="No payouts recorded yet" />
    </AppLayout>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ background:C.lgray, borderRadius:6, padding:'6px 8px' }}>
      <div style={{ fontSize:9, color:'#888', textTransform:'uppercase', letterSpacing:.5, fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:11, fontWeight:700, color:C.navy, marginTop:2 }}>{value}</div>
    </div>
  );
}

// ── Investor Vehicles page ─────────────────────────────────────────────────
export function InvestorVehicles() {
  const { profile } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');

  useEffect(() => {
    async function load() {
      const { data: invRec } = await supabase.from('investors').select('id').eq('profile_id', profile.id).single();
      if (!invRec) { setLoading(false); return; }
      const { data } = await supabase.from('v_driver_summary').select('*').eq('investor_id', invRec.id);
      setDrivers((data || []).map(d => ({
        ...d,
        pct: d.vehicle_cost > 0 ? d.total_paid / d.vehicle_cost * 100 : 0,
      })));
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  const filtered = filter === 'All' ? drivers : drivers.filter(d => d.status === filter);

  return (
    <AppLayout>
      <PageHeader title="My Vehicles & Drivers" subtitle="Payment progress for all drivers under your investment" />
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {['All','Completed','On Track','In Progress','At Risk'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
            background: filter===f ? C.teal : C.lgray,
            color: filter===f ? C.white : C.dgray,
          }}>{f}</button>
        ))}
      </div>
      {loading ? <Spinner /> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
          {filtered.map((d, i) => {
            const ss = STATUS_STYLE[d.status] || {};
            return (
              <div key={d.id} style={{ background:C.white, borderRadius:12, padding:'18px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:AVATAR_COLORS[i%AVATAR_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', color:C.white, fontWeight:800, fontSize:13 }}>
                    {initials(d.full_name)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>{d.full_name}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{d.vehicle || '—'} · {d.registration || '—'}</div>
                  </div>
                  <span style={{ background:ss.bg, color:ss.color, borderRadius:8, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{d.status}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  <MiniStat label="Cost"    value={`GH₵ ${fmt(d.vehicle_cost)}`} />
                  <MiniStat label="Paid"    value={`GH₵ ${fmt(d.total_paid)}`}   />
                  <MiniStat label="Balance" value={`GH₵ ${fmt(d.balance)}`}      />
                  <MiniStat label="Weekly"  value={`GH₵ ${fmt(d.weekly_amount)}`} />
                </div>
                <div style={{ background:'#EEE', borderRadius:5, height:7, overflow:'hidden' }}>
                  <div style={{ width:`${Math.min(d.pct,100)}%`, height:'100%', background:`linear-gradient(90deg,${C.teal},${C.navy})`, borderRadius:5 }} />
                </div>
                <div style={{ fontSize:11, color:C.teal, fontWeight:700, marginTop:4, textAlign:'right' }}>{d.pct.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
