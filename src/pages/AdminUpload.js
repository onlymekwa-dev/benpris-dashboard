import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadWorkbook, getUnlinkedRecords } from '../lib/upload';
import { AppLayout, PageHeader, C, Spinner } from '../components/UI';

export default function AdminUpload() {
  const [file,       setFile]       = useState(null);
  const [status,     setStatus]     = useState('');
  const [result,     setResult]     = useState(null);
  const [unlinked,   setUnlinked]   = useState(null);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [dragging,   setDragging]   = useState(false);
  const inputRef = useRef();
  const navigate = useNavigate();

  function handleFile(f) {
    if (!f) return;
    if (!f.name.endsWith('.xlsx')) { setError('Only .xlsx files are accepted.'); return; }
    setFile(f); setError(''); setResult(null); setStatus(''); setUnlinked(null);
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true); setError(''); setResult(null); setUnlinked(null);
    try {
      const counts = await uploadWorkbook(file, msg => setStatus(msg));
      setResult(counts);

      // Check for new records that don't have accounts yet
      const ul = await getUnlinkedRecords();
      if (ul.total > 0) setUnlinked(ul);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Upload failed. Check console for details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Upload Excel Workbook"
        subtitle="Sync the BenPris Excel workbook into Supabase" />

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2.5px dashed ${dragging ? C.teal : '#CCC'}`,
          borderRadius: 14, padding: '48px 24px',
          textAlign: 'center', cursor: 'pointer',
          background: dragging ? C.lteal : C.white,
          transition: 'all 0.2s', marginBottom: 24,
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        }}
      >
        <input ref={inputRef} type="file" accept=".xlsx" style={{ display:'none' }}
          onChange={e => handleFile(e.target.files[0])} />
        <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginBottom: 6 }}>
          {file ? file.name : 'Drop your Excel file here, or click to browse'}
        </div>
        <div style={{ fontSize: 13, color: '#999' }}>
          {file
            ? `${(file.size / 1024).toFixed(1)} KB · Click to change`
            : 'BenPris_Dashboard_Enhanced.xlsx'}
        </div>
      </div>

      {/* What this does */}
      <div style={{
        background:'#F0F8FF', border:'1px solid #AED6F1',
        borderRadius:10, padding:'14px 18px', marginBottom:16, fontSize:13,
        lineHeight: 1.6,
      }}>
        <strong style={{ color:'#2980B9' }}>ℹ️ What happens when you upload:</strong>
        <ul style={{ margin:'8px 0 0', paddingLeft:20 }}>
          <li>Existing payments are <strong>archived</strong> (never lost), then replaced with the new data</li>
          <li>Driver and investor master records are <strong>updated in-place</strong> — nothing deleted</li>
          <li><strong>New drivers or investors</strong> in the file are added automatically</li>
          <li>You'll be prompted to create login accounts for any new people</li>
        </ul>
      </div>

      <div style={{
        background:'#FEF9E7', border:'1px solid #F39C12',
        borderRadius:10, padding:'14px 18px', marginBottom:20, fontSize:13,
      }}>
        <strong style={{ color: C.amber }}>⚠️ Transaction data is wiped and replaced on every upload.</strong>
        {' '}Archived copies are kept permanently and accessible via SQL.
      </div>

      {error && (
        <div style={{
          background:'#FADBD8', border:'1px solid #E74C3C',
          borderRadius:10, padding:'14px 18px', color: C.red, fontSize:14, marginBottom:16,
        }}>
          ❌ {error}
        </div>
      )}

      {loading && (
        <div style={{ marginBottom:16 }}>
          <Spinner />
          <p style={{ textAlign:'center', color: C.teal, fontWeight:600, fontSize:14 }}>{status}</p>
        </div>
      )}

      {/* Success summary */}
      {result && (
        <div style={{
          background:'#D5F5E3', border:'1px solid #27AE60',
          borderRadius:10, padding:'18px 24px', marginBottom:20,
        }}>
          <div style={{ fontWeight:800, color: C.green, fontSize:16, marginBottom:10 }}>
            ✅ Upload Successful
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
            {Object.entries(result).map(([k,v]) => (
              <div key={k} style={{ background: C.white, borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:0.5 }}>
                  {k.replace(/_/g,' ')}
                </div>
                <div style={{ fontSize:22, fontWeight:800, color: C.navy }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── New people detected → prompt to create accounts ───────────────── */}
      {unlinked && unlinked.total > 0 && (
        <div style={{
          background: C.white, border:`2px solid ${C.gold}`,
          borderRadius:12, padding:'20px 24px', marginBottom:20,
          boxShadow:'0 4px 16px rgba(245,166,35,0.15)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
            <span style={{ fontSize:28 }}>👥</span>
            <div>
              <div style={{ fontWeight:800, color:C.navy, fontSize:16 }}>
                {unlinked.total} new {unlinked.total===1?'person':'people'} need{unlinked.total===1?'s':''} a login account
              </div>
              <div style={{ color:'#888', fontSize:13 }}>
                The following were added from your upload but have no dashboard access yet.
              </div>
            </div>
          </div>

          {/* List them */}
          {[
            { label:'Drivers',   rows: unlinked.drivers   },
            { label:'Investors', rows: unlinked.investors },
          ].map(({ label, rows }) => rows.length > 0 && (
            <div key={label} style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.dgray, marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>
                {label} ({rows.length})
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {rows.map(r => (
                  <span key={r.id} style={{
                    background: C.lteal, color:C.teal,
                    borderRadius:8, padding:'4px 12px',
                    fontSize:13, fontWeight:600,
                  }}>
                    {r.full_name}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div style={{ display:'flex', gap:12, marginTop:16, flexWrap:'wrap' }}>
            <button
              onClick={() => navigate('/admin/users?tab=unlinked')}
              style={{
                padding:'10px 22px', borderRadius:9, border:'none',
                background: C.navy, color:C.white,
                fontWeight:700, fontSize:14, cursor:'pointer',
              }}
            >
              ⚡ Create Accounts Now
            </button>
            <button
              onClick={() => setUnlinked(null)}
              style={{
                padding:'10px 22px', borderRadius:9,
                border:'1px solid #DDD', background:C.white,
                fontWeight:600, fontSize:14, cursor:'pointer', color:'#555',
              }}
            >
              Do it later
            </button>
          </div>
        </div>
      )}

      {!unlinked && result && (
        <div style={{ color:C.green, fontWeight:600, fontSize:14, marginBottom:20 }}>
          ✓ All drivers and investors already have login accounts.
        </div>
      )}

      <button
        disabled={!file || loading}
        onClick={handleUpload}
        style={{
          padding:'13px 36px', borderRadius:10, border:'none',
          background: (!file || loading) ? '#BDC3C7' : C.navy,
          color: C.white, fontWeight:700, fontSize:15,
          cursor: (!file || loading) ? 'not-allowed' : 'pointer',
          transition:'background 0.2s',
        }}
      >
        {loading ? 'Uploading…' : '🚀 Upload to Supabase'}
      </button>
    </AppLayout>
  );
}
