import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, C, fmt, Spinner } from '../components/UI';

// ── Upload History ─────────────────────────────────────────────────────────
export function AdminHistory() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    supabase.from('upload_history')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoad(false); });
  }, []);

  const cols = [
    { key:'uploaded_at', label:'Date / Time',  render: v => new Date(v).toLocaleString() },
    { key:'filename',    label:'File Name'      },
    {
      key:'row_counts', label:'Records Uploaded',
      render: v => v
        ? Object.entries(v).map(([k,n]) => `${k.replace(/_/g,' ')}: ${n}`).join(' · ')
        : '—'
    },
  ];

  return (
    <AppLayout>
      <PageHeader title="Upload History" subtitle="Audit log of every Excel workbook upload" />
      {loading ? <Spinner /> : <Table columns={cols} rows={rows} emptyMsg="No uploads yet" />}
    </AppLayout>
  );
}
