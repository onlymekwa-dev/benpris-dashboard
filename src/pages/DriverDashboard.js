import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
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
    if (!profile) return;
    async function load() {
      setLoading(true);

      // Get driver record linked to this profile
      const { data: drv, error: drvErr } = await supabase
        .from('v_driver_summary')
        .select('*')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (drvErr) console.error('Driver lookup error:', drvErr.message);
      console.log('Driver record:', drv);

      if (!drv) {
        // Fallback: try matching by full_name
        const { data: drv2 } = await supabase
          .from('v_driver_summary')
          .select('*')
          .ilike('full_name', profile.full_name)
          .maybeSingle();
        setDriver(drv2 || null);
        if (drv2) {
          const { data: pays } = await supabase
            .from('driver_payments')
            .select('*')
            .eq('driver_id', drv2.id)
            .order('payment_date', { ascending: false });
          setPayments(pays || []);
        }
      } else {
        setDriver(drv);
        const { data: pays } = await supabase
          .from('driver_payments')
          .select('*')
          .eq('driver_id', drv.id)
          .order('payment_date', { ascending: false });
        setPayments(pays || []);
      }

      setLoading(false);
    }
    load();
  }, [profile]);

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  if (!driver) return (
    <AppLayout>
      <PageHeader title="My Dashboard" />
      <div style={{ background:C.white, borderRadius:12, padding:32, textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🚗</div>
        <div style={{ fontWeight:700, color:C.navy, fontSize:16, marginBottom:8 }}>No driver record found</div>
        <div style={{ color:'#888', fontSize:13 }}>
          Your account hasn't been linked to a driver record yet. Contact admin to link your account.
        </div>
      </div>
    </AppLayout>
  );

  const cost      = Number(driver.vehicle_cost  || 0);
  const paid      = Number(driver.total_paid    || 0);
  const balance   = Number(driver.balance       || 0);
  const pct       = Number(driver.pct_paid || 0) * 100;  // decimal to %
  const weekly    = Number(driver.weekly_amount || 0);
  const weeksLeft = weekly > 0 ? Math.ceil(balance / weekly) : 0;
  const weeksPaid = weekly > 0 ? Math.floor(paid / weekly)   : 0;

  const statusColour = {
    'Completed':'#27AE60','On Track':'#2980B9','In Progress':'#F39C12','At Risk':'#E74C3C',
  }[driver.status] || C.amber;

  // Monthly chart data
  const monthly = payments.reduce((acc, p) => {
    const mon = (p.payment_date || '').slice(0, 7) || 'Unknown';
    acc[mon] = (acc[mon] || 0) + Number(p.amount || 0);
    return acc;
  }, {});
  const chartData = Object.entries(monthly).sort().map(([m, a]) => ({ month: m, amount: a }));

  // Cumulative
  let running = 0;
  const cumulData = [...payments].reverse().map(p => {
    running += Number(p.amount || 0);
    return { date: (p.payment_date || '').slice(0, 7), cumulative: running };
  });

  const cols = [
    { key:'payment_date',    label:'Date'                               },
    { key:'amount',          label:'Amount (GH₵)', render: v => fmt(v)  },
    { key:'payment_channel', label:'Channel'                            },
    { key:'transaction_id',  label:'Transaction'                        },
  ];

  return (
    <AppLayout>
      <PageHeader title={`Hello, ${driver.full_name}`} subtitle="Your hire-purchase payment tracker" />

      {/* Vehicle card */}
      <div style={{
        background: C.white, borderRadius:14,
        boxShadow:'0 4px 18px rgba(0,0,0,0.09)',
        padding: isMobile ? '16px' : '22px 26px',
        marginBottom: 20, borderTop: `5px solid ${statusColour}`,
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:14 }}>
          <div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight:800, color:C.navy }}>
              {driver.vehicle || 'Vehicle not assigned'}
            </div>
            <div style={{ fontSize:12, color:'#888', marginTop:3 }}>
              Reg: {driver.registration || '—'} &nbsp;·&nbsp; Investor: {driver.investor_name || '—'}
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
        <div style={{ background:'#E8EAED', borderRadius:10, height: isMobile ? 20 : 24, overflow:'hidden', marginBottom:8 }}>
          <div style={{
            width:`${Math.min(pct, 100)}%`, height:'100%',
            background:`linear-gradient(90deg,${C.teal},${C.navy})`,
            borderRadius:10, display:'flex', alignItems:'center',
            justifyContent:'flex-end', paddingRight:8,
            transition:'width 1.2s ease',
          }}>
            {pct > 8 && <span style={{ color:C.white, fontWeight:700, fontSize:12 }}>{pct.toFixed(1)}%</span>}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#888', marginBottom:16 }}>
          <span>GH₵ 0</span>
          <span style={{ fontWeight:700, color:C.teal }}>GH₵ {fmt(paid)} / GH₵ {fmt(cost)}</span>
          <span>GH₵ {fmt(cost)}</span>
        </div>

        <KpiRow>
          <StatCard label="Vehicle Cost"    value={`GH₵ ${fmt(cost)}`}     colour={C.navy}  />
          <StatCard label="Total Paid"      value={`GH₵ ${fmt(paid)}`}     colour={C.teal}  />
          <StatCard label="Balance"         value={`GH₵ ${fmt(balance)}`}  colour={C.red}   />
          <StatCard label="Weekly Payment"  value={`GH₵ ${fmt(weekly)}`}   colour={C.gold}  />
          <StatCard label="Weeks Paid"      value={weeksPaid}               colour={C.navy}  />
          <StatCard label="Weeks Remaining" value={`~${weeksLeft}`}         colour={C.amber} />
        </KpiRow>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`2px solid ${C.lgray}`, marginBottom:16 }}>
        {[
          { id:'charts',  label:'Payment Charts' },
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
        chartData.length === 0 ? (
          <div style={{ background:C.white, borderRadius:12, padding:32, textAlign:'center', color:'#888' }}>
            No payment records found yet.
          </div>
        ) : (
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
        )
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
    if (!profile) return;
    async function load() {
      const { data: drv } = await supabase
        .from('drivers').select('id').eq('profile_id', profile.id).maybeSingle();
      if (!drv) {
        // Fallback by name
        const { data: drv2 } = await supabase
          .from('drivers').select('id').ilike('full_name', profile.full_name).maybeSingle();
        if (drv2) {
          const { data } = await supabase
            .from('driver_payments').select('*')
            .eq('driver_id', drv2.id).order('payment_date', { ascending: false });
          setPayments(data || []);
        }
      } else {
        const { data } = await supabase
          .from('driver_payments').select('*')
          .eq('driver_id', drv.id).order('payment_date', { ascending: false });
        setPayments(data || []);
      }
      setLoading(false);
    }
    load();
  }, [profile]);

  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const cols = [
    { key:'payment_date',    label:'Date'                              },
    { key:'amount',          label:'Amount (GH₵)', render: v => fmt(v) },
    { key:'payment_channel', label:'Channel'                           },
    { key:'transaction_id',  label:'Transaction'                       },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="My Payment History"
        subtitle={`Total: GH₵ ${fmt(total)} across ${payments.length} payments`}
      />
      {loading ? <Spinner /> : <Table columns={cols} rows={payments} emptyMsg="No payment records yet" />}
    </AppLayout>
  );
}
