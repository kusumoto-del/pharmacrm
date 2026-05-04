import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mode,     setMode]     = useState('login')   // login | signup
  const [loading,  setLoading]  = useState(false)
  const [msg,      setMsg]      = useState('')
  const [error,    setError]    = useState('')

  const handle = async () => {
    setLoading(true); setMsg(''); setError('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg('確認メールを送信しました。メールを確認してください。')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const C = {
    wrap: { minHeight:'100vh', background:'#080e1a', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif" },
    card: { width:380, background:'#0d1829', borderRadius:14, padding:36, border:'1px solid #1a2744', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' },
    logo: { textAlign:'center', marginBottom:28 },
    icon: { width:48, height:48, borderRadius:12, background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 12px', boxShadow:'0 0 20px rgba(29,106,235,0.4)' },
    title: { fontSize:20, fontWeight:900, color:'#e8f0ff', letterSpacing:'0.06em' },
    sub:   { fontSize:10, color:'#3b5280', letterSpacing:'0.12em', marginTop:3 },
    label: { fontSize:11, color:'#4a6490', fontWeight:700, letterSpacing:'0.06em', display:'block', marginBottom:6 },
    input: { width:'100%', padding:'10px 13px', borderRadius:7, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:14 },
    btn:   { width:'100%', padding:12, borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', letterSpacing:'0.04em', boxShadow:'0 2px 14px rgba(29,106,235,0.4)', opacity: loading ? 0.7 : 1 },
    toggle:{ textAlign:'center', marginTop:16, fontSize:12, color:'#3b5280' },
    link:  { color:'#4a8aff', cursor:'pointer', fontWeight:700, background:'none', border:'none', fontSize:12, textDecoration:'underline' },
    msg:   { padding:'8px 12px', borderRadius:6, marginBottom:14, fontSize:12, textAlign:'center' },
  }

  return (
    <div style={C.wrap}>
      <div style={C.card}>
        <div style={C.logo}>
          <div style={C.icon}>💊</div>
          <div style={C.title}>PHARMA<span style={{color:'#3b82f6'}}>CRM</span></div>
          <div style={C.sub}>全国薬局架電管理システム</div>
        </div>

        {msg   && <div style={{...C.msg, background:'rgba(16,185,129,0.1)', color:'#34d399', border:'1px solid rgba(16,185,129,0.2)'}}>{msg}</div>}
        {error && <div style={{...C.msg, background:'rgba(239,68,68,0.1)',  color:'#f87171', border:'1px solid rgba(239,68,68,0.2)'}}>{error}</div>}

        <label style={C.label}>メールアドレス</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" style={C.input}
          onKeyDown={e=>e.key==='Enter'&&handle()}/>

        <label style={C.label}>パスワード</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" style={C.input}
          onKeyDown={e=>e.key==='Enter'&&handle()}/>

        <button onClick={handle} disabled={loading} style={C.btn}>
          {loading ? '処理中...' : mode==='login' ? 'ログイン' : '新規登録'}
        </button>

        <div style={C.toggle}>
          {mode==='login' ? (
            <>アカウントをお持ちでない方は<button style={C.link} onClick={()=>{setMode('signup');setError('');setMsg('')}}>新規登録</button></>
          ) : (
            <>すでにアカウントをお持ちの方は<button style={C.link} onClick={()=>{setMode('login');setError('');setMsg('')}}>ログイン</button></>
          )}
        </div>
      </div>
    </div>
  )
}
