import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, StatCard, KpiRow, DateFilter, C, fmt, Spinner } from '../components/UI';

export default function AdminInvestorPayouts() {
  const [inflows,  setInflows]  = useState([]);
  const [payouts,  setPayouts]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('payouts');
  const [totals,   setTotals]   = useState({ future_value: 0, balance: 0 });

  // Date filters — one set per tab, independent of each other
  const [ifFrom, setIfFrom] = useState('');
  const [ifTo,   setIfTo]   = useState('');
  const [poFrom, setPoFrom] = useState('');
  const [poTo,   setPoTo]   = useState('');

  useEffect(() => {
    async function load() {
      const [{ data: inf }, { data: pay }] = await Promise.all([
        supabase.from('investor_inflows').select('*').order('investment_date', { ascending: false }),
        supabase.from('investor_payouts').select('*').order('payout_date',     { ascending: false }),
      ]);
      setInflows(inf || []);
      setPayouts(pay || []);
      setLoading(false);
    }
    load();
  }, []);

  // Get future_value totals from investors table directly
  useEffect(() => {
    supabase.from('investors').select('future_value,balance').then(({ data }) => {
      if (data) setTotals({
        future_value: data.reduce((s,r) => s+Number(r.future_value||0), 0),
        balance:      data.reduce((s,r) => s+Number(r.balance||0), 0),
      });
    });
  }, []);

  // Apply date range filter to a list of rows
  function applyDateFilter(rows, dateKey, from, to) {
    return rows.filter(r => {
      const d = r[dateKey];
      if (!d) return true;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  const filteredInflows = applyDateFilter(inflows, 'investment_date', ifFrom, ifTo);
  const filteredPayouts = applyDateFilter(payouts, 'payout_date',     poFrom, poTo);

  const totalInflows = filteredInflows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPayouts = filteredPayouts.reduce((s, r) => s + Number(r.amount || 0), 0);

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
      <div style={{ display:'flex', borderBottom:`2px solid ${C.lgray}`, marginBottom:16 }}>
        {[
          { id:'payouts', label:`Weekly Payouts (${filteredPayouts.length})` },
          { id:'inflows', label:`Capital Inflows (${filteredInflows.length})` },
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

      {/* Date filter — updates per tab */}
      {tab === 'payouts' ? (
        <DateFilter
          from={poFrom} to={poTo}
          onFrom={setPoFrom} onTo={setPoTo}
          onClear={() => { setPoFrom(''); setPoTo(''); }}
          total={payouts.length} filtered={filteredPayouts.length}
        />
      ) : (
        <DateFilter
          from={ifFrom} to={ifTo}
          onFrom={setIfFrom} onTo={setIfTo}
          onClear={() => { setIfFrom(''); setIfTo(''); }}
          total={inflows.length} filtered={filteredInflows.length}
        />
      )}

      {loading ? <Spinner /> : (
        tab === 'payouts'
          ? <Table columns={payoutCols} rows={filteredPayouts} emptyMsg="No payout records. Upload Excel to populate." />
          : <Table columns={inflowCols} rows={filteredInflows} emptyMsg="No inflow records. Upload Excel to populate." />
      )}
    </AppLayout>
  );
}
