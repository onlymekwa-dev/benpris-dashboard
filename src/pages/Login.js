import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { C } from '../components/UI';

export default function Login() {
  const { signIn, profile } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // Redirect after profile loads
      setTimeout(() => {
        const role = profile?.role;
        if (role === 'admin')    navigate('/admin');
        else if (role === 'investor') navigate('/investor');
        else navigate('/driver');
      }, 400);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${C.navy} 0%, #2C4270 60%, ${C.teal} 100%)`,
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        background: C.white, borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        padding: '48px 40px', width: 380, maxWidth: '90vw',
      }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: C.navy, margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: C.white, fontSize: 26, fontWeight: 900 }}>B</span>
          </div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:800, color: C.navy }}>BenPris Auto Services</h1>
          <p style={{ margin:'6px 0 0', color:'#888', fontSize:13 }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display:'block', marginBottom:16 }}>
            <span style={{ fontSize:12, fontWeight:700, color: C.navy, textTransform:'uppercase', letterSpacing:0.5 }}>
              Email
            </span>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@benpris.com"
              style={inputStyle}
            />
          </label>

          <label style={{ display:'block', marginBottom:24 }}>
            <span style={{ fontSize:12, fontWeight:700, color: C.navy, textTransform:'uppercase', letterSpacing:0.5 }}>
              Password
            </span>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{
              background:'#FADBD8', border:'1px solid #E74C3C',
              borderRadius:8, padding:'10px 14px',
              color: C.red, fontSize:13, marginBottom:16,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width:'100%', padding:'13px 0',
            background: loading ? '#aaa' : C.navy,
            color: C.white, border:'none', borderRadius:10,
            fontWeight:700, fontSize:15, cursor: loading ? 'not-allowed' : 'pointer',
            transition:'background 0.2s',
          }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#aaa' }}>
          No sign-up. Contact admin for access.
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block', width: '100%', marginTop: 6,
  padding: '11px 14px', borderRadius: 8,
  border: '1.5px solid #DDD', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'Arial, sans-serif',
  transition: 'border-color 0.2s',
};
