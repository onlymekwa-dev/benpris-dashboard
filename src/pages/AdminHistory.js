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

// ── Manage Users ──────────────────────────────────────────────────────────
export function AdminUsers() {
  const [profiles,  setProfiles]  = useState([]);
  const [loading,   setLoad]      = useState(true);
  const [form,      setForm]      = useState({ full_name:'', email:'', password:'', role:'driver' });
  const [msg,       setMsg]       = useState('');
  const [err,       setErr]       = useState('');
  const [creating,  setCreating]  = useState(false);

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('role');
    setProfiles(data || []);
    setLoad(false);
  }
  useEffect(() => { loadProfiles(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setCreating(true);
    try {
      // Create auth user via supabase admin (service role needed on backend; here using signUp workaround)
      const { data, error } = await supabase.auth.admin.createUser({
        email: form.email,
        password: form.password,
        email_confirm: true,
        user_metadata: { full_name: form.full_name, role: form.role },
      });
      if (error) throw error;

      // Insert profile
      await supabase.from('profiles').insert({
        id        : data.user.id,
        full_name : form.full_name,
        email     : form.email,
        role      : form.role,
      });

      setMsg(`✅ User "${form.full_name}" created successfully.`);
      setForm({ full_name:'', email:'', password:'', role:'driver' });
      loadProfiles();
    } catch (e) {
      setErr(e.message);
    } finally {
      setCreating(false);
    }
  }

  const roleBadge = role => {
    const map = { admin:{ bg:'#D6E0F0',c:C.navy }, investor:{ bg:'#FEF5E7',c:C.gold }, driver:{ bg:C.lteal,c:C.teal } };
    const s = map[role] || {};
    return <span style={{ background:s.bg,color:s.c,borderRadius:10,padding:'2px 10px',fontSize:12,fontWeight:700 }}>{role}</span>;
  };

  const cols = [
    { key:'full_name', label:'Name'  },
    { key:'email',     label:'Email' },
    { key:'role',      label:'Role', render: v => roleBadge(v) },
    { key:'created_at',label:'Added', render: v => v ? new Date(v).toLocaleDateString() : '—' },
  ];

  return (
    <AppLayout>
      <PageHeader title="Manage Users" subtitle="Create and view system accounts" />

      {/* Create form */}
      <div style={{
        background:C.white, borderRadius:12,
        boxShadow:'0 2px 10px rgba(0,0,0,0.07)',
        padding:'24px 28px', marginBottom:28,
      }}>
        <h3 style={{ margin:'0 0 18px', color:C.navy, fontSize:15 }}>Add New User</h3>
        <form onSubmit={createUser} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 20px' }}>
          <Field label="Full Name"   value={form.full_name} onChange={v => setForm(f=>({...f,full_name:v}))} required />
          <Field label="Email"       value={form.email}     onChange={v => setForm(f=>({...f,email:v}))}     type="email" required />
          <Field label="Password"    value={form.password}  onChange={v => setForm(f=>({...f,password:v}))}  type="password" required />
          <div>
            <label style={{ fontSize:12,fontWeight:700,color:C.navy,textTransform:'uppercase',letterSpacing:0.5 }}>Role</label>
            <select value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))} style={{ ...fieldStyle, display:'block', width:'100%', marginTop:5 }}>
              <option value="driver">Driver</option>
              <option value="investor">Investor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            {msg && <div style={{ color:C.green,fontWeight:600,marginBottom:8 }}>{msg}</div>}
            {err && <div style={{ color:C.red,fontWeight:600,marginBottom:8 }}>❌ {err}</div>}
            <button disabled={creating} type="submit" style={{
              padding:'10px 28px', background: C.navy, color:C.white,
              border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor:'pointer',
            }}>
              {creating ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* Users table */}
      <h3 style={{ color:C.navy, marginBottom:12 }}>All Users ({profiles.length})</h3>
      {loading ? <Spinner /> : <Table columns={cols} rows={profiles} />}
    </AppLayout>
  );
}

function Field({ label, value, onChange, type='text', required }) {
  return (
    <label>
      <span style={{ fontSize:12,fontWeight:700,color:C.navy,textTransform:'uppercase',letterSpacing:0.5 }}>{label}</span>
      <input
        type={type} value={value} required={required}
        onChange={e => onChange(e.target.value)}
        style={{ ...fieldStyle, display:'block', width:'100%', marginTop:5 }}
      />
    </label>
  );
}

const fieldStyle = {
  padding:'9px 12px', borderRadius:7,
  border:'1.5px solid #DDD', fontSize:14, outline:'none',
  fontFamily:'Arial,sans-serif', boxSizing:'border-box',
};
