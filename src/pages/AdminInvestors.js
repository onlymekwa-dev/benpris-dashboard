import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, StatCard, C, fmt, Spinner } from '../components/UI';

export default function AdminInvestors() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    supabase.from('v_investor_summary').select('*')
      .then(({ data }) => { setRows(data || []); setLoad(false); });
  }, []);

  const totalCapital  = rows.reduce((s,r) => s + (r.capital_invested || 0), 0);
  const totalAmort    = rows.reduce((s,r) => s + (r.amortized_value  || 0), 0);
  const totalPaidOut  = rows.reduce((s,r) => s + (r.total_paid_out   || 0), 0);
  const totalBalance  = rows.reduce((s,r) => s + (r.balance          || 0), 0);

  const cols = [
    { key:'full_name',       label:'Investor'             },
    { key:'id_number',       label:'ID No.'               },
    { key:'contact',         label:'Contact'              },
    { key:'num_vehicles',    label:'Vehicles',    render: v => fmt(v,0) },
    { key:'capital_invested',label:'Capital (GH₵)',render: v => fmt(v) },
    { key:'amortized_value', label:'Amortized (GH₵)',render: v => fmt(v) },
    { key:'total_paid_out',  label:'Paid Out (GH₵)',render: v => fmt(v) },
    { key:'balance',         label:'Balance (GH₵)', render: v => fmt(v) },
    {
      key:'pct',
      label:'% Paid',
      render: (_, row) => {
        const pct = row.amortized_value > 0
          ? (row.total_paid_out / row.amortized_value * 100).toFixed(2)
          : '0.00';
        return (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, background:'#eee', borderRadius:4, height:8, minWidth:60 }}>
              <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background: C.teal, borderRadius:4 }} />
            </div>
            <span style={{ fontSize:11 }}>{pct}%</span>
          </div>
        );
      }
    },
  ];

  return (
    <AppLayout>
      <PageHeader title="Investor Database" subtitle="Capital invested, amortized values, and payout progress" />

      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Investors"       value={rows.length}              colour={C.teal} />
        <StatCard label="Total Capital"   value={`GH₵ ${fmt(totalCapital)}`} colour={C.navy} />
        <StatCard label="Total Amortized" value={`GH₵ ${fmt(totalAmort)}`}  colour={C.gold} />
        <StatCard label="Total Paid Out"  value={`GH₵ ${fmt(totalPaidOut)}`} colour={C.teal} />
        <StatCard label="Remaining"       value={`GH₵ ${fmt(totalBalance)}`} colour={C.red}  />
      </div>

      {loading ? <Spinner /> : <Table columns={cols} rows={rows} />}
    </AppLayout>
  );
}
