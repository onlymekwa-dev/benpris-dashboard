import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, StatCard, C, fmt, Spinner } from '../components/UI';

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');

  useEffect(() => {
    supabase.from('driver_payments')
      .select('*')
      .order('payment_date', { ascending: false })
      .then(({ data }) => { setPayments(data || []); setLoading(false); });
  }, []);

  const filtered = payments.filter(p => {
    if (from && p.payment_date < from) return false;
    if (to   && p.payment_date > to)   return false;
    return true;
  });

  const total = filtered.reduce((s,r) => s + (r.amount || 0), 0);

  const cols = [
    { key:'driver_name',    label:'Driver'          },
    { key:'payment_date',   label:'Date'            },
    { key:'amount',         label:'Amount (GH₵)',   render: v => fmt(v) },
    { key:'payment_channel',label:'Channel'         },
    { key:'transaction_id', label:'Transaction ID'  },
  ];

  return (
    <AppLayout>
      <PageHeader title="Driver Payments Ledger" subtitle="All driver hire-purchase payments" />

      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Records"       value={fmt(filtered.length, 0)} colour={C.teal} />
        <StatCard label="Total Amount"  value={`GH₵ ${fmt(total)}`}    colour={C.navy} />
      </div>

      {/* Date filter */}
      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
        <label style={{ fontSize:13 }}>From:
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={dateStyle} />
        </label>
        <label style={{ fontSize:13 }}>To:
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={dateStyle} />
        </label>
        {(from||to) && (
          <button onClick={() => { setFrom(''); setTo(''); }} style={clearBtn}>
            Clear Filter
          </button>
        )}
      </div>

      {loading ? <Spinner /> : <Table columns={cols} rows={filtered} />}
    </AppLayout>
  );
}

const dateStyle = {
  marginLeft:8, padding:'7px 10px', borderRadius:7,
  border:'1.5px solid #DDD', fontSize:13, outline:'none',
};
const clearBtn = {
  padding:'7px 14px', borderRadius:7, border:'none',
  background: '#eee', cursor:'pointer', fontSize:13,
};
