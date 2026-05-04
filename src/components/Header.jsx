import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Header({ tab, setTab, total, donePct, statCnt, statusIcons, user, onImport, onExport, onSettings }) {
  const logout = () => supabase.auth.signOut()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <style>{`
        @media (max-width: 640px) {
          .hdr-desktop { display: none !important; }
          .hdr-mobile  { display: flex !important; }
          .tab-bar     { display: flex !important; }
        }
        @media (min-width: 641px) {
          .hdr-desktop { display: flex !important; }
          .hdr-mobile  { display: none !important; }
          .tab-bar     { display: none !important; }
        }
      `}</style>

      {/* ━━ PC ヘッダー ━━ */}
      <header className="hdr-desktop" style={{ background:'linear-gradient(180deg,#0d1829,#080e1a)', borderBottom:'1px solid #1a2744', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:54, position:'sticky', top:0, zIndex:50, fontFamily:"'Noto Sans JP',sans-serif" }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>💊</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:'0.06em', color:'#e8f0ff', lineHeight:1.1 }}>PHARMA<span style={{ color:'#3b82f6' }}>CRM</span></div>
            <div style={{ fontSize:9, color:'#3b5280', letterSpacing:'0.12em', fontWeight:600 }}>PHARMACY CALL MANAGEMENT</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {[['list','📋 架電リスト'],['dashboard','📊 ダッシュボード']].map(([t,l]) => (
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'6px 15px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, background:tab===t?'linear-gradient(135deg,#1d6aeb,#7c3aed)':'transparent', color:tab===t?'#fff':'#4a6490' }}>{l}</button>
          ))}
          <div style={{ width:1, height:20, background:'#1a2744' }}/>
          <button onClick={onImport} style={{ padding:'6px 13px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#4a8aff' }}>📥 CSV取込</button>
          <button onClick={onExport} style={{ padding:'6px 13px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#34d399' }}>📤 出力</button>
          <button onClick={onSettings} style={{ padding:'6px 13px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#f59e0b' }}>⚙️ 設定</button>
          <div style={{ padding:'4px 10px', borderRadius:6, background:'#0d1829', border:'1px solid #1a2744', fontSize:10, color:'#3b5280', fontWeight:600 }}>{total.toLocaleString()}件</div>
          <button onClick={logout} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:10, fontWeight:700, background:'transparent', color:'#3b5280' }}>ログアウト</button>
        </div>
      </header>

      {/* ━━ モバイル ヘッダー ━━ */}
      <header className="hdr-mobile" style={{ background:'linear-gradient(180deg,#0d1829,#080e1a)', borderBottom:'1px solid #1a2744', alignItems:'center', justifyContent:'space-between', padding:'0 14px', height:50, position:'sticky', top:0, zIndex:50, fontFamily:"'Noto Sans JP',sans-serif" }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>💊</div>
          <div style={{ fontSize:14, fontWeight:800, color:'#e8f0ff' }}>PHARMA<span style={{ color:'#3b82f6' }}>CRM</span></div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ fontSize:10, color:'#3b5280', fontWeight:600 }}>{total.toLocaleString()}件</div>
          <button onClick={() => setMenuOpen(v => !v)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:16, background:'transparent', color:'#7ab3ff' }}>☰</button>
        </div>

        {/* ドロップダウンメニュー */}
        {menuOpen && (
          <div style={{ position:'absolute', top:50, right:0, left:0, background:'#0d1829', borderBottom:'2px solid #1d6aeb', zIndex:100, padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
            {[['list','📋 架電リスト'],['dashboard','📊 ダッシュボード']].map(([t,l]) => (
              <button key={t} onClick={()=>{setTab(t);setMenuOpen(false)}} style={{ padding:'10px 14px', borderRadius:7, border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:tab===t?'linear-gradient(135deg,#1d6aeb,#7c3aed)':'#1a2744', color:tab===t?'#fff':'#94a3b8', textAlign:'left' }}>{l}</button>
            ))}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{onImport();setMenuOpen(false)}} style={{ flex:1, padding:'10px', borderRadius:7, border:'1px solid #1a2744', cursor:'pointer', fontSize:12, fontWeight:700, background:'transparent', color:'#4a8aff' }}>📥 CSV取込</button>
              <button onClick={()=>{onExport();setMenuOpen(false)}} style={{ flex:1, padding:'10px', borderRadius:7, border:'1px solid #1a2744', cursor:'pointer', fontSize:12, fontWeight:700, background:'transparent', color:'#34d399' }}>📤 出力</button>
            </div>
            <div style={{ fontSize:11, color:'#3b5280', padding:'4px 2px' }}>👤 {user?.email}</div>
            <button onClick={logout} style={{ padding:'10px', borderRadius:7, border:'1px solid #334155', cursor:'pointer', fontSize:12, fontWeight:700, background:'transparent', color:'#ef4444' }}>ログアウト</button>
          </div>
        )}
      </header>

      {/* ━━ 進捗バー ━━ */}
      <div style={{ background:'#0d1829', borderBottom:'1px solid #1a2744', padding:'5px 14px', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:10, color:'#3b5280', fontWeight:700, whiteSpace:'nowrap' }}>PROGRESS {donePct}%</span>
        <div style={{ flex:1, height:4, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
          <div style={{ width:`${donePct}%`, height:'100%', background:'linear-gradient(90deg,#1d6aeb,#7c3aed,#10b981)', transition:'width 0.6s ease' }}/>
        </div>
        {Object.entries(statCnt).map(([s,n]) => n > 0 && (
          <span key={s} style={{ fontSize:10, color:'#4a6490', whiteSpace:'nowrap' }}>{statusIcons[s]}{n}</span>
        ))}
      </div>

      {/* ━━ モバイル タブバー ━━ */}
      <div className="tab-bar" style={{ display:'none', background:'#0b1221', borderBottom:'1px solid #1a2744', padding:'0 14px' }}>
        {[['list','📋 リスト'],['dashboard','📊 DB']].map(([t,l]) => (
          <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:'10px 0', border:'none', borderBottom: tab===t ? '2px solid #3b82f6' : '2px solid transparent', cursor:'pointer', fontSize:12, fontWeight:700, background:'transparent', color:tab===t?'#60a5fa':'#4a6490' }}>{l}</button>
        ))}
      </div>
    </>
  )
}
