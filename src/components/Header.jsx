import { supabase } from '../lib/supabase'

export default function Header({ tab, setTab, total, donePct, statCnt, statusIcons, user, onImport, onExport }) {
  const logout = () => supabase.auth.signOut()

  return (
    <>
      {/* ヘッダー */}
      <header style={{ background:'linear-gradient(180deg,#0d1829,#080e1a)', borderBottom:'1px solid #1a2744', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:54, position:'sticky', top:0, zIndex:50, fontFamily:"'Noto Sans JP',sans-serif" }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, boxShadow:'0 0 18px rgba(29,106,235,0.45)' }}>💊</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:'0.06em', color:'#e8f0ff', lineHeight:1.1 }}>
              PHARMA<span style={{ color:'#3b82f6' }}>CRM</span>
            </div>
            <div style={{ fontSize:9, color:'#3b5280', letterSpacing:'0.12em', fontWeight:600 }}>PHARMACY CALL MANAGEMENT</div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {[['list','📋 架電リスト'],['dashboard','📊 ダッシュボード']].map(([t,l]) => (
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'6px 15px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, background:tab===t?'linear-gradient(135deg,#1d6aeb,#7c3aed)':'transparent', color:tab===t?'#fff':'#4a6490', boxShadow:tab===t?'0 2px 12px rgba(29,106,235,0.35)':'none' }}>
              {l}
            </button>
          ))}
          <div style={{ width:1, height:20, background:'#1a2744' }}/>
          <button onClick={onImport} style={{ padding:'6px 13px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#4a8aff' }}>📥 CSV取込</button>
          <button onClick={onExport} style={{ padding:'6px 13px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#34d399' }}>📤 出力</button>
          <div style={{ padding:'4px 10px', borderRadius:6, background:'#0d1829', border:'1px solid #1a2744', fontSize:10, color:'#3b5280', fontWeight:600 }}>{total.toLocaleString()}件</div>
          <div style={{ padding:'4px 10px', borderRadius:6, background:'#0d1829', border:'1px solid #1a2744', fontSize:10, color:'#4a6490', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            👤 {user?.email?.split('@')[0]}
          </div>
          <button onClick={logout} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:10, fontWeight:700, background:'transparent', color:'#3b5280' }}>ログアウト</button>
        </div>
      </header>

      {/* 進捗バー */}
      <div style={{ background:'#0d1829', borderBottom:'1px solid #1a2744', padding:'6px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:10, color:'#3b5280', fontWeight:700, whiteSpace:'nowrap', letterSpacing:'0.05em' }}>PROGRESS {donePct}%</span>
        <div style={{ flex:1, height:4, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
          <div style={{ width:`${donePct}%`, height:'100%', background:'linear-gradient(90deg,#1d6aeb,#7c3aed,#10b981)', transition:'width 0.6s ease' }}/>
        </div>
        {Object.entries(statCnt).map(([s,n]) => n > 0 && (
          <span key={s} style={{ fontSize:10, color:'#4a6490', whiteSpace:'nowrap' }}>{statusIcons[s]}{n}</span>
        ))}
      </div>
    </>
  )
}
