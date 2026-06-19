import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { C } from '../components/UI';

// Handles the link from a "forgot password" email.
// Supabase redirects here with a recovery token in the URL hash;
// supabase-js automatically picks it up and creates a temporary session.
export default function ResetPassword() {
  const [ready,    setReady]    = useState(false);
  const [password, setPassword] = useState('');
  const [confirm,   setConfirm]  = useState('');
  const [error,     setError]    = useState('');
  const [done,      setDone]     = useState(false);
  const [saving,    setSaving]   = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    // Also check if a session already exists (token already processed on load)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setSaving(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updErr) { setError(updErr.message); return; }
    setDone(true);
    setTimeout(() => navigate('/login'), 2500);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.lgray, fontFamily: 'Arial, sans-serif', padding: 16,
    }}>
      <div style={{
        background: C.white, borderRadius: 14, padding: '36px 32px',
        maxWidth: 380, width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: C.navy, marginBottom: 4 }}>
          BenPris Auto
        </div>
        <h2 style={{ margin: '12px 0 18px', fontSize: 18, color: C.navy }}>
          Set a New Password
        </h2>

        {!ready && !done && (
          <p style={{ color: '#888', fontSize: 14 }}>
            Verifying your reset link… If this doesn't update in a few seconds,
            the link may have expired — request a new one from your administrator.
          </p>
        )}

        {ready && !done && (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#333', textTransform: 'uppercase' }}>
                New Password
              </span>
              <input
                type="password" value={password} required minLength={8}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 18 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#333', textTransform: 'uppercase' }}>
                Confirm Password
              </span>
              <input
                type="password" value={confirm} required minLength={8}
                onChange={e => setConfirm(e.target.value)}
                style={inputStyle}
              />
            </label>

            {error && (
              <div style={{
                background: '#FADBD8', border: '1px solid #E74C3C',
                borderRadius: 8, padding: '8px 12px', color: '#E74C3C',
                fontSize: 13, marginBottom: 14,
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={saving} style={{
              width: '100%', padding: '11px 0', borderRadius: 9, border: 'none',
              background: saving ? '#BDC3C7' : C.navy, color: C.white,
              fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        )}

        {done && (
          <div style={{
            background: '#D5F5E3', border: '1px solid #27AE60',
            borderRadius: 10, padding: '16px 18px', color: '#27AE60', fontSize: 14,
          }}>
            ✅ Password updated. Redirecting to login…
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block', width: '100%', padding: '10px 13px', marginTop: 5,
  borderRadius: 8, border: '1.5px solid #DDD', fontSize: 14,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif',
};
