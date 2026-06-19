import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AppLayout, PageHeader, Table, StatCard, C, Spinner } from '../components/UI';

// ── helpers ──────────────────────────────────────────────────────────────────
function randomPassword(len = 12) {
  const chars = 'ABCDEFGHJKL8SjFSqSJ6DYAcBJrNGN76hEhcij5vtyJK5G819CvV7Fm!@#$';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function roleBadge(role) {
  const map = {
    admin   : { bg:'#D6E0F0', c: C.navy  },
    investor: { bg:'#FEF5E7', c: C.gold  },
    driver  : { bg: C.lteal,  c: C.teal  },
  };
  const s = map[role] || { bg: '#EEE', c: '#555' };
  return (
    <span style={{
      background: s.bg, color: s.c,
      borderRadius: 10, padding: '2px 10px',
      fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
    }}>
      {role}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const [profiles,   setProfiles]   = useState([]);
  const [unlinked,   setUnlinked]   = useState({ drivers: [], investors: [] });
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('existing');   // 'existing' | 'invite' | 'unlinked'

  // invite form state
  const [form,       setForm]       = useState({ full_name:'', email:'', role:'driver', send_email: true });
  const [inviting,   setInviting]   = useState(false);
  const [inviteMsg,  setInviteMsg]  = useState('');
  const [inviteErr,  setInviteErr]  = useState('');
  const [generated,  setGenerated]  = useState(null);   // { email, password }

  // bulk provision state
  const [provisioning, setProvisioning] = useState(false);
  const [bulkLog,      setBulkLog]      = useState([]);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: profs }, { data: drivers }, { data: investors }] = await Promise.all([
      supabase.from('profiles').select('*').order('role').order('full_name'),
      supabase.from('drivers').select('id, full_name, contact, email').is('profile_id', null),
      supabase.from('investors').select('id, full_name, contact, email').is('profile_id', null),
    ]);
    setProfiles(profs || []);
    setUnlinked({ drivers: drivers || [], investors: investors || [] });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Invite a single user ────────────────────────────────────────────────────
  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true); setInviteMsg(''); setInviteErr(''); setGenerated(null);

    const password = randomPassword();
    try {
      // Use Supabase Admin API via edge function (see invite_user edge function)
      // Fallback: use signUp with auto-confirm disabled so admin shares credentials
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          full_name : form.full_name.trim(),
          email     : form.email.trim().toLowerCase(),
          role      : form.role,
          password,
          send_email: form.send_email,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGenerated({ email: form.email.trim().toLowerCase(), password, name: form.full_name });
      setInviteMsg(`✅ Account created for ${form.full_name}. Share credentials below.`);
      setForm({ full_name:'', email:'', role:'driver', send_email: true });
      await loadData();
    } catch (err) {
      // If edge function not deployed yet, fall back to direct insert approach
      setInviteErr(`Edge function not reachable. Deploy the invite-user function, or use Supabase Dashboard → Auth → Users. Error: ${err.message}`);
    } finally {
      setInviting(false);
    }
  }

  // ── Bulk provision all unlinked drivers + investors ─────────────────────────
  async function handleBulkProvision() {
    setProvisioning(true);
    setBulkLog([]);
    const all = [
      ...unlinked.drivers.map(d => ({ ...d, role: 'driver' })),
      ...unlinked.investors.map(i => ({ ...i, role: 'investor' })),
    ];

    const log = [];
    for (const person of all) {
      const email = person.email?.trim()
        || `${person.full_name.toLowerCase().replace(/\s+/g,'.')}@benpris.com`;
      const password = randomPassword();

      try {
        const { data, error } = await supabase.functions.invoke('invite-user', {
          body: { full_name: person.full_name, email, role: person.role, password, send_email: false },
        });
        if (error || data?.error) throw new Error(error?.message || data?.error);
        log.push({ name: person.full_name, email, password, role: person.role, ok: true });
      } catch (err) {
        log.push({ name: person.full_name, email, password, role: person.role, ok: false, err: err.message });
      }
    }

    setBulkLog(log);
    setProvisioning(false);
    await loadData();
  }

  // ── Deactivate user ──────────────────────────────────────────────────────────
  async function deactivate(profileId) {
    if (!window.confirm('Remove this user\'s login access?')) return;
    await supabase.functions.invoke('deactivate-user', { body: { profile_id: profileId } });
    await loadData();
  }

  // ── Reset password ───────────────────────────────────────────────────────────
  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) alert('Error: ' + error.message);
    else alert(`Password reset email sent to ${email}`);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const unlinkedCount = unlinked.drivers.length + unlinked.investors.length;

  return (
    <AppLayout>
      <PageHeader
        title="Manage Users"
        subtitle="Create accounts, invite drivers & investors, manage access"
      />

      {/* Stats */}
      <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:24 }}>
        <StatCard label="Total Users"     value={profiles.length}    colour={C.navy} />
        <StatCard label="Admins"          value={profiles.filter(p=>p.role==='admin').length}    colour={C.navy} />
        <StatCard label="Investors"       value={profiles.filter(p=>p.role==='investor').length} colour={C.gold} />
        <StatCard label="Drivers"         value={profiles.filter(p=>p.role==='driver').length}   colour={C.teal} />
        <StatCard
          label="Awaiting Account"
          value={unlinkedCount}
          colour={unlinkedCount > 0 ? C.red : C.green}
          sub={unlinkedCount > 0 ? 'No login yet' : 'All linked ✓'}
        />
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:`2px solid ${C.lgray}` }}>
        {[
          { id:'existing', label:'All Users' },
          { id:'invite',   label:'Invite / Add User' },
          { id:'unlinked', label: `Unlinked Records${unlinkedCount > 0 ? ` (${unlinkedCount})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'10px 22px', border:'none', background:'transparent',
            fontWeight: tab===t.id ? 800 : 400,
            color: tab===t.id ? C.navy : '#888',
            borderBottom: tab===t.id ? `3px solid ${C.navy}` : '3px solid transparent',
            cursor:'pointer', fontSize:14,
            transition:'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: All Users ──────────────────────────────────────────────────── */}
      {tab === 'existing' && (
        loading ? <Spinner /> : (
          <Table
            columns={[
              { key:'full_name', label:'Name' },
              { key:'email',     label:'Email' },
              { key:'role',      label:'Role',  render: v => roleBadge(v) },
              { key:'created_at',label:'Added', render: v => v ? new Date(v).toLocaleDateString('en-GH') : '—' },
              { key:'_actions',  label:'Actions', render: (_, row) => (
                <div style={{ display:'flex', gap:8 }}>
                  <ActionBtn
                    label="Reset PW"
                    colour={C.teal}
                    onClick={() => resetPassword(row.email)}
                  />
                  {row.role !== 'admin' && (
                    <ActionBtn
                      label="Remove"
                      colour={C.red}
                      onClick={() => deactivate(row.id)}
                    />
                  )}
                </div>
              )},
            ]}
            rows={profiles}
          />
        )
      )}

      {/* ── Tab: Invite User ────────────────────────────────────────────────── */}
      {tab === 'invite' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{
            background: C.white, borderRadius:12,
            boxShadow:'0 2px 10px rgba(0,0,0,0.07)',
            padding:'28px 32px',
          }}>
            <h3 style={{ margin:'0 0 6px', color:C.navy }}>Add a New User</h3>
            <p style={{ margin:'0 0 22px', color:'#888', fontSize:13 }}>
              A login account will be created and you can share the credentials directly, or send a setup email.
            </p>

            <form onSubmit={handleInvite}>
              <Field label="Full Name (must match driver/investor record)"
                value={form.full_name} onChange={v => setForm(f=>({...f,full_name:v}))} required />
              <Field label="Email Address" type="email"
                value={form.email} onChange={v => setForm(f=>({...f,email:v}))} required />

              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Role</label>
                <div style={{ display:'flex', gap:10, marginTop:6 }}>
                  {['driver','investor','admin'].map(r => (
                    <label key={r} style={{
                      display:'flex', alignItems:'center', gap:6,
                      padding:'8px 16px', borderRadius:8, cursor:'pointer',
                      border: `2px solid ${form.role===r ? C.navy : '#DDD'}`,
                      background: form.role===r ? C.navy+'11' : C.white,
                      fontWeight: form.role===r ? 700 : 400,
                      fontSize:13, color: form.role===r ? C.navy : '#555',
                      transition:'all 0.15s',
                    }}>
                      <input type="radio" name="role" value={r}
                        checked={form.role===r}
                        onChange={() => setForm(f=>({...f,role:r}))}
                        style={{ display:'none' }}
                      />
                      {r.charAt(0).toUpperCase()+r.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <label style={{
                display:'flex', alignItems:'center', gap:8,
                marginBottom:20, fontSize:13, cursor:'pointer', color: C.dgray,
              }}>
                <input type="checkbox" checked={form.send_email}
                  onChange={e => setForm(f=>({...f,send_email:e.target.checked}))} />
                Send setup email to the user
              </label>

              {inviteMsg && <Alert colour={C.green} bg="#D5F5E3">{inviteMsg}</Alert>}
              {inviteErr && <Alert colour={C.red}   bg="#FADBD8">{inviteErr}</Alert>}

              <button type="submit" disabled={inviting} style={primaryBtn(inviting)}>
                {inviting ? 'Creating Account…' : '+ Create Account'}
              </button>
            </form>

            {/* Generated credentials card */}
            {generated && (
              <div style={{
                marginTop:24, background:'#F8F9FA', borderRadius:10,
                border:`1.5px solid ${C.teal}`, padding:'16px 20px',
              }}>
                <div style={{ fontWeight:700, color:C.navy, marginBottom:10, fontSize:14 }}>
                  🔑 Credentials for {generated.name}
                </div>
                <CredRow label="Email"    value={generated.email}    />
                <CredRow label="Password" value={generated.password} mono />
                <p style={{ fontSize:12, color:'#888', margin:'10px 0 0' }}>
                  Share these securely. The user should change their password on first login.
                </p>
              </div>
            )}
          </div>

          {/* Edge function setup note */}
          <div style={{
            marginTop:16, background:'#FEF9E7',
            border:'1px solid #F39C12', borderRadius:10, padding:'14px 18px', fontSize:13,
          }}>
            <strong style={{ color: C.amber }}>ℹ️ Requires Edge Function:</strong> This form calls the
            <code style={{ background:'#eee', padding:'1px 5px', borderRadius:4, margin:'0 4px' }}>invite-user</code>
            Supabase Edge Function included in <code>supabase/functions/</code>.
            Deploy it once with <code>supabase functions deploy invite-user</code>.
            See README for setup.
          </div>
        </div>
      )}

      {/* ── Tab: Unlinked Records ─────────────────────────────────────────── */}
      {tab === 'unlinked' && (
        <div>
          {unlinkedCount === 0 ? (
            <div style={{
              background:C.white, borderRadius:12, padding:40,
              textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div style={{ fontWeight:700, color:C.green, fontSize:16 }}>All records are linked to accounts</div>
              <div style={{ color:'#888', fontSize:13, marginTop:6 }}>Every driver and investor has a login.</div>
            </div>
          ) : (
            <>
              <div style={{
                background:'#FEF9E7', border:'1px solid #F39C12',
                borderRadius:10, padding:'14px 18px', marginBottom:20, fontSize:13,
              }}>
                <strong style={{ color: C.amber }}>⚠️ {unlinkedCount} record{unlinkedCount>1?'s':''} have no login account.</strong>
                {' '}These drivers/investors exist in the database (from your Excel upload) but can't log in yet.
                Use <strong>Bulk Provision</strong> to create all accounts at once with auto-generated passwords,
                or invite them one by one on the Invite tab.
              </div>

              {/* Bulk provision button */}
              <button
                onClick={handleBulkProvision}
                disabled={provisioning}
                style={{ ...primaryBtn(provisioning), marginBottom:20 }}
              >
                {provisioning ? 'Creating accounts…' : `⚡ Bulk Provision All ${unlinkedCount} Accounts`}
              </button>

              {/* Bulk log */}
              {bulkLog.length > 0 && (
                <div style={{
                  background: C.white, borderRadius:12,
                  boxShadow:'0 2px 8px rgba(0,0,0,0.07)',
                  padding:'20px 24px', marginBottom:20,
                }}>
                  <h3 style={{ margin:'0 0 14px', color:C.navy, fontSize:15 }}>
                    Provisioning Results
                  </h3>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                      <thead>
                        <tr style={{ background: C.navy }}>
                          {['Name','Role','Email','Temp Password','Status'].map(h => (
                            <th key={h} style={{
                              padding:'9px 14px', textAlign:'left',
                              color:C.white, fontSize:12, fontWeight:700,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkLog.map((row, i) => (
                          <tr key={i} style={{ background: i%2===0 ? C.white : C.lgray }}>
                            <td style={tdStyle}>{row.name}</td>
                            <td style={tdStyle}>{roleBadge(row.role)}</td>
                            <td style={tdStyle}>{row.email}</td>
                            <td style={{ ...tdStyle, fontFamily:'monospace', letterSpacing:1 }}>
                              {row.ok ? row.password : '—'}
                            </td>
                            <td style={tdStyle}>
                              {row.ok
                                ? <span style={{ color:C.green, fontWeight:700 }}>✓ Created</span>
                                : <span style={{ color:C.red,   fontWeight:700 }} title={row.err}>✗ Failed</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize:12, color:'#888', marginTop:10 }}>
                    📋 Copy this table and share credentials securely with each person.
                  </p>
                </div>
              )}

              {/* Unlinked tables */}
              {[
                { label:'Drivers without accounts',   rows: unlinked.drivers,   role:'driver'   },
                { label:'Investors without accounts', rows: unlinked.investors, role:'investor' },
              ].map(({ label, rows, role }) => rows.length > 0 && (
                <div key={role} style={{ marginBottom:20 }}>
                  <h3 style={{ color:C.navy, marginBottom:10, fontSize:14 }}>{label} ({rows.length})</h3>
                  <Table
                    columns={[
                      { key:'full_name', label:'Name'    },
                      { key:'contact',   label:'Contact' },
                      { key:'email',     label:'Email'   },
                      { key:'_role',     label:'Role',   render: () => roleBadge(role) },
                    ]}
                    rows={rows}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
}

// ── Small reusable pieces ─────────────────────────────────────────────────────
function Field({ label, value, onChange, type='text', required }) {
  return (
    <label style={{ display:'block', marginBottom:16 }}>
      <span style={labelStyle}>{label}</span>
      <input
        type={type} value={value} required={required}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function Alert({ colour, bg, children }) {
  return (
    <div style={{
      background: bg, border:`1px solid ${colour}`,
      borderRadius:8, padding:'10px 14px',
      color: colour, fontSize:13, marginBottom:14,
    }}>
      {children}
    </div>
  );
}

function CredRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
      <span style={{ fontSize:12, color:'#888', width:60 }}>{label}:</span>
      <code style={{
        flex:1, background:'#eee', padding:'5px 10px',
        borderRadius:6, fontSize:13,
        fontFamily: mono ? 'monospace' : 'inherit',
        letterSpacing: mono ? 1 : 'normal',
      }}>{value}</code>
      <button onClick={copy} style={{
        padding:'4px 10px', borderRadius:6,
        border:`1px solid ${copied ? '#27AE60' : '#CCC'}`,
        background: copied ? '#D5F5E3' : C.white,
        color: copied ? C.green : '#555',
        fontSize:12, cursor:'pointer',
      }}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

function ActionBtn({ label, colour, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'4px 12px', borderRadius:6,
      border:`1px solid ${colour}22`,
      background:`${colour}11`, color: colour,
      fontSize:12, fontWeight:600, cursor:'pointer',
    }}>
      {label}
    </button>
  );
}

const labelStyle = {
  display:'block', fontSize:12, fontWeight:700,
  color:'#333', textTransform:'uppercase',
  letterSpacing:0.5, marginBottom:5,
};
const inputStyle = {
  display:'block', width:'100%', padding:'10px 13px',
  borderRadius:8, border:'1.5px solid #DDD',
  fontSize:14, outline:'none', boxSizing:'border-box',
  fontFamily:'Arial,sans-serif',
};
const tdStyle = {
  padding:'10px 14px', borderBottom:'1px solid #F0F0F0',
};
const primaryBtn = (disabled) => ({
  padding:'11px 28px', borderRadius:9, border:'none',
  background: disabled ? '#BDC3C7' : C.navy,
  color: C.white, fontWeight:700, fontSize:14,
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition:'background 0.2s',
});
