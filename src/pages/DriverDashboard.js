import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { AppLayout, PageHeader, StatCard, Table, C, fmt, Spinner } from '../components/UI';

export function DriverOverview() {
  const { profile } = useAuth();
  const [driver,   setDriver]   = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      const { data: drv } = await supabase
        .from('drivers').select('*,vehicles(*),investors(full_name)')
        .eq('profile_id', profile.id).single();
      if (!drv) { setLoading(false); return; }

      const { data: summ } = await supabase
        .from('v_driver_summary').select('*').eq('id', drv.id).single();
      setDriver(summ || drv);

      const { data: pays } = await supabase
        .from('driver_payments')
        .select('*').eq('driver_id', drv.id)
        .order('payment_date', { ascending: false });
      setPayments(pays || []);
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!driver) return (
    <AppLayout>
      <PageHeader title="My Overview" />
      <p style={{ color:'#999' }}>No driver record found. Contact admin.</p>
    </AppLayout>
  );

  const cost    = driver.vehicle_cost  || 0;
  const paid    = driver.total_paid    || 0;
  const balance = driver.balance       || 0;
  const pct     = cost > 0 ? (paid / cost * 100) : 0;

  const statusColour = {
    'Completed' : C.green,
    'On Track'  : '#2980B9',
    'In Progress': C.amber,
    'At Risk'   : C.red,
  }[driver.status] || C.dgray;

  const paymentCols = [
    { key:'payment_date',    label:'Date'           },
    { key:'amount',          label:'Amount (GH₵)',  render: v => fmt(v) },
    { key:'payment_channel', label:'Channel'        },
    { key:'transaction_id',  label:'Transaction ID' },
  ];

  // Monthly grouping for chart
  const monthly = payments.reduce((acc, p) => {
    const mon = p.payment_date?.slice(0,7) || 'Unknown';
    acc[mon] = (acc[mon] || 0) + p.amount;
    return acc;
  }, {});
  const chartData = Object.entries(monthly).sort().map(([m,a]) => ({ month:m, amount:a }));

  return (
    <AppLayout>
      <PageHeader title={`Hello, ${driver.full_name}`} subtitle="Your hire-purchase payment tracker" />

      {/* KPI row */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Vehicle"       value={driver.vehicle || 'Not Assigned'} colour={C.navy} />
        <StatCard label="Vehicle Cost"  value={`GH₵ ${fmt(cost)}`}              colour={C.navy} />
        <StatCard label="Total Paid"    value={`GH₵ ${fmt(paid)}`}              colour={C.teal} />
        <StatCard label="Balance"       value={`GH₵ ${fmt(balance)}`}           colour={C.red}  />
        <StatCard label="Weekly Amount" value={`GH₵ ${fmt(driver.weekly_amount)}`} colour={C.gold} />
      </div>

      {/* Progress card */}
      <div style={{
        background: C.white, borderRadius:14, padding:'24px 28px',
        boxShadow:'0 2px 12px rgba(0,0,0,0.08)', marginBottom:24,
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:18, color:C.navy }}>Payment Progress</div>
            <div style={{ fontSize:13, color:'#888', marginTop:2 }}>
              Reg: {driver.registration || '—'} &nbsp;|&nbsp; Investor: {driver.investor_name || '—'}
            </div>
          </div>
          <div style={{
            background: statusColour+'22', color: statusColour,
            borderRadius:20, padding:'6px 16px', fontWeight:800, fontSize:14,
          }}>
            {driver.status || 'In Progress'}
          </div>
        </div>

        {/* Big progress bar */}
        <div style={{ background:'#E8EAED', borderRadius:12, height:28, overflow:'hidden', marginBottom:10 }}>
          <div style={{
            width:`${Math.min(pct,100)}%`, height:'100%',
            background:`linear-gradient(90deg,${C.teal},${C.navy})`,
            borderRadius:12,
            display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:10,
            transition:'width 1.2s ease',
            minWidth: pct > 5 ? undefined : 0,
          }}>
            {pct > 8 && <span style={{ color:C.white, fontWeight:700, fontSize:13 }}>{pct.toFixed(1)}%</span>}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#888' }}>
          <span>GH₵ 0</span>
          <span style={{ fontWeight:700, color:C.teal }}>GH₵ {fmt(paid)} paid of GH₵ {fmt(cost)}</span>
          <span>GH₵ {fmt(cost)}</span>
        </div>

        {/* Weeks info */}
        <div style={{ marginTop:16, display:'flex', gap:20, flexWrap:'wrap' }}>
          <Stat label="Payments Made" value={payments.length} />
          <Stat label="Weeks Remaining (est.)" value={driver.weekly_amount > 0 ? Math.ceil(balance / driver.weekly_amount) : '—'} />
        </div>
      </div>

      {/* Payment chart */}
      {chartData.length > 0 && (
        <div style={{
          background:C.white, borderRadius:12, padding:'20px 16px',
          boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:24,
        }}>
          <h3 style={{ margin:'0 0 14px', fontSize:14, color:C.navy }}>Monthly Payment History (GH₵)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ bottom:20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize:11 }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v=>`GH₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v=>`GH₵ ${fmt(v)}`} />
              <Bar dataKey="amount" name="Paid" fill={C.teal} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payments table */}
      <h3 style={{ color:C.navy, marginBottom:10 }}>Payment Records</h3>
      <Table columns={paymentCols} rows={payments} emptyMsg="No payments recorded yet" />
    </AppLayout>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background:C.lgray, borderRadius:8, padding:'10px 16px', minWidth:140 }}>
      <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color:C.navy, marginTop:3 }}>{value}</div>
    </div>
  );
}

export function DriverPayments() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const { data: drv } = await supabase.from('drivers').select('id').eq('profile_id', profile.id).single();
      if (!drv) { setLoading(false); return; }
      const { data } = await supabase.from('driver_payments').select('*')
        .eq('driver_id', drv.id).order('payment_date', { ascending: false });
      setPayments(data || []);
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  const total = payments.reduce((s,p)=>s+(p.amount||0),0);

  const cols = [
    { key:'payment_date',    label:'Date'           },
    { key:'amount',          label:'Amount (GH₵)',  render: v => fmt(v) },
    { key:'payment_channel', label:'Channel'        },
    { key:'transaction_id',  label:'Transaction ID' },
  ];

  return (
    <AppLayout>
      <PageHeader title="My Payment History" subtitle={`Total paid: GH₵ ${fmt(total)}`} />
      {loading ? <Spinner /> : <Table columns={cols} rows={payments} emptyMsg="No payment records" />}
    </AppLayout>
  );
}
