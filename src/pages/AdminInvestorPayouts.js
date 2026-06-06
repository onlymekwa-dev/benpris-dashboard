import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, StatCard, KpiRow, C, fmt, Spinner } from '../components/UI';

export default function AdminInvestorPayouts() {
  const [inflows,  setInflows]  = useState([]);
  const [payouts,  setPayouts]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('payouts');

  useEffect(() => {
    async function load() {
      const [{ data: inf }, { data: pay }] = await Promise.all([
        supabase.from('investor_inflows').select('*').order('investment_date', { ascending: false }),
        supabase.from('investor_payouts').select('*').order('payout_date',     { ascending: false }),
      ]);
      console.log('Inflows:', inf?.length, '| Payouts:', pay?.length);
      console.log('Sample inflow:', inf?.[0]);
      console.log('Sample payout:', pay?.[0]);
      setInflows(inf || []);
      setPayouts(pay || []);
      setLoading(false);
    }
    load();
  }, []);

  const totalInflows  = inflows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPayouts  = payouts.reduce((s, r) => s + Number(r.amount || 0), 0);
  // Get future_value totals from investors table directly
  const [totals, setTotals] = useState({ future_value: 0, balance: 0 });
  useEffect(() => {
    supabase.from('investors').select('future_value,balance').then(({ data }) => {
      if (data) setTotals({
        future_value: data.reduce((s,r) => s+Number(r.future_value||0), 0),
        balance:      data.reduce((s,r) => s+Number(r.balance||0), 0),
      });
    });
  }, []);

  const inflowCols = [
    { key:'investor_name',  label:'Investor'                                  },
    { key:'investment_date',label:'Date',           render: v => v || '—'    },
    { key:'amount',         label:'Amount (GH₵)',   render: v => fmt(v)      },
    { key:'payment_channel',label:'Channel'                                   },
    { key:'transaction_id', label:'Transaction ID'                            },
  ];
  const payoutCols = [
    { key:'investor_name',  label:'Investor'                                  },
    { key:'payout_date',    label:'Date',           render: v => v || '—'    },
    { key:'amount',         label:'Amount (GH₵)',   render: v => fmt(v)      },
    { key:'payment_channel',label:'Channel'                                   },
    { key:'transaction_id', label:'Transaction ID'                            },
  ];

  return (
    <AppLayout>
      <PageHeader title="Investor Transactions" subtitle="Capital inflows and weekly payouts" />

      <KpiRow>
        <StatCard label="Total Capital Invested" value={`GH₵ ${fmt(totalInflows)}`}        colour={C.navy} />
        <StatCard label="Total Future Value"     value={`GH₵ ${fmt(totals.future_value)}`} colour={C.gold} />
        <StatCard label="Total Paid Out"         value={`GH₵ ${fmt(totalPayouts)}`}        colour={C.teal} />
        <StatCard label="Outstanding Balance"    value={`GH₵ ${fmt(totals.balance)}`}      colour={C.red}  />
      </KpiRow>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`2px solid ${C.lgray}`, marginBottom:20 }}>
        {[
          { id:'payouts', label:`Weekly Payouts (${payouts.length})` },
          { id:'inflows', label:`Capital Inflows (${inflows.length})` },
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

      {loading ? <Spinner /> : (
        tab === 'payouts'
          ? <Table columns={payoutCols} rows={payouts} emptyMsg="No payout records. Upload Excel to populate." />
          : <Table columns={inflowCols} rows={inflows} emptyMsg="No inflow records. Upload Excel to populate." />
      )}
    </AppLayout>
  );
}
