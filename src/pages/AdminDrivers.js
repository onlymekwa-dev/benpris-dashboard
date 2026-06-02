import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, StatusBadge, StatCard, C, fmt, Spinner } from '../components/UI';

export default function AdminDrivers() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    supabase.from('v_driver_summary').select('*')
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  const filtered = rows.filter(r =>
    !search || r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.investor_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPaid    = rows.reduce((s, r) => s + (r.total_paid    || 0), 0);
  const totalCost    = rows.reduce((s, r) => s + (r.vehicle_cost  || 0), 0);
  const totalBalance = rows.reduce((s, r) => s + (r.balance       || 0), 0);

  const cols = [
    { key:'full_name',     label:'Driver'         },
    { key:'investor_name', label:'Investor'        },
    { key:'vehicle',       label:'Vehicle'         },
    { key:'registration',  label:'Reg. No.'        },
    { key:'vehicle_cost',  label:'Cost (GH₵)',     render: v => fmt(v) },
    { key:'weekly_amount', label:'Weekly (GH₵)',   render: v => fmt(v) },
    { key:'total_paid',    label:'Total Paid (GH₵)',render: v => fmt(v) },
    { key:'balance',       label:'Balance (GH₵)',  render: v => fmt(v) },
    { key:'pct_paid',      label:'% Paid',         render: v => `${Number(v||0).toFixed(2)}%` },
    { key:'status',        label:'Status',         render: v => <StatusBadge status={v} /> },
  ];

  return (
    <AppLayout>
      <PageHeader title="Driver Database" subtitle="All hire-purchase drivers and their payment progress" />

      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Total Drivers"      value={rows.length}             colour={C.teal} />
        <StatCard label="Total Vehicle Cost" value={`GH₵ ${fmt(totalCost)}`} colour={C.navy} />
        <StatCard label="Collected"          value={`GH₵ ${fmt(totalPaid)}`} colour={C.gold} />
        <StatCard label="Outstanding"        value={`GH₵ ${fmt(totalBalance)}`} colour={C.red} />
      </div>

      <div style={{ marginBottom:16 }}>
        <input
          placeholder="Search driver or investor…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding:'9px 14px', borderRadius:8, border:'1.5px solid #DDD', fontSize:14, width:280, outline:'none' }}
        />
      </div>

      {loading ? <Spinner /> : <Table columns={cols} rows={filtered} />}
    </AppLayout>
  );
}
