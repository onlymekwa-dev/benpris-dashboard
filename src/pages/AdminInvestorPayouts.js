import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, StatCard, C, fmt, Spinner } from '../components/UI';

export default function AdminInvestorPayouts() {
  const [inflows,  setInflows]  = useState([]);
  const [payouts,  setPayouts]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('inflows');

  useEffect(() => {
    async function load() {
      const [{ data: inf }, { data: pay }] = await Promise.all([
        supabase.from('investor_inflows')
          .select('*').order('investment_date', { ascending: false }),
        supabase.from('investor_payouts')
          .select('*').order('payout_date', { ascending: false }),
      ]);
      setInflows(inf || []);
      setPayouts(pay || []);
      setLoading(false);
    }
    load();
  }, []);

  const totalInflows  = inflows.reduce((s, r) => s + (r.amount || 0), 0);
  const totalPayouts  = payouts.reduce((s, r) => s + (r.amount || 0), 0);
  const totalFutureValue = totalInflows * 1.2;
  const balance       = totalFutureValue - totalPayouts;

  const inflowCols = [
    { key:'investor_name',  label:'Investor'           },
    { key:'investment_date',label:'Date', render: v => v || '—' },
    { key:'amount',         label:'Amount (GH₵)',  render: v => fmt(v) },
    { key:'payment_channel',label:'Channel'            },
    { key:'transaction_id', label:'Transaction ID'     },
  ];

  const payoutCols = [
    { key:'investor_name',  label:'Investor'           },
    { key:'payout_date',    label:'Date', render: v => v || '—' },
    { key:'amount',         label:'Amount (GH₵)',  render: v => fmt(v) },
    { key:'payment_channel',label:'Channel'            },
    { key:'transaction_id', label:'Transaction ID'     },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Investor Transactions"
        subtitle="Capital inflows and weekly payouts to investors"
      />

      {/* KPI cards */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Total Capital Invested"  value={`GH₵ ${fmt(totalInflows)}`}   colour={C.navy} />
        <StatCard label="Total Future Value (120%)"  value={`GH₵ ${fmt(totalFutureValue)}`} colour={C.gold} />
        <StatCard label="Total Paid Out"          value={`GH₵ ${fmt(totalPayouts)}`}   colour={C.teal} />
        <StatCard label="Outstanding Balance"     value={`GH₵ ${fmt(balance)}`}        colour={C.red}  />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`2px solid ${C.lgray}`, marginBottom:20 }}>
        {[
          { id:'inflows', label:`Capital Inflows (${inflows.length})` },
          { id:'payouts', label:`Investor Payouts (${payouts.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'10px 22px', border:'none', background:'transparent',
            fontWeight: tab===t.id ? 800 : 400,
            color: tab===t.id ? C.navy : '#888',
            borderBottom: tab===t.id ? `3px solid ${C.navy}` : '3px solid transparent',
            cursor:'pointer', fontSize:14, transition:'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        tab === 'inflows'
          ? <Table columns={inflowCols} rows={inflows} emptyMsg="No inflow records. Upload Excel to populate." />
          : <Table columns={payoutCols} rows={payouts} emptyMsg="No payout records. Upload Excel to populate." />
      )}
    </AppLayout>
  );
}
