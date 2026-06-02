import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { AppLayout, PageHeader, StatCard, Table, C, fmt, Spinner } from '../components/UI';

// ── Investor Overview ──────────────────────────────────────────────────────
export function InvestorOverview() {
  const { profile } = useAuth();
  const [inv,     setInv]     = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [inflows, setInflows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Get investor record linked to this profile
      const { data: invRec } = await supabase
        .from('investors').select('*').eq('profile_id', profile.id).single();
      if (!invRec) { setLoading(false); return; }

      const [{ data: summ }, { data: po }, { data: inf }] = await Promise.all([
        supabase.from('v_investor_summary').select('*').eq('id', invRec.id).single(),
        supabase.from('investor_payouts').select('*').eq('investor_id', invRec.id).order('payout_date', { ascending:false }),
        supabase.from('investor_inflows').select('*').eq('investor_id', invRec.id).order('investment_date', { ascending:false }),
      ]);
      setInv(summ);
      setPayouts(po || []);
      setInflows(inf || []);
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!inv) return <AppLayout><PageHeader title="My Overview" /><p style={{color:'#999'}}>No investor record found. Contact admin.</p></AppLayout>;

  const pct = inv.amortized_value > 0 ? (inv.total_paid_out / inv.amortized_value * 100) : 0;
  const pieData = [
    { name:'Paid Out', value: inv.total_paid_out },
    { name:'Remaining', value: Math.max(inv.balance, 0) },
  ];

  const payoutCols = [
    { key:'payout_date',    label:'Date',          render: v => v || '—' },
    { key:'amount',         label:'Amount (GH₵)',  render: v => fmt(v) },
    { key:'payment_channel',label:'Channel' },
    { key:'transaction_id', label:'Transaction ID' },
  ];
  const inflowCols = [
    { key:'investment_date',label:'Date',          render: v => v || '—' },
    { key:'amount',         label:'Invested (GH₵)',render: v => fmt(v) },
    { key:'payment_channel',label:'Channel' },
    { key:'transaction_id', label:'Transaction ID' },
  ];

  return (
    <AppLayout>
      <PageHeader title={`Welcome, ${inv.full_name}`} subtitle="Your investment summary at a glance" />

      {/* KPI Cards */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Capital Invested"  value={`GH₵ ${fmt(inv.capital_invested)}`} colour={C.navy} />
        <StatCard label="Amortized Value"   value={`GH₵ ${fmt(inv.amortized_value)}`}  colour={C.gold} />
        <StatCard label="Total Paid Out"    value={`GH₵ ${fmt(inv.total_paid_out)}`}   colour={C.teal} />
        <StatCard label="Balance Remaining" value={`GH₵ ${fmt(inv.balance)}`}          colour={C.red}  />
        <StatCard label="Vehicles Allocated"value={inv.num_vehicles}                    colour={C.teal} />
      </div>

      {/* Progress bar */}
      <div style={{
        background:C.white, borderRadius:12, padding:'20px 24px',
        boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:20,
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontWeight:700, color:C.navy, fontSize:14 }}>Payout Progress</span>
          <span style={{ fontWeight:700, color:C.teal, fontSize:14 }}>{pct.toFixed(2)}%</span>
        </div>
        <div style={{ background:'#EEE', borderRadius:8, height:16, overflow:'hidden' }}>
          <div style={{
            width:`${Math.min(pct,100)}%`, height:'100%',
            background:`linear-gradient(90deg,${C.teal},${C.navy})`,
            borderRadius:8, transition:'width 1s ease',
          }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:12, color:'#888' }}>
          <span>GH₵ 0</span>
          <span>GH₵ {fmt(inv.amortized_value)} (target)</span>
        </div>
      </div>

      {/* Pie chart + payout trend */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
        <div style={{ background:C.white, borderRadius:12, padding:'20px 16px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin:'0 0 12px', fontSize:14, color:C.navy }}>Payout Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                label={({ name, percent }) => `${name} ${(percent*100).toFixed(1)}%`} fontSize={12}>
                <Cell fill={C.teal} />
                <Cell fill="#EEE" />
              </Pie>
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:C.white, borderRadius:12, padding:'20px 16px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin:'0 0 12px', fontSize:14, color:C.navy }}>Weekly Payout History</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={payouts.slice(0,10).reverse()} margin={{ bottom:20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="payout_date" tick={{ fontSize:10 }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v=>`GH₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v=>`GH₵ ${fmt(v)}`} />
              <Bar dataKey="amount" name="Payout" fill={C.gold} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tables */}
      <h3 style={{ color:C.navy, marginBottom:10 }}>Investment History</h3>
      <Table columns={inflowCols} rows={inflows} emptyMsg="No investment records" />

      <h3 style={{ color:C.navy, margin:'24px 0 10px' }}>Payout History</h3>
      <Table columns={payoutCols} rows={payouts} emptyMsg="No payouts yet" />
    </AppLayout>
  );
}

// ── Investor Vehicles ──────────────────────────────────────────────────────
export function InvestorVehicles() {
  const { profile } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: invRec } = await supabase.from('investors').select('id').eq('profile_id', profile.id).single();
      if (!invRec) { setLoading(false); return; }
      const { data } = await supabase.from('v_driver_summary').select('*').eq('investor_id', invRec.id);
      setDrivers(data || []);
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  const cols = [
    { key:'full_name',    label:'Driver'          },
    { key:'vehicle',      label:'Vehicle'         },
    { key:'registration', label:'Reg. No.'        },
    { key:'vehicle_cost', label:'Cost (GH₵)',     render: v => fmt(v) },
    { key:'total_paid',   label:'Total Paid (GH₵)',render: v => fmt(v) },
    { key:'balance',      label:'Balance (GH₵)',  render: v => fmt(v) },
    { key:'pct_paid',     label:'% Paid',         render: v => (
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ flex:1, background:'#eee', borderRadius:4, height:8, minWidth:50 }}>
          <div style={{ width:`${Math.min(v*100,100)}%`, height:'100%', background:C.teal, borderRadius:4 }}/>
        </div>
        <span style={{fontSize:11}}>{(v*100).toFixed(1)}%</span>
      </div>
    )},
    { key:'status', label:'Status', render: v => {
      const map = { 'Completed':C.green,'On Track':'#2980B9','In Progress':C.amber,'At Risk':C.red };
      return <span style={{ fontWeight:700, color:map[v]||C.dgray }}>{v||'—'}</span>;
    }},
  ];

  return (
    <AppLayout>
      <PageHeader title="My Vehicles & Drivers" subtitle="Drivers allocated under your investment" />
      {loading ? <Spinner /> : <Table columns={cols} rows={drivers} emptyMsg="No vehicles found" />}
    </AppLayout>
  );
}
