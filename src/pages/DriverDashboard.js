import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { AppLayout, PageHeader, C, fmt, Spinner, Table } from '../components/UI';

export function DriverOverview() {
  const { profile } = useAuth();
  const [driver,   setDriver]   = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('overview');

  useEffect(() => {
    async function load() {
      const { data: drv } = await supabase
        .from('drivers').select('*').eq('profile_id', profile.id).single();
      if (!drv) { setLoading(false); return; }

      const { data: summ } = await supabase
        .from('v_driver_summary').select('*').eq('id', drv.id).single();
      setDriver(summ || drv);

      const { data: pays } = await supabase
        .from('driver_payments').select('*').eq('driver_id', drv.id)
        .order('payment_date', { ascending: false });
      setPayments(pays || []);
      setLoading(false);
    }
    if (profile) load();
  }, [profile]);

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!driver) return (
    <AppLayout>
      <PageHeader title="My Dashboard" />
      <p style={{ color:'#999' }}>No driver record found. Contact admin.</p>
    </AppLayout>
  );

  const cost     = driver.vehicle_cost  || 0;
  const paid     = driver.total_paid    || 0;
  const balance  = driver.balance       || 0;
  const pct      = cost > 0 ? (paid / cost * 100) : 0;
  const weekly   = driver.weekly_amount || 0;
  const weeksLeft= weekly > 0 ? Math.ceil(balance / weekly) : 0;
  const weeksPaid= weekly > 0 ? Math.floor(paid / weekly)   : 0;

  const statusColour = {
    'Completed' : C.green, 'On Track':'#2980B9',
    'In Progress': C.amber, 'At Risk': C.red,
  }[driver.status] || C.dgray;

  // Monthly chart
  const monthly = payments.reduce((acc, p) => {
    const mon = p.payment_date?.slice(0,7) || 'Unknown';
    acc[mon] = (acc[mon] || 0) + p.amount;
    return acc;
  }, {});
  const chartData = Object.entries(monthly).sort().map(([m,a]) => ({ month: m, amount: a }));

  // Cumulative line chart
  let running = 0;
  const cumulativeData = [...payments].reverse().map(p => {
    running += p.amount;
    return { date: p.payment_date, cumulative: running };
  });

  const paymentCols = [
    { key:'payment_date',    label:'Date'                             },
    { key:'amount',          label:'Amount (GH₵)', render: v=>fmt(v) },
    { key:'payment_channel', label:'Channel'                         },
    { key:'transaction_id',  label:'Transaction ID'                  },
  ];

  return (
    <AppLayout>
      <PageHeader title={`Hello, ${driver.full_name}`} subtitle="Your hire-purchase payment tracker" />

      {/* Big vehicle card */}
      <div style={{
        background: C.white, borderRadius:16,
        boxShadow:'0 4px 20px rgba(0,0,0,0.1)',
        padding:'24px 28px', marginBottom:24,
        borderTop:`5px solid ${statusColour}`,
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:20 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:C.navy }}>{driver.vehicle || 'Vehicle not assigned'}</div>
            <div style={{ fontSize:13, color:'#888', marginTop:3 }}>
              Reg: {driver.registration || '—'} &nbsp;|&nbsp; Investor: {driver.investor_name || '—'}
            </div>
          </div>
          <span style={{
            background: statusColour+'22', color: statusColour,
            borderRadius:20, padding:'6px 18px',
            fontWeight:800, fontSize:14,
          }}>
            {driver.status || 'In Progress'}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ background:'#E8EAED', borderRadius:12, height:28, overflow:'hidden', marginBottom:10 }}>
          <div style={{
            width:`${Math.min(pct,100)}%`, height:'100%',
            background:`linear-gradient(90deg,${C.teal},${C.navy})`,
            borderRadius:12, display:'flex', alignItems:'center',
            justifyContent:'flex-end', paddingRight:10,
            minWidth: pct > 8 ? undefined : 0,
            transition:'width 1.2s ease',
          }}>
            {pct > 8 && <span style={{ color:C.white, fontWeight:700, fontSize:13 }}>{pct.toFixed(1)}%</span>}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#888', marginBottom:20 }}>
          <span>GH₵ 0</span>
          <span style={{ fontWeight:700, color:C.teal }}>GH₵ {fmt(paid)} paid of GH₵ {fmt(cost)}</span>
          <span>GH₵ {fmt(cost)}</span>
        </div>

        {/* Stats grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
          {[
            { label:'Vehicle Cost',    value:`GH₵ ${fmt(cost)}`,    colour:C.navy  },
            { label:'Total Paid',      value:`GH₵ ${fmt(paid)}`,    colour:C.teal  },
            { label:'Balance',         value:`GH₵ ${fmt(balance)}`, colour:C.red   },
            { label:'Weekly Payment',  value:`GH₵ ${fmt(weekly)}`,  colour:C.gold  },
            { label:'Weeks Paid',      value:weeksPaid,              colour:C.navy  },
            { label:'Weeks Remaining', value:`~${weeksLeft}`,        colour:C.amber },
          ].map(s => (
            <div key={s.label} style={{ background:C.lgray, borderRadius:10, padding:'12px 16px' }}>
              <div style={{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:.5, fontWeight:600 }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:s.colour, marginTop:4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`2px solid ${C.lgray}`, marginBottom:20 }}>
        {[
          { id:'overview', label:'Payment Charts' },
          { id:'history',  label:`Payment History (${payments.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'10px 22px', border:'none', background:'transparent',
            fontWeight: tab===t.id ? 800 : 400,
            color: tab===t.id ? C.navy : '#888',
            borderBottom: tab===t.id ? `3px solid ${C.navy}` : '3px solid transparent',
            cursor:'pointer', fontSize:14,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* Monthly payments */}
          <div style={{ background:C.white, borderRadius:12, padding:'18px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin:'0 0 12px', fontSize:13, color:C.navy }}>Monthly Payments (GH₵)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ bottom:20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize:10 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`GH₵${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v=>`GH₵ ${fmt(v)}`} />
                <Bar dataKey="amount" fill={C.teal} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Cumulative */}
          <div style={{ background:C.white, borderRadius:12, padding:'18px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            <h3 style={{ margin:'0 0 12px', fontSize:13, color:C.navy }}>Cumulative Payments (GH₵)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulativeData} margin={{ bottom:20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize:10 }} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`GH₵${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v=>`GH₵ ${fmt(v)}`} />
                <Line type="monotone" dataKey="cumulative" stroke={C.navy} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <Table columns={paymentCols} rows={payments} emptyMsg="No payment records yet" />
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

  const total = payments.reduce((s,p)=>s+(p.amount||0),0);
  const cols = [
    { key:'payment_date',    label:'Date'                             },
    { key:'amount',          label:'Amount (GH₵)', render: v=>fmt(v) },
    { key:'payment_channel', label:'Channel'                         },
    { key:'transaction_id',  label:'Transaction ID'                  },
  ];

  return (
    <AppLayout>
      <PageHeader title="My Payment History" subtitle={`Total paid: GH₵ ${fmt(total)} across ${payments.length} payments`} />
      {loading ? <Spinner /> : <Table columns={cols} rows={payments} emptyMsg="No payment records" />}
    </AppLayout>
  );
}
