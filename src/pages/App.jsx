import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUSES, STATUS_ICONS, getMembers, saveMembers, SAMPLE_PHARMACIES } from '../lib/constants'
import ImportModal from '../components/ImportModal'

const makeCall = () => ({ status:'未着手', assignee:'未割当', memo:'', next_action:'', last_call:null })

function exportCSV(filtered, calls) {
  const rows = [['薬局名','都道府県','市区町村','電話番号','ステータス','担当者','最終架電','次回アクション','メモ']]
  filtered.forEach(p => {
    const c = calls[p.id] || makeCall()
    rows.push([p.name,p.pref,p.city,p.phone,c.status,c.assignee,c.last_call||'',c.next_action,c.memo])
  })
  const csv = rows.map(r => r.map(v=>`"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='架電リスト.csv'; a.click()
}

function useIsMobile() {
  const [v, setV] = useState(window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setV(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return v
}

export default function App({ user }) {
  const isMobile = useIsMobile()
  const [pharmacies, setPharmacies] = useState([])
  const [calls,      setCalls]      = useState({})
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState('list')
  const [sel,        setSel]        = useState(null)
  const [fStatus,    setFStatus]    = useState('全て')
  const [fPref,      setFPref]      = useState('全て')
  const [fMember,    setFMember]    = useState('全て')
  const [fText,      setFText]      = useState('')
  const [eMemo,      setEMemo]      = useState('')
  const [eNext,      setENext]      = useState('')
  const [showImport,   setShowImport]   = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMenu,     setShowMenu]     = useState(false)
  const [members,      setMembers]      = useState(getMembers)
  const [newMember,    setNewMember]    = useState('')
  const saveTimer = useRef(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: phData } = await supabase.from('pharmacies').select('*').order('pref').range(0, 59999)
      const { data: crData } = await supabase.from('call_records').select('*').range(0, 59999)
      const ph = phData?.length ? phData : SAMPLE_PHARMACIES
      setPharmacies(ph)
      const callMap = {}
      ph.forEach(p => { callMap[p.id] = makeCall() })
      crData?.forEach(r => { callMap[r.pharmacy_id] = r })
      setCalls(callMap)
    } catch {
      setPharmacies(SAMPLE_PHARMACIES)
      setCalls(Object.fromEntries(SAMPLE_PHARMACIES.map(p => [p.id, makeCall()])))
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const selectedP = sel ? pharmacies.find(p => p.id === sel) : null
  const selectedC = sel ? calls[sel] : null
  useEffect(() => {
    if (selectedC) { setEMemo(selectedC.memo||''); setENext(selectedC.next_action||'') }
  }, [sel])

  const prefs = useMemo(() =>
    ['全て', ...Array.from(new Set(pharmacies.map(p=>p.pref).filter(Boolean))).sort()], [pharmacies])

  const filtered = useMemo(() => pharmacies.filter(p => {
    const c = calls[p.id]
    if (!c) return false
    if (fStatus !== '全て' && c.status !== fStatus) return false
    if (fPref   !== '全て' && p.pref   !== fPref)   return false
    if (fMember !== '全て' && c.assignee !== fMember) return false
    if (fText && ![p.name,p.addr,p.phone,p.chain].some(v=>v&&v.includes(fText))) return false
    return true
  }), [pharmacies, calls, fStatus, fPref, fMember, fText])

  const stats = useMemo(() => {
    const total = pharmacies.length
    const cnt = Object.fromEntries(Object.keys(STATUSES).map(s=>[s,0]))
    Object.values(calls).forEach(c => { if(c) cnt[c.status]=(cnt[c.status]||0)+1 })
    return { total, cnt }
  }, [pharmacies, calls])

  const donePct = Math.round(
    Object.entries(stats.cnt).filter(([s])=>s!=='未着手').reduce((a,[,v])=>a+v,0)
    / Math.max(stats.total,1) * 100
  )

  const setStatus = useCallback(async (id, status) => {
    const lastCall = ['架電済','折り返し待ち'].includes(status)
      ? new Date().toISOString().slice(0,10) : calls[id]?.last_call
    setCalls(prev => ({ ...prev, [id]: { ...prev[id], status, last_call:lastCall } }))
    await supabase.from('call_records').upsert({
      pharmacy_id:id, status, last_call:lastCall,
      assignee:calls[id]?.assignee||'未割当', updated_by:user.id,
    }, { onConflict:'pharmacy_id' })
    await supabase.from('call_history').insert({ pharmacy_id:id, status, assignee:calls[id]?.assignee, created_by:user.id })
  }, [calls, user])

  const setAssignee = useCallback(async (id, assignee) => {
    setCalls(prev => ({ ...prev, [id]: { ...prev[id], assignee } }))
    await supabase.from('call_records').upsert({
      pharmacy_id:id, assignee, status:calls[id]?.status||'未着手', updated_by:user.id,
    }, { onConflict:'pharmacy_id' })
  }, [calls, user])

  const saveMemo = useCallback(() => {
    if (!sel) return
    setCalls(prev => ({ ...prev, [sel]: { ...prev[sel], memo:eMemo, next_action:eNext } }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('call_records').upsert({
        pharmacy_id:sel, memo:eMemo, next_action:eNext,
        status:calls[sel]?.status||'未着手', assignee:calls[sel]?.assignee||'未割当', updated_by:user.id,
      }, { onConflict:'pharmacy_id' })
    }, 300)
  }, [sel, eMemo, eNext, calls, user])

  const addMember = () => {
    if (!newMember.trim()) return
    const updated = [...members, newMember.trim()]
    setMembers(updated); saveMembers(updated); setNewMember('')
  }
  const removeMember = m => {
    const updated = members.filter(x => x !== m)
    setMembers(updated); saveMembers(updated)
  }
  const logout = () => supabase.auth.signOut()

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#080e1a', display:'flex', alignItems:'center', justifyContent:'center', color:'#3b5280', fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:36, marginBottom:12 }}>💊</div><div>読み込み中...</div></div>
    </div>
  )

  return (
    <div style={{ fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif", background:'#080e1a', minHeight:'100vh', color:'#c8d4e8' }}>

      {/* ヘッダー */}
      <header style={{ background:'linear-gradient(180deg,#0d1829,#080e1a)', borderBottom:'1px solid #1a2744', position:'sticky', top:0, zIndex:50, padding: isMobile?'0 12px':'0 20px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height: isMobile?48:54 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>💊</div>
            <div>
              <div style={{ fontSize: isMobile?13:15, fontWeight:800, color:'#e8f0ff', letterSpacing:'0.06em' }}>PHARMA<span style={{ color:'#3b82f6' }}>CRM</span></div>
              {!isMobile && <div style={{ fontSize:9, color:'#3b5280', letterSpacing:'0.12em' }}>全国薬局架電管理</div>}
            </div>
          </div>

          {isMobile ? (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'#3b5280' }}>{stats.total.toLocaleString()}件</span>
              <button onClick={()=>setShowMenu(!showMenu)} style={{ background:'none', border:'1px solid #1a2744', borderRadius:6, color:'#94a3b8', padding:'5px 9px', cursor:'pointer', fontSize:16 }}>☰</button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              {[['list','📋 架電リスト'],['dashboard','📊 ダッシュボード']].map(([t,l])=>(
                <button key={t} onClick={()=>setTab(t)} style={{ padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, background:tab===t?'linear-gradient(135deg,#1d6aeb,#7c3aed)':'transparent', color:tab===t?'#fff':'#4a6490' }}>{l}</button>
              ))}
              <div style={{ width:1, height:20, background:'#1a2744' }}/>
              <button onClick={()=>setShowImport(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#4a8aff' }}>📥 CSV取込</button>
              <button onClick={()=>exportCSV(filtered,calls)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#34d399' }}>📤 出力</button>
              <button onClick={()=>setShowSettings(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#f59e0b' }}>⚙️ 設定</button>
              <span style={{ fontSize:11, color:'#3b5280', padding:'4px 10px', borderRadius:6, background:'#0d1829', border:'1px solid #1a2744' }}>{stats.total.toLocaleString()}件</span>
              <button onClick={logout} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:10, fontWeight:700, background:'transparent', color:'#3b5280' }}>ログアウト</button>
            </div>
          )}
        </div>

        {/* モバイルドロワー */}
        {isMobile && showMenu && (
          <div style={{ borderTop:'1px solid #1a2744', padding:'8px 0' }}>
            {[['list','📋 架電リスト'],['dashboard','📊 ダッシュボード']].map(([t,l])=>(
              <button key={t} onClick={()=>{setTab(t);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:tab===t?'rgba(29,106,235,0.15)':'transparent', color:tab===t?'#60a5fa':'#94a3b8', textAlign:'left' }}>{l}</button>
            ))}
            <div style={{ height:1, background:'#1a2744', margin:'4px 0' }}/>
            <button onClick={()=>{setShowImport(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#4a8aff', textAlign:'left' }}>📥 CSV取込</button>
            <button onClick={()=>{exportCSV(filtered,calls);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#34d399', textAlign:'left' }}>📤 リスト出力</button>
            <button onClick={()=>{setShowSettings(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#f59e0b', textAlign:'left' }}>⚙️ 担当者設定</button>
            <button onClick={logout} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#ef4444', textAlign:'left' }}>🚪 ログアウト</button>
          </div>
        )}

        {/* 進捗バー */}
        <div style={{ padding:'5px 0 6px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:9, color:'#3b5280', fontWeight:700, whiteSpace:'nowrap' }}>進捗 {donePct}%</span>
          <div style={{ flex:1, height:3, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
            <div style={{ width:`${donePct}%`, height:'100%', background:'linear-gradient(90deg,#1d6aeb,#7c3aed,#10b981)', transition:'width 0.6s' }}/>
          </div>
          <span style={{ fontSize:9, color:'#475569', whiteSpace:'nowrap' }}>成約 {stats.cnt['成約']||0}</span>
        </div>
      </header>

      {/* メインコンテンツ */}
      {tab === 'dashboard'
        ? <Dashboard stats={stats} calls={calls} pharmacies={pharmacies} members={members} isMobile={isMobile}/>
        : isMobile
          ? <MobileList {...{pharmacies,calls,stats,filtered,fStatus,setFStatus,fPref,setFPref,fMember,setFMember,fText,setFText,prefs,members,sel,setSel,selectedP,selectedC,eMemo,setEMemo,eNext,setENext,setStatus,setAssignee,saveMemo}}/>
          : <DesktopList {...{pharmacies,calls,stats,filtered,fStatus,setFStatus,fPref,setFPref,fMember,setFMember,fText,setFText,prefs,members,sel,setSel,selectedP,selectedC,eMemo,setEMemo,eNext,setENext,setStatus,setAssignee,saveMemo}}/>
      }

      {showImport && <ImportModal onClose={()=>setShowImport(false)} onDone={()=>{setShowImport(false);fetchData()}}/>}

      {/* 担当者設定モーダル */}
      {showSettings && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
          <div style={{ background:'#0d1829', borderRadius:14, padding:24, width:'100%', maxWidth:400, border:'1px solid #1a2744' }}>
            <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff', marginBottom:16 }}>⚙️ 担当者設定</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16, maxHeight:260, overflowY:'auto' }}>
              {members.filter(m=>m!=='未割当').map(m=>(
                <div key={m} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:8, background:'#1a2744' }}>
                  <span style={{ fontSize:14, color:'#c8d4e8', fontWeight:600 }}>{m}</span>
                  <button onClick={()=>removeMember(m)} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:18 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input value={newMember} onChange={e=>setNewMember(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addMember()} placeholder="担当者名を入力"
                style={{ flex:1, padding:'10px 12px', borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none' }}/>
              <button onClick={addMember} style={{ padding:'10px 16px', borderRadius:8, border:'none', background:'#1d6aeb', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>追加</button>
            </div>
            <button onClick={()=>setShowSettings(false)} style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #1a2744', background:'transparent', color:'#94a3b8', fontSize:13, cursor:'pointer' }}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ━━ モバイルリスト ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MobileList({ calls, stats, filtered, fStatus, setFStatus, fPref, setFPref, fMember, setFMember, fText, setFText, prefs, members, sel, setSel, selectedP, selectedC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo }) {

  if (sel && selectedP && selectedC) {
    const st = STATUSES[selectedC.status] || STATUSES['未着手']
    return (
      <div style={{ minHeight:'calc(100vh - 80px)', background:'#0b1221' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #1a2744', display:'flex', alignItems:'center', gap:10, background:'#0d1829', position:'sticky', top:80, zIndex:10 }}>
          <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:'#60a5fa', cursor:'pointer', fontSize:15, fontWeight:700, padding:0 }}>← 戻る</button>
          <div style={{ fontSize:13, fontWeight:700, color:'#e8f0ff', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selectedP.name}</div>
          <span style={{ padding:'3px 8px', borderRadius:4, background:st.bg, color:st.bright, fontSize:10, fontWeight:700, border:`1px solid ${st.color}44`, flexShrink:0 }}>{STATUS_ICONS[selectedC.status]} {selectedC.status}</span>
        </div>

        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
          {/* 薬局情報 */}
          <div style={{ padding:14, borderRadius:10, background:'#1a2744' }}>
            {selectedP.chain && <div style={{ fontSize:10, color:'#3b5280', marginBottom:2 }}>🏢 {selectedP.chain}</div>}
            {selectedP.rep   && <div style={{ fontSize:10, color:'#3b5280', marginBottom:4 }}>👤 {selectedP.rep}</div>}
            <div style={{ fontSize:11, color:'#4a6490', marginBottom:8 }}>📍 {selectedP.addr}</div>
            <a href={`tel:${selectedP.phone}`} style={{ fontSize:18, color:'#60a5fa', fontWeight:800, textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
              <span>📞</span><span>{selectedP.phone||'—'}</span>
            </a>
            <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
              {selectedP.rx_count      && <span style={{ padding:'3px 8px', borderRadius:4, background:'rgba(16,185,129,0.15)', color:'#34d399', fontSize:11, fontWeight:700 }}>💊 処方箋 {Number(selectedP.rx_count).toLocaleString()}枚</span>}
              {selectedP.concentration && <span style={{ padding:'3px 8px', borderRadius:4, background:'rgba(245,158,11,0.15)', color:'#fbbf24', fontSize:11, fontWeight:700 }}>📊 集中率 {selectedP.concentration}%</span>}
            </div>
          </div>

          {/* ステータス */}
          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>ステータス</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {Object.entries(STATUSES).map(([s,c])=>{
                const on = selectedC.status===s
                return (
                  <button key={s} onClick={()=>setStatus(sel,s)} style={{ padding:'12px 4px', borderRadius:10, border:`2px solid ${on?c.color:'#1a2744'}`, background:on?c.bg:'#0d1829', color:on?c.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer', textAlign:'center' }}>
                    <div style={{ fontSize:18, marginBottom:3 }}>{STATUS_ICONS[s]}</div>
                    <div style={{ fontSize:10, lineHeight:1.3 }}>{s}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 担当者 */}
          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>担当者</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {members.map(m=>{
                const on = selectedC.assignee===m
                return (
                  <button key={m} onClick={()=>setAssignee(sel,m)} style={{ padding:'9px 16px', borderRadius:8, border:`1.5px solid ${on?'#1d6aeb':'#1a2744'}`, background:on?'rgba(29,106,235,0.2)':'#0d1829', color:on?'#60a5fa':'#3b5280', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                    {m}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 次回アクション */}
          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>次回アクション</div>
            <input value={eNext} onChange={e=>setENext(e.target.value)} placeholder="例：来週月曜に再架電"
              style={{ width:'100%', padding:'12px', borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
          </div>

          {/* メモ */}
          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>架電メモ</div>
            <textarea value={eMemo} onChange={e=>setEMemo(e.target.value)} rows={5} placeholder="架電内容・担当者名・受付状況など..."
              style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none', resize:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
          </div>

          <button onClick={saveMemo} style={{ padding:16, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:15, fontWeight:800, cursor:'pointer', marginBottom:32 }}>
            💾　保存する
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)' }}>
      {/* フィルター */}
      <div style={{ padding:'10px 12px', background:'#0b1221', borderBottom:'1px solid #1a2744' }}>
        <div style={{ position:'relative', marginBottom:8 }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#2a3d60' }}>🔍</span>
          <input value={fText} onChange={e=>setFText(e.target.value)} placeholder="薬局名・住所・電話番号"
            style={{ width:'100%', padding:'10px 10px 10px 32px', borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[{v:fStatus,s:setFStatus,o:['全て',...Object.keys(STATUSES)]},{v:fPref,s:setFPref,o:prefs},{v:fMember,s:setFMember,o:['全て',...members]}].map((item,i)=>(
            <select key={i} value={item.v} onChange={e=>item.s(e.target.value)} style={{ flex:1, padding:'8px 4px', borderRadius:7, border:'1px solid #1a2744', background:'#080e1a', color:'#7ab3ff', fontSize:11, outline:'none' }}>
              {item.o.map(o=><option key={o}>{o}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* ステータスチップ */}
      <div style={{ padding:'7px 12px', background:'#080e1a', borderBottom:'1px solid #1a2744', display:'flex', gap:5, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        <button onClick={()=>setFStatus('全て')} style={{ padding:'5px 11px', borderRadius:99, border:`1px solid ${fStatus==='全て'?'#4a6490':'#1a2744'}`, background:fStatus==='全て'?'rgba(74,100,144,0.2)':'transparent', color:fStatus==='全て'?'#94a3b8':'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>全て {stats.total}</button>
        {Object.entries(STATUSES).map(([s,c])=>(
          <button key={s} onClick={()=>setFStatus(fStatus===s?'全て':s)} style={{ padding:'5px 11px', borderRadius:99, border:`1px solid ${fStatus===s?c.color:'#1a2744'}`, background:fStatus===s?c.bg:'transparent', color:fStatus===s?c.bright:'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            {STATUS_ICONS[s]} {s} {stats.cnt[s]||0}
          </button>
        ))}
      </div>

      <div style={{ padding:'5px 12px', background:'#080e1a', borderBottom:'1px solid #0d1829' }}>
        <span style={{ fontSize:11, color:'#2a3d60' }}>{filtered.length.toLocaleString()} 件</span>
      </div>

      {/* カードリスト */}
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
        {filtered.map(p=>{
          const c = calls[p.id] || makeCall()
          const st = STATUSES[c.status] || STATUSES['未着手']
          return (
            <div key={p.id} onClick={()=>setSel(p.id)}
              style={{ padding:'13px 16px', borderBottom:'1px solid #0d1829', background:'#080e1a', cursor:'pointer', display:'flex', alignItems:'center', gap:12, minHeight:64 }}>
              <div style={{ width:4, height:48, borderRadius:99, background:st.color, flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#e8f0ff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{p.name}</div>
                  <span style={{ padding:'3px 8px', borderRadius:4, background:st.bg, color:st.bright, fontSize:10, fontWeight:700, border:`1px solid ${st.color}44`, marginLeft:8, flexShrink:0 }}>{STATUS_ICONS[c.status]} {c.status}</span>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:12, color:'#3b5280' }}>{p.pref}</span>
                  <span style={{ fontSize:12, color:'#3b5280', fontFamily:'monospace' }}>{p.phone||'—'}</span>
                  {c.assignee !== '未割当' && <span style={{ fontSize:12, color:'#4a8aff', fontWeight:600 }}>👤 {c.assignee}</span>}
                </div>
                {c.next_action && <div style={{ fontSize:11, color:'#f59e0b', marginTop:4 }}>→ {c.next_action}</div>}
              </div>
              <div style={{ color:'#2a3d60', fontSize:18, flexShrink:0 }}>›</div>
            </div>
          )
        })}
        {filtered.length===0 && (
          <div style={{ padding:48, textAlign:'center', color:'#2a3d60', fontSize:13 }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>条件に一致する薬局がありません
          </div>
        )}
      </div>
    </div>
  )
}

// ━━ デスクトップリスト ━━━━━━━━━━━━━━━━━━━━━━━━━━
function DesktopList({ calls, stats, filtered, fStatus, setFStatus, fPref, setFPref, fMember, setFMember, fText, setFText, prefs, members, sel, setSel, selectedP, selectedC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo }) {
  return (
    <div style={{ display:'flex', height:'calc(100vh - 96px)' }}>
      <div style={{ width:selectedP?'55%':'100%', display:'flex', flexDirection:'column', borderRight:'1px solid #1a2744', transition:'width 0.3s' }}>
        <div style={{ padding:'10px 14px', background:'#0b1221', borderBottom:'1px solid #1a2744', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ position:'relative', flex:1, minWidth:170 }}>
            <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#2a3d60' }}>🔍</span>
            <input value={fText} onChange={e=>setFText(e.target.value)} placeholder="薬局名・住所・電話番号"
              style={{ width:'100%', padding:'6px 10px 6px 28px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', boxSizing:'border-box' }}/>
          </div>
          {[{v:fStatus,s:setFStatus,o:['全て',...Object.keys(STATUSES)]},{v:fPref,s:setFPref,o:prefs},{v:fMember,s:setFMember,o:['全て',...members]}].map((item,i)=>(
            <select key={i} value={item.v} onChange={e=>item.s(e.target.value)} style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#7ab3ff', fontSize:11, outline:'none', cursor:'pointer' }}>
              {item.o.map(o=><option key={o}>{o}</option>)}
            </select>
          ))}
          <span style={{ fontSize:11, color:'#2a3d60', fontWeight:700 }}>{filtered.length.toLocaleString()}件</span>
        </div>
        <div style={{ padding:'6px 14px', background:'#080e1a', borderBottom:'1px solid #1a2744', display:'flex', gap:5, overflowX:'auto' }}>
          <button onClick={()=>setFStatus('全て')} style={{ padding:'3px 10px', borderRadius:99, border:`1px solid ${fStatus==='全て'?'#4a6490':'#1a2744'}`, background:fStatus==='全て'?'rgba(74,100,144,0.2)':'transparent', color:fStatus==='全て'?'#94a3b8':'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>全て {stats.total}</button>
          {Object.entries(STATUSES).map(([s,c])=>(
            <button key={s} onClick={()=>setFStatus(fStatus===s?'全て':s)} style={{ padding:'3px 10px', borderRadius:99, border:`1px solid ${fStatus===s?c.color:'#1a2744'}`, background:fStatus===s?c.bg:'transparent', color:fStatus===s?c.bright:'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
              {STATUS_ICONS[s]} {s} {stats.cnt[s]||0}
            </button>
          ))}
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#0b1221', position:'sticky', top:0, zIndex:2 }}>
                {['薬局名','都道府県','電話番号','ステータス','担当者','最終架電'].map(h=>(
                  <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:9, fontWeight:700, color:'#2a3d60', borderBottom:'1px solid #1a2744', letterSpacing:'0.1em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p,i)=>{
                const c = calls[p.id] || makeCall()
                const st = STATUSES[c.status] || STATUSES['未着手']
                const isSel = sel===p.id
                return (
                  <tr key={p.id} onClick={()=>setSel(isSel?null:p.id)} style={{ background:isSel?'rgba(29,106,235,0.12)':i%2===0?'#080e1a':'#090f1c', cursor:'pointer', borderBottom:'1px solid #0d1829' }}>
                    <td style={{ padding:'8px 10px', fontSize:12, color:isSel?'#7ab3ff':'#c8d4e8', fontWeight:600, maxWidth:190, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {isSel&&<span style={{ color:'#3b82f6', marginRight:4 }}>▶</span>}{p.name}
                    </td>
                    <td style={{ padding:'8px 10px', fontSize:11, color:'#4a6490' }}>{p.pref}</td>
                    <td style={{ padding:'8px 10px', fontSize:11, color:'#4a6490', fontFamily:'monospace' }}>{p.phone||'—'}</td>
                    <td style={{ padding:'8px 10px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:4, background:st.bg, color:st.bright, fontSize:10, fontWeight:700, border:`1px solid ${st.color}44` }}>{STATUS_ICONS[c.status]} {c.status}</span>
                    </td>
                    <td style={{ padding:'8px 10px', fontSize:11, color:c.assignee==='未割当'?'#2a3d60':'#7ab3ff' }}>{c.assignee}</td>
                    <td style={{ padding:'8px 10px', fontSize:10, color:'#2a3d60' }}>{c.last_call||'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{ padding:48, textAlign:'center', color:'#2a3d60', fontSize:13 }}><div style={{ fontSize:28, marginBottom:8 }}>🔍</div>条件に一致する薬局がありません</div>}
        </div>
      </div>

      {selectedP && selectedC && (
        <div style={{ width:'45%', display:'flex', flexDirection:'column', background:'#0b1221', overflowY:'auto' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #1a2744' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1, marginRight:10 }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#e8f0ff', marginBottom:4 }}>{selectedP.name}</div>
                {selectedP.chain && <div style={{ fontSize:10, color:'#3b5280', marginBottom:2 }}>🏢 {selectedP.chain}</div>}
                {selectedP.rep   && <div style={{ fontSize:10, color:'#3b5280', marginBottom:4 }}>👤 {selectedP.rep}</div>}
                <div style={{ fontSize:11, color:'#3b5280' }}>📍 {selectedP.addr}</div>
                <div style={{ fontSize:12, color:'#7ab3ff', marginTop:4, fontFamily:'monospace', fontWeight:700 }}>📞 {selectedP.phone||'—'}</div>
                <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                  {selectedP.rx_count      && <span style={{ padding:'2px 8px', borderRadius:4, background:'rgba(16,185,129,0.15)', color:'#34d399', fontSize:11, fontWeight:700 }}>💊 {Number(selectedP.rx_count).toLocaleString()}枚</span>}
                  {selectedP.concentration && <span style={{ padding:'2px 8px', borderRadius:4, background:'rgba(245,158,11,0.15)', color:'#fbbf24', fontSize:11, fontWeight:700 }}>📊 集中率 {selectedP.concentration}%</span>}
                </div>
              </div>
              <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:'#2a3d60', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:14 }}>
            <Section label="ステータス変更">
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {Object.entries(STATUSES).map(([s,c])=>{
                  const on = selectedC.status===s
                  return <button key={s} onClick={()=>setStatus(sel,s)} style={{ padding:'5px 10px', borderRadius:5, border:`1.5px solid ${on?c.color:'#1a2744'}`, background:on?c.bg:'transparent', color:on?c.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>{STATUS_ICONS[s]} {s}</button>
                })}
              </div>
            </Section>
            <Section label="担当者">
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {members.map(m=>{
                  const on = selectedC.assignee===m
                  return <button key={m} onClick={()=>setAssignee(sel,m)} style={{ padding:'4px 10px', borderRadius:5, border:`1.5px solid ${on?'#1d6aeb':'#1a2744'}`, background:on?'rgba(29,106,235,0.15)':'transparent', color:on?'#7ab3ff':'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>{m}</button>
                })}
              </div>
            </Section>
            <Section label="次回アクション">
              <input value={eNext} onChange={e=>setENext(e.target.value)} placeholder="例：来週月曜に再架電" style={{ width:'100%', padding:'8px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', boxSizing:'border-box' }}/>
            </Section>
            <Section label="架電メモ">
              <textarea value={eMemo} onChange={e=>setEMemo(e.target.value)} rows={4} placeholder="架電内容・担当者名など..." style={{ width:'100%', padding:'8px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
            </Section>
            <button onClick={saveMemo} style={{ padding:'10px', borderRadius:7, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer' }}>💾　保存する</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:7, textTransform:'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

// ━━ ダッシュボード ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Dashboard({ stats, calls, pharmacies, members, isMobile }) {
  const memberStats = useMemo(() => {
    const r = {}
    members.forEach(m => { r[m] = { total:0, ...Object.fromEntries(Object.keys(STATUSES).map(s=>[s,0])) } })
    Object.values(calls).forEach(c => { if(c&&r[c.assignee]){r[c.assignee].total++;r[c.assignee][c.status]++} })
    return r
  }, [calls, members])

  const prefStats = useMemo(() => {
    const r = {}
    pharmacies.forEach(p => {
      if(!r[p.pref])r[p.pref]={total:0,done:0}
      r[p.pref].total++
      const c=calls[p.id]
      if(c&&c.status!=='未着手')r[p.pref].done++
    })
    return Object.entries(r).sort((a,b)=>b[1].total-a[1].total).slice(0,10)
  }, [pharmacies, calls])

  return (
    <div style={{ padding: isMobile?12:20, overflowY:'auto', height:`calc(100vh - ${isMobile?80:96}px)`, display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff' }}>📊 ダッシュボード</div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile?'repeat(3,1fr)':'repeat(auto-fit,minmax(130px,1fr))', gap:8 }}>
        {Object.entries(STATUSES).map(([s,c])=>(
          <div key={s} style={{ padding: isMobile?'10px 8px':'14px', borderRadius:9, background:'#0b1221', border:`1px solid ${c.color}30`, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${c.color},transparent)` }}/>
            <div style={{ fontSize: isMobile?18:22, fontWeight:900, color:c.bright }}>{stats.cnt[s]||0}</div>
            <div style={{ fontSize: isMobile?9:11, color:'#4a6490', marginTop:2 }}>{STATUS_ICONS[s]} {s}</div>
            <div style={{ fontSize:9, color:'#2a3d60', marginTop:2 }}>{Math.round((stats.cnt[s]||0)/Math.max(stats.total,1)*100)}%</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>👥 担当者別進捗</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:360 }}>
            <thead><tr style={{ background:'#080e1a' }}>
              <th style={{ padding:'7px 12px', textAlign:'left', fontSize:9, color:'#2a3d60', fontWeight:700 }}>担当者</th>
              <th style={{ padding:'7px 8px', textAlign:'center', fontSize:9, color:'#2a3d60' }}>合計</th>
              {Object.entries(STATUSES).map(([s,c])=><th key={s} style={{ padding:'7px 5px', textAlign:'center', fontSize:9, color:c.bright }}>{STATUS_ICONS[s]}</th>)}
            </tr></thead>
            <tbody>
              {members.map((m,i)=>(
                <tr key={m} style={{ borderTop:'1px solid #1a2744', background:i%2===0?'#0b1221':'#080e1a' }}>
                  <td style={{ padding:'9px 12px', fontSize:12, color:m==='未割当'?'#2a3d60':'#c8d4e8', fontWeight:700 }}>{m}</td>
                  <td style={{ padding:'9px 8px', textAlign:'center', fontSize:12, color:'#7ab3ff', fontWeight:800 }}>{memberStats[m]?.total||0}</td>
                  {Object.entries(STATUSES).map(([s,c])=>(
                    <td key={s} style={{ padding:'9px 5px', textAlign:'center', fontSize:12, color:c.bright }}>{memberStats[m]?.[s]||0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>🗾 都道府県別進捗</div>
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
          {prefStats.map(([pref,s])=>{
            const pct=Math.round(s.done/Math.max(s.total,1)*100)
            return(
              <div key={pref} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width: isMobile?70:90, fontSize:11, color:'#7ab3ff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flexShrink:0 }}>{pref}</div>
                <div style={{ flex:1, height:5, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:'linear-gradient(90deg,#1d6aeb,#10b981)' }}/>
                </div>
                <div style={{ fontSize:10, color:'#2a3d60', whiteSpace:'nowrap' }}>{s.done}/{s.total}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
