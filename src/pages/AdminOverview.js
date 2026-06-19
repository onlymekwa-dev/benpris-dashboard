import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../lib/supabase';
import {
  AppLayout, PageHeader, StatCard, KpiRow, ChartCard,
  C, fmt, Spinner, useIsMobile,
} from '../components/UI';

const COLORS = [C.navy,C.teal,C.gold,'#8E44AD','#E74C3C','#27AE60','#2980B9','#F39C12','#1ABC9C','#E67E22'];

export default function AdminOverview() {
  const [summary,    setSummary]    = useState(null);
  const [driverData, setDriverData] = useState([]);
  const [invData,    setInvData]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    async function load() {
      const [{ data: cf, error: cfErr }, { data: drivers }, { data: investors }] = await Promise.all([
        supabase.from('v_cashflow_summary').select('*').single(),
        supabase.from('v_driver_summary').select(
          'full_name,vehicle_cost,total_paid,balance,pct_paid,status'
        ),
        supabase.from('v_investor_summary').select(
          'full_name,capital_invested,future_value,total_paid_out,balance,pct_paid,num_vehicles'
        ),
      ]);

      if (cfErr) console.error('Cashflow summary error:', cfErr.message);
      console.log('Cashflow:', cf);

      setSummary(cf);
      setDriverData((drivers || []).filter(d => Number(d.vehicle_cost) > 0));
      setInvData(investors || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <AppLayout><Spinner /></AppLayout>;

  const s = summary || {};

  const totalInvestors   = Number(s.total_investors    || 0);
  const totalDrivers     = Number(s.total_drivers      || 0);
  const totalCapital     = Number(s.total_capital      || 0);
  const driverCollect    = Number(s.driver_collections || 0);
  const investorPayouts  = Number(s.total_investor_payouts || 0);
  const netProfit        = driverCollect - investorPayouts;
  const netColour        = netProfit >= 0 ? C.green : C.red;

  // Chart data — ensure numeric types
  const driverChartData = driverData.map(d => ({
    name       : d.full_name?.split(' ')[0] || '?',
    vehicle_cost: Number(d.vehicle_cost || 0),
    total_paid  : Number(d.total_paid   || 0),
  }));

  const invChartData = invData.map(r => ({
    name            : r.full_name?.split(' ')[0] || '?',
    capital_invested: Number(r.capital_invested || 0),
    future_value    : Number(r.future_value     || 0),
    total_paid_out  : Number(r.total_paid_out   || 0),
    pct_paid        : Number(r.pct_paid         || 0),
  }));

  return (
    <AppLayout>
      <PageHeader title="Executive Overview" subtitle="Live summary of all BenPris activity" />

      <KpiRow>
        <StatCard label="Total Investors"    value={totalInvestors}                          colour={C.teal}    />
        <StatCard label="Total Drivers"      value={totalDrivers}                            colour={C.navy}    />
        <StatCard label="Capital Invested"   value={`GH₵ ${fmt(totalCapital)}`}             colour={C.gold}    />
        <StatCard label="Driver Collections" value={`GH₵ ${fmt(driverCollect)}`}            colour={C.teal}    />
        <StatCard label="Investor Payouts"   value={`GH₵ ${fmt(investorPayouts)}`}          colour={C.navy}    />
        <StatCard label="Net Profit / Loss"  value={`GH₵ ${fmt(netProfit)}`}                colour={netColour}
          sub={netProfit < 0 ? 'Cumulative shortfall' : 'Net surplus'} />
      </KpiRow>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:16, marginBottom:16 }}>

        <ChartCard title="Driver: Vehicle Cost vs Total Paid (GH₵)" height={isMobile ? 220 : 260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={driverChartData} margin={{ bottom: isMobile ? 40 : 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `GH₵${(v/1000).toFixed(0)}k`} width={50} />
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="vehicle_cost" name="Vehicle Cost" fill={C.navy} radius={[3,3,0,0]} />
              <Bar dataKey="total_paid"   name="Total Paid"   fill={C.teal} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Investor Capital Share" height={isMobile ? 220 : 260}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={invChartData}
                dataKey="capital_invested"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={isMobile ? 70 : 90}
                label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                labelLine={false}
                fontSize={isMobile ? 9 : 11}
              >
                {invChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:16 }}>

        <ChartCard title="Investor Payout Progress (GH₵)" height={isMobile ? 220 : 260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={invChartData} margin={{ bottom: isMobile ? 40 : 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `GH₵${(v/1000).toFixed(0)}k`} width={50} />
              <Tooltip formatter={v => `GH₵ ${fmt(v)}`} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="capital_invested" name="Capital"     fill={C.navy} radius={[3,3,0,0]} />
              <Bar dataKey="future_value"     name="Future Value" fill={C.gold} radius={[3,3,0,0]} />
              <Bar dataKey="total_paid_out"   name="Paid Out"    fill={C.teal} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Driver Payment Progress (%)" height={isMobile ? 280 : 260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={[...driverData]
                .map(d => ({
                  name    : d.full_name?.split(' ')[0] || '?',
                  pct_paid: Number(d.pct_paid || 0) * 100,
                }))
                .sort((a,b) => b.pct_paid - a.pct_paid)}
              margin={{ right:40, left: isMobile ? 60 : 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
              <XAxis type="number" domain={[0,100]} tick={{ fontSize:10 }} tickFormatter={v=>`${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: isMobile ? 9 : 10 }} width={isMobile ? 58 : 78} />
              <Tooltip formatter={v=>`${Number(v).toFixed(1)}%`} />
              <Bar dataKey="pct_paid" name="% Paid" fill={C.teal} radius={[0,4,4,0]}
                label={{ position:'right', fontSize:9, formatter: v => `${Number(v).toFixed(1)}%` }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>
    </AppLayout>
  );
}
