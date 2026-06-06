import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { AppLayout, PageHeader, KpiRow, StatCard, ChartCard, Table, C, fmt, Spinner, useIsMobile } from '../components/UI';

export function DriverOverview() {
  const { profile } = useAuth();
  const [driver,   setDriver]   = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('charts');
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      const { data: drv } = await supabase.from('drivers').select('*').eq('profile_id', profile.id).single();
      if (!drv) { setLoading(false); return; }
      const { data: summ } = await supabase.from('v_driver_summary').select('*').eq('id', drv.id).single();
      setDriver(summ || drv);
      const { data: pays } = await supabase.from('driver_payments').select('*')
        .eq('driver_id', drv.id).order('payment_date', { ascending: false });
      setPayments(pays || []);
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!driver) return (
    <AppLayout>
      <PageHeader title="My Dashboard" />
      <p style={{ color:'#999', padding:20 }}>No driver record found. Contact admin.</p>
    </AppLayout>
  );

  const cost      = driver.vehicle_cost  || 0;
  const paid      = driver.total_paid    || 0;
  const balance   = driver.balance       || 0;
  const pct       = Number(driver.pct_paid || 0);
  const weekly    = driver.weekly_amount || 0;
  const weeksLeft = weekly > 0 ? Math.ceil(balance / weekly) : 0;
  const weeksPaid = weekly > 0 ? Math.floor(paid / weekly)   : 0;

  const statusColour = {
    'Completed':'#27AE60','On Track':'#2980B9','In Progress':'#F39C12','At Risk':'#E74C3C',
  }[driver.status] || C.dgray;

  // Monthly chart
  const monthly = payments.reduce((acc, p) => {
    const mon = p.payment_date?.slice(0,7) || 'Unknown';
    acc[mon] = (acc[mon] || 0) + p.amount;
    return acc;
  }, {});
  const chartData = Object.entries(monthly).sort().map(([m,a]) => ({ month: m, amount: a }));

  // Cumulative
  let running = 0;
  const cumulData = [...payments].reverse().map(p => {
    running += p.amount;
    return { date: p.payment_date?.slice(0,7) || '', cumulative: running };
  });

  const cols = [
    { key:'payment_date',    label:'Date'                              },
    { key:'amount',          label:'Amount (GH₵)', render: v => fmt(v) },
    { key:'payment_channel', label:'Channel'                           },
    { key:'transaction_id',  label:'Transaction'                       },
  ];

  return (
    <AppLayout>
      <PageHeader title={`Hello, ${driver.full_name}`} subtitle="Your hire-purchase tracker" />

      {/* Vehicle card */}
      <div style={{
        background:C.white, borderRadius:14,
        boxShadow:'0 4px 18px rgba(0,0,0,0.09)',
        padding: isMobile ? '18px 16px' : '22px 26px',
        marginBottom:20, borderTop:`5px solid ${statusColour}`,
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:16 }}>
          <div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight:800, color:C.navy }}>
              {driver.vehicle || 'Vehicle not assigned'}
            </div>
            <div style={{ fontSize:12, color:'#888', marginTop:3 }}>
              Reg: {driver.registration || '—'} · Investor: {driver.investor_name || '—'}
            </div>
          </div>
          <span style={{
            background:`${statusColour}22`, color:statusColour,
            borderRadius:20, padding:'5px 14px', fontWeight:800, fontSize:13,
          }}>
            {driver.status || 'In Progress'}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ background:'#E8EAED', borderRadius:10, height: isMobile ? 22 : 26, overflow:'hidden', marginBottom:8 }}>
          <div style={{
            width:`${Math.min(pct,100)}%`, height:'100%',
            background:`linear-gradient(90deg,${C.teal},${C.navy})`,
            borderRadius:10, display:'flex', alignItems:'center',
            justifyContent:'flex-end', paddingRight:8,
            transition:'width 1.2s ease',
          }}>
            {pct > 10 && <span style={{ color:C.white, fontWeight:700, fontSize:12 }}>{pct.toFixed(1)}%</span>}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#888', marginBottom:16 }}>
          <span>GH₵ 0</span>
          <span style={{ fontWeight:700, color:C.teal }}>GH₵ {fmt(paid)} / GH₵ {fmt(cost)}</span>
          <span>GH₵ {fmt(cost)}</span>
        </div>

        {/* Stats grid */}
        <KpiRow>
          <StatCard label="Vehicle Cost"     value={`GH₵ ${fmt(cost)}`}     colour={C.navy}  />
          <StatCard label="Total Paid"       value={`GH₵ ${fmt(paid)}`}     colour={C.teal}  />
          <StatCard label="Balance"          value={`GH₵ ${fmt(balance)}`}  colour={C.red}   />
          <StatCard label="Weekly Payment"   value={`GH₵ ${fmt(weekly)}`}   colour={C.gold}  />
          <StatCard label="Weeks Paid"       value={weeksPaid}               colour={C.navy}  />
          <StatCard label="Weeks Remaining"  value={`~${weeksLeft}`}         colour={C.amber} />
        </KpiRow>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`2px solid ${C.lgray}`, marginBottom:18 }}>
        {[
          { id:'charts',  label:'Payment Charts'              },
          { id:'history', label:`History (${payments.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'10px 18px', border:'none', background:'transparent',
            fontWeight: tab===t.id ? 800 : 400,
            color: tab===t.id ? C.navy : '#888',
            borderBottom: tab===t.id ? `3px solid ${C.navy}` : '3px solid transparent',
            cursor:'pointer', fontSize:13, whiteSpace:'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'charts' ? (
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:14 }}>
          <ChartCard title="Monthly Payments (GH₵)" height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ bottom:24, left:0, right:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize:9 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize:9 }} tickFormatter={v=>`GH₵${(v/1000).toFixed(0)}k`} width={40} />
                <Tooltip formatter={v=>`GH₵ ${fmt(v)}`} />
                <Bar dataKey="amount" fill={C.teal} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Cumulative Payments (GH₵)" height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulData} margin={{ bottom:24, left:0, right:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize:9 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize:9 }} tickFormatter={v=>`GH₵${(v/1000).toFixed(0)}k`} width={40} />
                <Tooltip formatter={v=>`GH₵ ${fmt(v)}`} />
                <Line type="monotone" dataKey="cumulative" stroke={C.navy} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : (
        <Table columns={cols} rows={payments} emptyMsg="No payment records yet" />
      )}
    </AppLayout>
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

  const total = payments.reduce((s,p) => s+(p.amount||0), 0);
  const cols = [
    { key:'payment_date',    label:'Date'                              },
    { key:'amount',          label:'Amount (GH₵)', render: v => fmt(v) },
    { key:'payment_channel', label:'Channel'                           },
    { key:'transaction_id',  label:'Transaction'                       },
  ];

  return (
    <AppLayout>
      <PageHeader title="My Payment History" subtitle={`Total: GH₵ ${fmt(total)} · ${payments.length} records`} />
      {loading ? <Spinner /> : <Table columns={cols} rows={payments} emptyMsg="No payment records" />}
    </AppLayout>
  );
}
