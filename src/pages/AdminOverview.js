import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, StatCard, C, fmt, Spinner } from '../components/UI';

const COLORS = [C.navy, C.teal, C.gold, '#8E44AD', '#E74C3C', '#27AE60', '#2980B9', '#F39C12', '#1ABC9C', '#E67E22'];

export default function AdminOverview() {
  const [summary,   setSummary]   = useState(null);
  const [driverData,setDriverData]= useState([]);
  const [invData,   setInvData]   = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: cf }, { data: drivers }, { data: investors }] = await Promise.all([
        supabase.from('v_cashflow_summary').select('*').single(),
        supabase.from('v_driver_summary').select('full_name,vehicle_cost,total_paid,balance,pct_paid,status'),
        supabase.from('v_investor_summary').select('full_name,capital_invested,amortized_value,total_paid_out,balance'),
      ]);
      setSummary(cf);
      setDriverData((drivers || []).filter(d => d.vehicle_cost > 0));
      setInvData(investors || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  const s = summary || {};

  const netProfit = (s.driver_collections || 0) - (s.total_investor_payouts || 0);
  const netColour = netProfit >= 0 ? C.green : C.red;

  return (
    <AppLayout>
      <PageHeader title="Executive Overview" subtitle="Live summary of all BenPris Auto Services activity" />

      {/* KPI row */}
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:28 }}>
        <StatCard label="Total Investors"        value={fmt(s.total_investors)}           colour={C.teal} />
        <StatCard label="Total Drivers"          value={fmt(s.total_drivers)}             colour={C.navy} />
        <StatCard label="Capital Invested"       value={`GH₵ ${fmt(s.total_capital)}`}   colour={C.gold} />
        <StatCard label="Driver Collections"     value={`GH₵ ${fmt(s.driver_collections)}`} colour={C.teal} />
        <StatCard label="Investor Payouts"       value={`GH₵ ${fmt(s.total_investor_payouts)}`} colour={C.navy} />
        <StatCard label="Net Profit / Loss"      value={`GH₵ ${fmt(netProfit)}`}         colour={netColour}
          sub={netProfit < 0 ? 'Cumulative shortfall' : 'Net surplus'} />
      </div>

      {/* Charts row 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
        {/* Driver Cost vs Paid */}
        <ChartCard title="Driver: Vehicle Cost vs Total Paid (GH₵)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={driverData} margin={{ top:0, right:10, left:10, bottom:60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="full_name" tick={{ fontSize:10 }} angle={-40} textAnchor="end" />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => `GH₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
              <Legend wrapperStyle={{ fontSize:12 }} />
              <Bar dataKey="vehicle_cost" name="Vehicle Cost" fill={C.navy} radius={[3,3,0,0]} />
              <Bar dataKey="total_paid"   name="Total Paid"   fill={C.teal} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Investor Capital Pie */}
        <ChartCard title="Investor Capital Share">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={invData} dataKey="capital_invested" nameKey="full_name"
                cx="50%" cy="50%" outerRadius={100}
                label={({ name, percent }) => `${name.split(' ')[0]} ${(percent*100).toFixed(0)}%`}
                labelLine={false} fontSize={11}
              >
                {invData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Investor: Capital vs Amortized vs Paid */}
        <ChartCard title="Investor Payout Progress (GH₵)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={invData} margin={{ top:0, right:10, left:10, bottom:60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="full_name" tick={{ fontSize:10 }} angle={-40} textAnchor="end" />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => `GH₵${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
              <Legend wrapperStyle={{ fontSize:12 }} />
              <Bar dataKey="capital_invested" name="Capital" fill={C.navy} radius={[3,3,0,0]} />
              <Bar dataKey="amortized_value"  name="Amortized" fill={C.gold} radius={[3,3,0,0]} />
              <Bar dataKey="total_paid_out"   name="Paid Out" fill={C.teal} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Driver payment % progress */}
        <ChartCard title="Driver Payment Progress (%)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              layout="vertical"
              data={[...driverData].sort((a,b) => b.pct_paid - a.pct_paid)}
              margin={{ top:0, right:20, left:80, bottom:0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
              <XAxis type="number" domain={[0,100]} tick={{ fontSize:11 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="full_name" tick={{ fontSize:10 }} width={78} />
              <Tooltip formatter={v => `${Number(v).toFixed(2)}%`} />
              <Bar dataKey="pct_paid" name="% Paid" radius={[0,4,4,0]}
                fill={C.teal}
                label={{ position:'right', fontSize:10, formatter: v => `${Number(v).toFixed(1)}%` }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </AppLayout>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{
      background: C.white, borderRadius:12,
      boxShadow:'0 2px 10px rgba(0,0,0,0.07)',
      padding:'20px 16px',
    }}>
      <h3 style={{ margin:'0 0 16px', fontSize:14, fontWeight:700, color: C.navy }}>{title}</h3>
      {children}
    </div>
  );
}
