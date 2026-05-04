import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUSES, STATUS_ICONS, getMembers, saveMembers, SAMPLE_PHARMACIES } from '../lib/constants'
import ImportModal from '../components/ImportModal'

// ﾃ湧G繧帝勁螟悶＠縺溘せ繝・・繧ｿ繧ｹ螳夂ｾｩ
const ACTIVE_STATUSES = Object.fromEntries(Object.entries(STATUSES).filter(([s]) => s !== 'NG'))

const makeCall = () => ({ status:'譛ｪ逹謇・, assignee:'譛ｪ蜑ｲ蠖・, memo:'', next_action:'', last_call:null, locked:false })

function exportCSV(filtered, calls) {
  const rows = [['阮ｬ螻蜷・,'驛ｽ驕灘ｺ懃恁','蟶ょ玄逕ｺ譚・,'髮ｻ隧ｱ逡ｪ蜿ｷ','繧ｹ繝・・繧ｿ繧ｹ','諡・ｽ楢・,'譛邨よ楔髮ｻ','谺｡蝗槭い繧ｯ繧ｷ繝ｧ繝ｳ','繝｡繝｢']]
  filtered.forEach(p => {
    const c = calls[p.id] || makeCall()
    rows.push([p.name,p.pref,p.city,p.phone,c.status,c.assignee,c.last_call||'',c.next_action,c.memo])
  })
  const csv = rows.map(r => r.map(v=>`"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='譫ｶ髮ｻ繝ｪ繧ｹ繝・csv'; a.click()
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

  // 繝輔ぅ繝ｫ繧ｿ繝ｼ
  const [fStatus,   setFStatus]   = useState('蜈ｨ縺ｦ')
  const [fPref,     setFPref]     = useState('蜈ｨ縺ｦ')
  const [fCity,     setFCity]     = useState('蜈ｨ縺ｦ')
  const [fMember,   setFMember]   = useState('蜈ｨ縺ｦ')
  const [fText,     setFText]     = useState('')
  const [fChain,    setFChain]    = useState('')
  const [fRep,      setFRep]      = useState('')
  const [fRxMin,    setFRxMin]    = useState('')

  // 隧ｳ邏ｰ邱ｨ髮・  const [eMemo, setEMemo] = useState('')
  const [eNext, setENext] = useState('')

  // 繝｢繝ｼ繝繝ｫ
  const [showImport,   setShowImport]   = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showBulk,     setShowBulk]     = useState(false)
  const [showMenu,     setShowMenu]     = useState(false)
  const [showAdvFilter,setShowAdvFilter]= useState(false)

  // 諡・ｽ楢・  const [members,   setMembers]   = useState(getMembers)
  const [newMember, setNewMember] = useState('')

  // 荳諡ｬ險ｭ螳・  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkStatus,   setBulkStatus]   = useState('')
  const [bulkType,     setBulkType]     = useState('filtered') // filtered|chain|pref|city

  const saveTimer = useRef(null)

  // 笏笏 繝・・繧ｿ蜿門ｾ・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: phData } = await supabase.from('pharmacies').select('*').order('pref').range(0, 4999)
      const { data: crData } = await supabase.from('call_records').select('*').range(0, 4999)
      const ph = phData?.length ? phData : SAMPLE_PHARMACIES
      setPharmacies(ph)
      const callMap = {}
      ph.forEach(p => { callMap[p.id] = makeCall() })
      crData?.forEach(r => { callMap[r.pharmacy_id] = { ...makeCall(), ...r } })
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

  // 笏笏 豢ｾ逕溘ョ繝ｼ繧ｿ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const prefs = useMemo(() =>
    ['蜈ｨ縺ｦ', ...Array.from(new Set(pharmacies.map(p=>p.pref).filter(Boolean))).sort()], [pharmacies])

  const cities = useMemo(() => {
    if (fPref === '蜈ｨ縺ｦ') return ['蜈ｨ縺ｦ']
    return ['蜈ｨ縺ｦ', ...Array.from(new Set(pharmacies.filter(p=>p.pref===fPref).map(p=>p.city).filter(Boolean))).sort()]
  }, [pharmacies, fPref])

  const chains = useMemo(() =>
    Array.from(new Set(pharmacies.map(p=>p.chain).filter(Boolean))).sort(), [pharmacies])

  const filtered = useMemo(() => pharmacies.filter(p => {
    const c = calls[p.id]
    if (!c) return false
    if (fStatus !== '蜈ｨ縺ｦ' && c.status !== fStatus) return false
    if (fPref   !== '蜈ｨ縺ｦ' && p.pref   !== fPref)   return false
    if (fCity   !== '蜈ｨ縺ｦ' && p.city   !== fCity)   return false
    if (fMember !== '蜈ｨ縺ｦ' && c.assignee !== fMember) return false
    if (fText && ![p.name,p.addr,p.phone,p.chain,p.rep].some(v=>v&&v.includes(fText))) return false
    if (fChain && !(p.chain||'').includes(fChain)) return false
    if (fRep   && !(p.rep||'').includes(fRep))     return false
    if (fRxMin && (Number(p.rx_count)||0) < Number(fRxMin)) return false
    return true
  }), [pharmacies, calls, fStatus, fPref, fCity, fMember, fText, fChain, fRep, fRxMin])

  const stats = useMemo(() => {
    const total = pharmacies.length
    const cnt = Object.fromEntries(Object.keys(ACTIVE_STATUSES).map(s=>[s,0]))
    Object.values(calls).forEach(c => { if(c && cnt[c.status] !== undefined) cnt[c.status]=(cnt[c.status]||0)+1 })
    return { total, cnt }
  }, [pharmacies, calls])

  const donePct = Math.round(
    Object.entries(stats.cnt).filter(([s])=>s!=='譛ｪ逹謇・).reduce((a,[,v])=>a+v,0)
    / Math.max(stats.total,1) * 100
  )

  // 笏笏 繧｢繧ｯ繧ｷ繝ｧ繝ｳ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const setStatus = useCallback(async (id, status) => {
    const lastCall = ['譫ｶ髮ｻ貂・,'謚倥ｊ霑斐＠蠕・■'].includes(status)
      ? new Date().toISOString().slice(0,10) : calls[id]?.last_call
    setCalls(prev => ({ ...prev, [id]: { ...prev[id], status, last_call:lastCall } }))
    await supabase.from('call_records').upsert({
      pharmacy_id:id, status, last_call:lastCall,
      assignee:calls[id]?.assignee||'譛ｪ蜑ｲ蠖・, updated_by:user.id,
    }, { onConflict:'pharmacy_id' })
    await supabase.from('call_history').insert({ pharmacy_id:id, status, assignee:calls[id]?.assignee, created_by:user.id })
  }, [calls, user])

  const setAssignee = useCallback(async (id, assignee) => {
    setCalls(prev => ({ ...prev, [id]: { ...prev[id], assignee } }))
    await supabase.from('call_records').upsert({
      pharmacy_id:id, assignee, status:calls[id]?.status||'譛ｪ逹謇・, updated_by:user.id,
    }, { onConflict:'pharmacy_id' })
  }, [calls, user])

  // 蛟句挨繝ｭ繝・け蛻・ｊ譖ｿ縺・  const toggleLock = useCallback(async (id) => {
    const locked = !calls[id]?.locked
    setCalls(prev => ({ ...prev, [id]: { ...prev[id], locked } }))
    await supabase.from('call_records').upsert({
      pharmacy_id:id, locked, status:calls[id]?.status||'譛ｪ逹謇・,
      assignee:calls[id]?.assignee||'譛ｪ蜑ｲ蠖・, updated_by:user.id,
    }, { onConflict:'pharmacy_id' })
  }, [calls, user])

  const saveMemo = useCallback(() => {
    if (!sel) return
    setCalls(prev => ({ ...prev, [sel]: { ...prev[sel], memo:eMemo, next_action:eNext } }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('call_records').upsert({
        pharmacy_id:sel, memo:eMemo, next_action:eNext,
        status:calls[sel]?.status||'譛ｪ逹謇・, assignee:calls[sel]?.assignee||'譛ｪ蜑ｲ蠖・, updated_by:user.id,
      }, { onConflict:'pharmacy_id' })
    }, 300)
  }, [sel, eMemo, eNext, calls, user])

  // 笏笏 荳諡ｬ險ｭ螳・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  const executeBulk = useCallback(async () => {
    if (!bulkAssignee && !bulkStatus) return

    // 蟇ｾ雎｡繝ｪ繧ｹ繝域ｱｺ螳夲ｼ医Ο繝・け貂医∩縺ｯ髯､螟厄ｼ・    const targets = filtered.filter(p => !calls[p.id]?.locked)

    if (!targets.length) { alert('蟇ｾ雎｡縺後≠繧翫∪縺帙ｓ・亥・縺ｦ繝ｭ繝・け貂医∩・・); return }

    const confirmed = window.confirm(`${targets.length.toLocaleString()}莉ｶ縺ｫ荳諡ｬ險ｭ螳壹＠縺ｾ縺吶ゅｈ繧阪＠縺・〒縺吶°・歔)
    if (!confirmed) return

    // 繝ｭ繝ｼ繧ｫ繝ｫ蜊ｳ譎ょ渚譏
    setCalls(prev => {
      const next = { ...prev }
      targets.forEach(p => {
        next[p.id] = {
          ...next[p.id],
          ...(bulkAssignee ? { assignee: bulkAssignee } : {}),
          ...(bulkStatus   ? { status:   bulkStatus   } : {}),
        }
      })
      return next
    })

    // DB菫晏ｭ假ｼ医ヰ繝・メ500莉ｶ・・    const BATCH = 500
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH).map(p => ({
        pharmacy_id: p.id,
        assignee: bulkAssignee || calls[p.id]?.assignee || '譛ｪ蜑ｲ蠖・,
        status:   bulkStatus   || calls[p.id]?.status   || '譛ｪ逹謇・,
        memo:     calls[p.id]?.memo || '',
        next_action: calls[p.id]?.next_action || '',
        updated_by: user.id,
      }))
      await supabase.from('call_records').upsert(batch, { onConflict:'pharmacy_id' })
    }

    setShowBulk(false)
    setBulkAssignee(''); setBulkStatus('')
    alert('荳諡ｬ險ｭ螳壹′螳御ｺ・＠縺ｾ縺励◆')
  }, [filtered, calls, bulkAssignee, bulkStatus, user])

  const addMember    = () => { if(!newMember.trim())return; const u=[...members,newMember.trim()]; setMembers(u);saveMembers(u);setNewMember('') }
  const removeMember = m => { const u=members.filter(x=>x!==m); setMembers(u);saveMembers(u) }
  const logout       = () => supabase.auth.signOut()

  const hasAdvFilter = fChain || fRep || fRxMin

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#080e1a', display:'flex', alignItems:'center', justifyContent:'center', color:'#3b5280', fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:36, marginBottom:12 }}>抽</div><div>隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div></div>
    </div>
  )

  return (
    <div style={{ fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif", background:'#080e1a', minHeight:'100vh', color:'#c8d4e8' }}>

      {/* 繝倥ャ繝繝ｼ */}
      <header style={{ background:'linear-gradient(180deg,#0d1829,#080e1a)', borderBottom:'1px solid #1a2744', position:'sticky', top:0, zIndex:50, padding:isMobile?'0 12px':'0 20px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:isMobile?48:54 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>抽</div>
            <div>
              <div style={{ fontSize:isMobile?13:15, fontWeight:800, color:'#e8f0ff', letterSpacing:'0.06em' }}>PHARMA<span style={{ color:'#3b82f6' }}>CRM</span></div>
              {!isMobile && <div style={{ fontSize:9, color:'#3b5280', letterSpacing:'0.12em' }}>蜈ｨ蝗ｽ阮ｬ螻譫ｶ髮ｻ邂｡逅・/div>}
            </div>
          </div>

          {isMobile ? (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'#3b5280' }}>{stats.total.toLocaleString()}莉ｶ</span>
              <button onClick={()=>setShowMenu(!showMenu)} style={{ background:'none', border:'1px solid #1a2744', borderRadius:6, color:'#94a3b8', padding:'5px 9px', cursor:'pointer', fontSize:16 }}>笘ｰ</button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              {[['list','搭 譫ｶ髮ｻ繝ｪ繧ｹ繝・],['dashboard','投 繝繝・す繝･繝懊・繝・]].map(([t,l])=>(
                <button key={t} onClick={()=>setTab(t)} style={{ padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, background:tab===t?'linear-gradient(135deg,#1d6aeb,#7c3aed)':'transparent', color:tab===t?'#fff':'#4a6490' }}>{l}</button>
              ))}
              <div style={{ width:1, height:20, background:'#1a2744' }}/>
              <button onClick={()=>setShowImport(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#4a8aff' }}>踏 蜿冶ｾｼ</button>
              <button onClick={()=>exportCSV(filtered,calls)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#34d399' }}>豆 蜃ｺ蜉・/button>
              <button onClick={()=>setShowBulk(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #f59e0b44', cursor:'pointer', fontSize:11, fontWeight:700, background:'rgba(245,158,11,0.1)', color:'#f59e0b' }}>笞｡ 荳諡ｬ險ｭ螳・/button>
              <button onClick={()=>setShowSettings(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#94a3b8' }}>笞呻ｸ・/button>
              <span style={{ fontSize:11, color:'#3b5280', padding:'4px 10px', borderRadius:6, background:'#0d1829', border:'1px solid #1a2744' }}>{stats.total.toLocaleString()}莉ｶ</span>
              <button onClick={logout} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:10, fontWeight:700, background:'transparent', color:'#3b5280' }}>繝ｭ繧ｰ繧｢繧ｦ繝・/button>
            </div>
          )}
        </div>

        {/* 繝｢繝舌う繝ｫ繝峨Ο繝ｯ繝ｼ */}
        {isMobile && showMenu && (
          <div style={{ borderTop:'1px solid #1a2744', padding:'8px 0' }}>
            {[['list','搭 譫ｶ髮ｻ繝ｪ繧ｹ繝・],['dashboard','投 繝繝・す繝･繝懊・繝・]].map(([t,l])=>(
              <button key={t} onClick={()=>{setTab(t);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:tab===t?'rgba(29,106,235,0.15)':'transparent', color:tab===t?'#60a5fa':'#94a3b8', textAlign:'left' }}>{l}</button>
            ))}
            <div style={{ height:1, background:'#1a2744', margin:'4px 0' }}/>
            <button onClick={()=>{setShowImport(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#4a8aff', textAlign:'left' }}>踏 CSV蜿冶ｾｼ</button>
            <button onClick={()=>{exportCSV(filtered,calls);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#34d399', textAlign:'left' }}>豆 蜃ｺ蜉・/button>
            <button onClick={()=>{setShowBulk(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#f59e0b', textAlign:'left' }}>笞｡ 荳諡ｬ險ｭ螳・/button>
            <button onClick={()=>{setShowSettings(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#94a3b8', textAlign:'left' }}>笞呻ｸ・諡・ｽ楢・ｨｭ螳・/button>
            <button onClick={logout} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#ef4444', textAlign:'left' }}>坎 繝ｭ繧ｰ繧｢繧ｦ繝・/button>
          </div>
        )}

        {/* 騾ｲ謐励ヰ繝ｼ */}
        <div style={{ padding:'5px 0 6px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:9, color:'#3b5280', fontWeight:700, whiteSpace:'nowrap' }}>騾ｲ謐・{donePct}%</span>
          <div style={{ flex:1, height:3, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
            <div style={{ width:`${donePct}%`, height:'100%', background:'linear-gradient(90deg,#1d6aeb,#7c3aed,#10b981)', transition:'width 0.6s' }}/>
          </div>
          <span style={{ fontSize:9, color:'#475569', whiteSpace:'nowrap' }}>謌千ｴ・{stats.cnt['謌千ｴ・]||0}</span>
        </div>
      </header>

      {tab === 'dashboard'
        ? <Dashboard stats={stats} calls={calls} pharmacies={pharmacies} members={members} isMobile={isMobile}/>
        : isMobile
          ? <MobileList {...{pharmacies,calls,stats,filtered,fStatus,setFStatus,fPref,setFPref,fCity,setFCity,fMember,setFMember,fText,setFText,fChain,setFChain,fRep,setFRep,fRxMin,setFRxMin,prefs,cities,members,sel,setSel,selectedP,selectedC,eMemo,setEMemo,eNext,setENext,setStatus,setAssignee,saveMemo,toggleLock,hasAdvFilter,showAdvFilter,setShowAdvFilter}}/>
          : <DesktopList {...{pharmacies,calls,stats,filtered,fStatus,setFStatus,fPref,setFPref,fCity,setFCity,fMember,setFMember,fText,setFText,fChain,setFChain,fRep,setFRep,fRxMin,setFRxMin,prefs,cities,members,sel,setSel,selectedP,selectedC,eMemo,setEMemo,eNext,setENext,setStatus,setAssignee,saveMemo,toggleLock,hasAdvFilter,showAdvFilter,setShowAdvFilter}}/>
      }

      {showImport && <ImportModal onClose={()=>setShowImport(false)} onDone={()=>{setShowImport(false);fetchData()}}/>}

      {/* 荳諡ｬ險ｭ螳壹Δ繝ｼ繝繝ｫ */}
      {showBulk && (
        <Modal onClose={()=>setShowBulk(false)} title="笞｡ 荳諡ｬ險ｭ螳・>
          <div style={{ fontSize:12, color:'#4a6490', marginBottom:16, padding:'8px 12px', borderRadius:8, background:'#080e1a', border:'1px solid #1a2744' }}>
            迴ｾ蝨ｨ縺ｮ邨槭ｊ霎ｼ縺ｿ譚｡莉ｶ縺ｫ荳閾ｴ縺吶ｋ <span style={{ color:'#f59e0b', fontWeight:800 }}>{filtered.filter(p=>!calls[p.id]?.locked).length.toLocaleString()}莉ｶ</span>・医Ο繝・け髯､螟厄ｼ峨↓驕ｩ逕ｨ縺励∪縺・          </div>

          <Lbl>諡・ｽ楢・ｒ荳諡ｬ險ｭ螳・/Lbl>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
            <button onClick={()=>setBulkAssignee('')} style={{ padding:'6px 12px', borderRadius:6, border:`1.5px solid ${bulkAssignee===''?'#475569':'#1a2744'}`, background:bulkAssignee===''?'rgba(71,85,105,0.2)':'transparent', color:bulkAssignee===''?'#94a3b8':'#3b5280', fontSize:12, fontWeight:700, cursor:'pointer' }}>螟画峩縺励↑縺・/button>
            {members.filter(m=>m!=='譛ｪ蜑ｲ蠖・).map(m=>(
              <button key={m} onClick={()=>setBulkAssignee(bulkAssignee===m?'':m)} style={{ padding:'6px 12px', borderRadius:6, border:`1.5px solid ${bulkAssignee===m?'#1d6aeb':'#1a2744'}`, background:bulkAssignee===m?'rgba(29,106,235,0.2)':'transparent', color:bulkAssignee===m?'#60a5fa':'#3b5280', fontSize:12, fontWeight:700, cursor:'pointer' }}>{m}</button>
            ))}
          </div>

          <Lbl>繧ｹ繝・・繧ｿ繧ｹ繧剃ｸ諡ｬ險ｭ螳・/Lbl>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
            <button onClick={()=>setBulkStatus('')} style={{ padding:'6px 12px', borderRadius:6, border:`1.5px solid ${bulkStatus===''?'#475569':'#1a2744'}`, background:bulkStatus===''?'rgba(71,85,105,0.2)':'transparent', color:bulkStatus===''?'#94a3b8':'#3b5280', fontSize:12, fontWeight:700, cursor:'pointer' }}>螟画峩縺励↑縺・/button>
            {Object.entries(ACTIVE_STATUSES).map(([s,c])=>(
              <button key={s} onClick={()=>setBulkStatus(bulkStatus===s?'':s)} style={{ padding:'6px 12px', borderRadius:6, border:`1.5px solid ${bulkStatus===s?c.color:'#1a2744'}`, background:bulkStatus===s?c.bg:'transparent', color:bulkStatus===s?c.bright:'#3b5280', fontSize:12, fontWeight:700, cursor:'pointer' }}>{STATUS_ICONS[s]} {s}</button>
            ))}
          </div>

          <button onClick={executeBulk} disabled={!bulkAssignee && !bulkStatus} style={{ width:'100%', padding:12, borderRadius:8, border:'none', background:(!bulkAssignee&&!bulkStatus)?'#1a2744':'linear-gradient(135deg,#f59e0b,#ef4444)', color:'#fff', fontSize:13, fontWeight:800, cursor:(!bulkAssignee&&!bulkStatus)?'not-allowed':'pointer' }}>
            笞｡ 荳諡ｬ險ｭ螳壹ｒ螳溯｡・          </button>
        </Modal>
      )}

      {/* 諡・ｽ楢・ｨｭ螳壹Δ繝ｼ繝繝ｫ */}
      {showSettings && (
        <Modal onClose={()=>setShowSettings(false)} title="笞呻ｸ・諡・ｽ楢・ｨｭ螳・>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16, maxHeight:260, overflowY:'auto' }}>
            {members.filter(m=>m!=='譛ｪ蜑ｲ蠖・).map(m=>(
              <div key={m} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:8, background:'#1a2744' }}>
                <span style={{ fontSize:14, color:'#c8d4e8', fontWeight:600 }}>{m}</span>
                <button onClick={()=>removeMember(m)} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:18 }}>笨・/button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <input value={newMember} onChange={e=>setNewMember(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addMember()} placeholder="諡・ｽ楢・錐繧貞・蜉・
              style={{ flex:1, padding:'10px 12px', borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none' }}/>
            <button onClick={addMember} style={{ padding:'10px 16px', borderRadius:8, border:'none', background:'#1d6aeb', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>霑ｽ蜉</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// 笏≫煤 邨槭ｊ霎ｼ縺ｿ繝代ロ繝ｫ・郁ｩｳ邏ｰ・・笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏・function AdvFilter({ fChain, setFChain, fRep, setFRep, fRxMin, setFRxMin, chains, onClose }) {
  return (
    <div style={{ padding:'12px 14px', background:'#0b1221', borderBottom:'1px solid #1a2744' }}>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <input value={fChain} onChange={e=>setFChain(e.target.value)} placeholder="遉ｾ蜷阪〒邨槭ｊ霎ｼ縺ｿ"
          style={{ flex:1, minWidth:140, padding:'6px 10px', borderRadius:6, border:`1px solid ${fChain?'#3b82f6':'#1a2744'}`, background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none' }}/>
        <input value={fRep} onChange={e=>setFRep(e.target.value)} placeholder="莉｣陦ｨ閠・錐縺ｧ邨槭ｊ霎ｼ縺ｿ"
          style={{ flex:1, minWidth:140, padding:'6px 10px', borderRadius:6, border:`1px solid ${fRep?'#3b82f6':'#1a2744'}`, background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:11, color:'#3b5280', whiteSpace:'nowrap' }}>蜃ｦ譁ｹ邂・/span>
          <input value={fRxMin} onChange={e=>setFRxMin(e.target.value)} placeholder="譫壻ｻ･荳・ type="number"
            style={{ width:80, padding:'6px 8px', borderRadius:6, border:`1px solid ${fRxMin?'#3b82f6':'#1a2744'}`, background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none' }}/>
          <span style={{ fontSize:11, color:'#3b5280' }}>譫壻ｻ･荳・/span>
        </div>
        <button onClick={()=>{setFChain('');setFRep('');setFRxMin('');onClose()}} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #334155', background:'transparent', color:'#64748b', fontSize:11, cursor:'pointer' }}>繧ｯ繝ｪ繧｢</button>
      </div>
    </div>
  )
}

// 笏≫煤 繝｢繝舌う繝ｫ繝ｪ繧ｹ繝・笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏・function MobileList({ calls, stats, filtered, fStatus, setFStatus, fPref, setFPref, fCity, setFCity, fMember, setFMember, fText, setFText, fChain, setFChain, fRep, setFRep, fRxMin, setFRxMin, prefs, cities, members, sel, setSel, selectedP, selectedC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo, toggleLock, hasAdvFilter, showAdvFilter, setShowAdvFilter }) {

  if (sel && selectedP && selectedC) {
    const st = ACTIVE_STATUSES[selectedC.status] || ACTIVE_STATUSES['譛ｪ逹謇・]
    return (
      <div style={{ minHeight:'calc(100vh - 80px)', background:'#0b1221' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #1a2744', display:'flex', alignItems:'center', gap:10, background:'#0d1829', position:'sticky', top:isMobileTop(), zIndex:10 }}>
          <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:'#60a5fa', cursor:'pointer', fontSize:15, fontWeight:700, padding:0 }}>竊・謌ｻ繧・/button>
          <div style={{ fontSize:13, fontWeight:700, color:'#e8f0ff', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selectedP.name}</div>
          <button onClick={()=>toggleLock(sel)} style={{ background:'none', border:`1px solid ${selectedC.locked?'#f59e0b':'#334155'}`, borderRadius:6, color:selectedC.locked?'#f59e0b':'#475569', cursor:'pointer', fontSize:13, padding:'4px 8px', fontWeight:700 }}>
            {selectedC.locked ? '白' : '箔'}
          </button>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ padding:14, borderRadius:10, background:'#1a2744' }}>
            {selectedP.chain && <div style={{ fontSize:10, color:'#3b5280', marginBottom:2 }}>召 {selectedP.chain}</div>}
            {selectedP.rep   && <div style={{ fontSize:10, color:'#3b5280', marginBottom:4 }}>側 {selectedP.rep}</div>}
            <div style={{ fontSize:11, color:'#4a6490', marginBottom:8 }}>桃 {selectedP.addr}</div>
            <a href={`tel:${selectedP.phone}`} style={{ fontSize:18, color:'#60a5fa', fontWeight:800, textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
              <span>到</span><span>{selectedP.phone||'窶・}</span>
            </a>
            <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
              {selectedP.rx_count      && <span style={{ padding:'3px 8px', borderRadius:4, background:'rgba(16,185,129,0.15)', color:'#34d399', fontSize:11, fontWeight:700 }}>抽 {Number(selectedP.rx_count).toLocaleString()}譫・/span>}
              {selectedP.concentration && <span style={{ padding:'3px 8px', borderRadius:4, background:'rgba(245,158,11,0.15)', color:'#fbbf24', fontSize:11, fontWeight:700 }}>投 髮・ｸｭ邇・{selectedP.concentration}%</span>}
            </div>
          </div>

          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>繧ｹ繝・・繧ｿ繧ｹ</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {Object.entries(ACTIVE_STATUSES).map(([s,c])=>{
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

          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>諡・ｽ楢・/div>
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

          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>谺｡蝗槭い繧ｯ繧ｷ繝ｧ繝ｳ</div>
            <input value={eNext} onChange={e=>setENext(e.target.value)} placeholder="萓具ｼ壽擂騾ｱ譛域屆縺ｫ蜀肴楔髮ｻ"
              style={{ width:'100%', padding:'12px', borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
          </div>

          <div>
            <div style={{ fontSize:10, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:10 }}>譫ｶ髮ｻ繝｡繝｢</div>
            <textarea value={eMemo} onChange={e=>setEMemo(e.target.value)} rows={5} placeholder="譫ｶ髮ｻ蜀・ｮｹ繝ｻ諡・ｽ楢・錐縺ｪ縺ｩ..."
              style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none', resize:'none', boxSizing:'border-box', fontFamily:'inherit' }}/>
          </div>

          <button onClick={saveMemo} style={{ padding:16, borderRadius:10, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:15, fontWeight:800, cursor:'pointer', marginBottom:32 }}>
            沈縲菫晏ｭ倥☆繧・          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)' }}>
      <div style={{ padding:'10px 12px', background:'#0b1221', borderBottom:'1px solid #1a2744' }}>
        <div style={{ position:'relative', marginBottom:8 }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#2a3d60' }}>剥</span>
          <input value={fText} onChange={e=>setFText(e.target.value)} placeholder="阮ｬ螻蜷阪・菴乗園繝ｻ髮ｻ隧ｱ逡ｪ蜿ｷ繝ｻ遉ｾ蜷・
            style={{ width:'100%', padding:'10px 10px 10px 32px', borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none', boxSizing:'border-box' }}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[{v:fStatus,s:setFStatus,o:['蜈ｨ縺ｦ',...Object.keys(ACTIVE_STATUSES)]},{v:fPref,s:setFPref,o:prefs},{v:fMember,s:setFMember,o:['蜈ｨ縺ｦ',...members]}].map((item,i)=>(
            <select key={i} value={item.v} onChange={e=>item.s(e.target.value)} style={{ flex:1, padding:'8px 4px', borderRadius:7, border:'1px solid #1a2744', background:'#080e1a', color:'#7ab3ff', fontSize:11, outline:'none' }}>
              {item.o.map(o=><option key={o}>{o}</option>)}
            </select>
          ))}
          <button onClick={()=>setShowAdvFilter(!showAdvFilter)} style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${hasAdvFilter?'#3b82f6':'#1a2744'}`, background:hasAdvFilter?'rgba(59,130,246,0.15)':'transparent', color:hasAdvFilter?'#60a5fa':'#3b5280', fontSize:11, cursor:'pointer', fontWeight:700 }}>
            {hasAdvFilter?'鳩':'笞呻ｸ・}
          </button>
        </div>
      </div>

      {showAdvFilter && <AdvFilter {...{fChain,setFChain,fRep,setFRep,fRxMin,setFRxMin,onClose:()=>setShowAdvFilter(false)}}/>}

      <div style={{ padding:'7px 12px', background:'#080e1a', borderBottom:'1px solid #1a2744', display:'flex', gap:5, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        <button onClick={()=>setFStatus('蜈ｨ縺ｦ')} style={{ padding:'5px 11px', borderRadius:99, border:`1px solid ${fStatus==='蜈ｨ縺ｦ'?'#4a6490':'#1a2744'}`, background:fStatus==='蜈ｨ縺ｦ'?'rgba(74,100,144,0.2)':'transparent', color:fStatus==='蜈ｨ縺ｦ'?'#94a3b8':'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>蜈ｨ縺ｦ {stats.total}</button>
        {Object.entries(ACTIVE_STATUSES).map(([s,c])=>(
          <button key={s} onClick={()=>setFStatus(fStatus===s?'蜈ｨ縺ｦ':s)} style={{ padding:'5px 11px', borderRadius:99, border:`1px solid ${fStatus===s?c.color:'#1a2744'}`, background:fStatus===s?c.bg:'transparent', color:fStatus===s?c.bright:'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
            {STATUS_ICONS[s]} {s} {stats.cnt[s]||0}
          </button>
        ))}
      </div>

      <div style={{ padding:'5px 12px', background:'#080e1a', borderBottom:'1px solid #0d1829' }}>
        <span style={{ fontSize:11, color:'#2a3d60' }}>{filtered.length.toLocaleString()} 莉ｶ</span>
      </div>

      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
        {filtered.map(p=>{
          const c = calls[p.id] || makeCall()
          const st = ACTIVE_STATUSES[c.status] || ACTIVE_STATUSES['譛ｪ逹謇・]
          return (
            <div key={p.id} onClick={()=>setSel(p.id)}
              style={{ padding:'13px 16px', borderBottom:'1px solid #0d1829', background:'#080e1a', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:4, height:48, borderRadius:99, background:st.color, flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#e8f0ff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                    {c.locked && <span style={{ fontSize:10, marginRight:4 }}>白</span>}{p.name}
                  </div>
                  <span style={{ padding:'3px 8px', borderRadius:4, background:st.bg, color:st.bright, fontSize:10, fontWeight:700, border:`1px solid ${st.color}44`, marginLeft:8, flexShrink:0 }}>{STATUS_ICONS[c.status]} {c.status}</span>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:12, color:'#3b5280' }}>{p.pref}</span>
                  <span style={{ fontSize:12, color:'#3b5280', fontFamily:'monospace' }}>{p.phone||'窶・}</span>
                  {c.assignee !== '譛ｪ蜑ｲ蠖・ && <span style={{ fontSize:12, color:'#4a8aff', fontWeight:600 }}>側 {c.assignee}</span>}
                </div>
                {c.next_action && <div style={{ fontSize:11, color:'#f59e0b', marginTop:4 }}>竊・{c.next_action}</div>}
              </div>
              <div style={{ color:'#2a3d60', fontSize:18, flexShrink:0 }}>窶ｺ</div>
            </div>
          )
        })}
        {filtered.length===0 && <div style={{ padding:48, textAlign:'center', color:'#2a3d60', fontSize:13 }}><div style={{ fontSize:28, marginBottom:8 }}>剥</div>譚｡莉ｶ縺ｫ荳閾ｴ縺吶ｋ阮ｬ螻縺後≠繧翫∪縺帙ｓ</div>}
      </div>
    </div>
  )
}

function isMobileTop() { return 48 }

// 笏≫煤 繝・せ繧ｯ繝医ャ繝励Μ繧ｹ繝・笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤
function DesktopList({ calls, stats, filtered, fStatus, setFStatus, fPref, setFPref, fCity, setFCity, fMember, setFMember, fText, setFText, fChain, setFChain, fRep, setFRep, fRxMin, setFRxMin, prefs, cities, members, sel, setSel, selectedP, selectedC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo, toggleLock, hasAdvFilter, showAdvFilter, setShowAdvFilter }) {
  return (
    <div style={{ display:'flex', height:'calc(100vh - 96px)' }}>
      <div style={{ width:selectedP?'55%':'100%', display:'flex', flexDirection:'column', borderRight:'1px solid #1a2744', transition:'width 0.3s' }}>
        {/* 繝｡繧､繝ｳ繝輔ぅ繝ｫ繧ｿ繝ｼ */}
        <div style={{ padding:'10px 14px', background:'#0b1221', borderBottom:'1px solid #1a2744', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ position:'relative', flex:1, minWidth:170 }}>
            <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#2a3d60' }}>剥</span>
            <input value={fText} onChange={e=>setFText(e.target.value)} placeholder="阮ｬ螻蜷阪・菴乗園繝ｻ髮ｻ隧ｱ逡ｪ蜿ｷ繝ｻ遉ｾ蜷阪・莉｣陦ｨ閠・
              style={{ width:'100%', padding:'6px 10px 6px 28px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <select value={fStatus}  onChange={e=>setFStatus(e.target.value)}  style={selStyle}>{['蜈ｨ縺ｦ',...Object.keys(ACTIVE_STATUSES)].map(o=><option key={o}>{o}</option>)}</select>
          <select value={fPref}    onChange={e=>{setFPref(e.target.value);setFCity('蜈ｨ縺ｦ')}} style={selStyle}>{prefs.map(o=><option key={o}>{o}</option>)}</select>
          <select value={fCity}    onChange={e=>setFCity(e.target.value)}    style={selStyle}>{cities.map(o=><option key={o}>{o}</option>)}</select>
          <select value={fMember}  onChange={e=>setFMember(e.target.value)}  style={selStyle}>{['蜈ｨ縺ｦ',...members].map(o=><option key={o}>{o}</option>)}</select>
          <button onClick={()=>setShowAdvFilter(!showAdvFilter)} style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${hasAdvFilter?'#3b82f6':'#1a2744'}`, background:hasAdvFilter?'rgba(59,130,246,0.15)':'transparent', color:hasAdvFilter?'#60a5fa':'#3b5280', fontSize:11, cursor:'pointer', fontWeight:700 }}>
            {hasAdvFilter?'鳩 隧ｳ邏ｰ':'隧ｳ邏ｰ邨櫁ｾｼ'}
          </button>
          <span style={{ fontSize:11, color:'#2a3d60', fontWeight:700 }}>{filtered.length.toLocaleString()}莉ｶ</span>
        </div>

        {/* 隧ｳ邏ｰ繝輔ぅ繝ｫ繧ｿ繝ｼ */}
        {showAdvFilter && <AdvFilter {...{fChain,setFChain,fRep,setFRep,fRxMin,setFRxMin,onClose:()=>setShowAdvFilter(false)}}/>}

        {/* 繧ｹ繝・・繧ｿ繧ｹ繝√ャ繝・*/}
        <div style={{ padding:'6px 14px', background:'#080e1a', borderBottom:'1px solid #1a2744', display:'flex', gap:5, overflowX:'auto' }}>
          <button onClick={()=>setFStatus('蜈ｨ縺ｦ')} style={{ padding:'3px 10px', borderRadius:99, border:`1px solid ${fStatus==='蜈ｨ縺ｦ'?'#4a6490':'#1a2744'}`, background:fStatus==='蜈ｨ縺ｦ'?'rgba(74,100,144,0.2)':'transparent', color:fStatus==='蜈ｨ縺ｦ'?'#94a3b8':'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>蜈ｨ縺ｦ {stats.total}</button>
          {Object.entries(ACTIVE_STATUSES).map(([s,c])=>(
            <button key={s} onClick={()=>setFStatus(fStatus===s?'蜈ｨ縺ｦ':s)} style={{ padding:'3px 10px', borderRadius:99, border:`1px solid ${fStatus===s?c.color:'#1a2744'}`, background:fStatus===s?c.bg:'transparent', color:fStatus===s?c.bright:'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
              {STATUS_ICONS[s]} {s} {stats.cnt[s]||0}
            </button>
          ))}
        </div>

        {/* 繝・・繝悶Ν */}
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#0b1221', position:'sticky', top:0, zIndex:2 }}>
                {['','阮ｬ螻蜷・,'遉ｾ蜷・,'驛ｽ驕灘ｺ懃恁','髮ｻ隧ｱ逡ｪ蜿ｷ','蜃ｦ譁ｹ邂・,'繧ｹ繝・・繧ｿ繧ｹ','諡・ｽ楢・,'譛邨よ楔髮ｻ'].map(h=>(
                  <th key={h} style={{ padding:'8px 8px', textAlign:'left', fontSize:9, fontWeight:700, color:'#2a3d60', borderBottom:'1px solid #1a2744', letterSpacing:'0.1em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p,i)=>{
                const c = calls[p.id] || makeCall()
                const st = ACTIVE_STATUSES[c.status] || ACTIVE_STATUSES['譛ｪ逹謇・]
                const isSel = sel===p.id
                return (
                  <tr key={p.id} onClick={()=>setSel(isSel?null:p.id)} style={{ background:isSel?'rgba(29,106,235,0.12)':i%2===0?'#080e1a':'#090f1c', cursor:'pointer', borderBottom:'1px solid #0d1829' }}>
                    <td style={{ padding:'6px 8px', textAlign:'center' }}>
                      <button onClick={e=>{e.stopPropagation();toggleLock(p.id)}} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:c.locked?'#f59e0b':'#2a3d60', padding:0 }}>
                        {c.locked?'白':'箔'}
                      </button>
                    </td>
                    <td style={{ padding:'7px 8px', fontSize:12, color:isSel?'#7ab3ff':'#c8d4e8', fontWeight:600, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {isSel&&<span style={{ color:'#3b82f6', marginRight:4 }}>笆ｶ</span>}{p.name}
                    </td>
                    <td style={{ padding:'7px 8px', fontSize:11, color:'#4a6490', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.chain||'窶・}</td>
                    <td style={{ padding:'7px 8px', fontSize:11, color:'#4a6490' }}>{p.pref}</td>
                    <td style={{ padding:'7px 8px', fontSize:11, color:'#4a6490', fontFamily:'monospace' }}>{p.phone||'窶・}</td>
                    <td style={{ padding:'7px 8px', fontSize:11, color:'#34d399' }}>{p.rx_count?Number(p.rx_count).toLocaleString():'-'}</td>
                    <td style={{ padding:'7px 8px' }}>
                      <span style={{ padding:'2px 7px', borderRadius:4, background:st.bg, color:st.bright, fontSize:10, fontWeight:700, border:`1px solid ${st.color}44` }}>{STATUS_ICONS[c.status]} {c.status}</span>
                    </td>
                    <td style={{ padding:'7px 8px', fontSize:11, color:c.assignee==='譛ｪ蜑ｲ蠖・?'#2a3d60':'#7ab3ff' }}>{c.assignee}</td>
                    <td style={{ padding:'7px 8px', fontSize:10, color:'#2a3d60' }}>{c.last_call||'窶・}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{ padding:48, textAlign:'center', color:'#2a3d60', fontSize:13 }}><div style={{ fontSize:28, marginBottom:8 }}>剥</div>譚｡莉ｶ縺ｫ荳閾ｴ縺励∪縺帙ｓ</div>}
        </div>
      </div>

      {/* 隧ｳ邏ｰ繝代ロ繝ｫ */}
      {selectedP && selectedC && (
        <div style={{ width:'45%', display:'flex', flexDirection:'column', background:'#0b1221', overflowY:'auto' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid #1a2744' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1, marginRight:10 }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#e8f0ff', marginBottom:4 }}>{selectedP.name}</div>
                {selectedP.chain && <div style={{ fontSize:10, color:'#3b5280', marginBottom:2 }}>召 {selectedP.chain}</div>}
                {selectedP.rep   && <div style={{ fontSize:10, color:'#3b5280', marginBottom:4 }}>側 {selectedP.rep}</div>}
                <div style={{ fontSize:11, color:'#3b5280' }}>桃 {selectedP.addr}</div>
                <div style={{ fontSize:12, color:'#7ab3ff', marginTop:4, fontFamily:'monospace', fontWeight:700 }}>到 {selectedP.phone||'窶・}</div>
                <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
                  {selectedP.rx_count      && <span style={{ padding:'2px 8px', borderRadius:4, background:'rgba(16,185,129,0.15)', color:'#34d399', fontSize:11, fontWeight:700 }}>抽 {Number(selectedP.rx_count).toLocaleString()}譫・/span>}
                  {selectedP.concentration && <span style={{ padding:'2px 8px', borderRadius:4, background:'rgba(245,158,11,0.15)', color:'#fbbf24', fontSize:11, fontWeight:700 }}>投 髮・ｸｭ邇・{selectedP.concentration}%</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <button onClick={()=>toggleLock(sel)} style={{ background:'none', border:`1px solid ${selectedC.locked?'#f59e0b':'#334155'}`, borderRadius:6, color:selectedC.locked?'#f59e0b':'#475569', cursor:'pointer', fontSize:13, padding:'5px 9px', fontWeight:700 }}>
                  {selectedC.locked?'白 繝ｭ繝・け荳ｭ':'箔 繝ｭ繝・け'}
                </button>
                <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:'#2a3d60', cursor:'pointer', fontSize:20 }}>笨・/button>
              </div>
            </div>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:14 }}>
            <Section label="繧ｹ繝・・繧ｿ繧ｹ螟画峩">
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {Object.entries(ACTIVE_STATUSES).map(([s,c])=>{
                  const on = selectedC.status===s
                  return <button key={s} onClick={()=>setStatus(sel,s)} style={{ padding:'5px 10px', borderRadius:5, border:`1.5px solid ${on?c.color:'#1a2744'}`, background:on?c.bg:'transparent', color:on?c.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>{STATUS_ICONS[s]} {s}</button>
                })}
              </div>
            </Section>
            <Section label="諡・ｽ楢・>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {members.map(m=>{
                  const on = selectedC.assignee===m
                  return <button key={m} onClick={()=>setAssignee(sel,m)} style={{ padding:'4px 10px', borderRadius:5, border:`1.5px solid ${on?'#1d6aeb':'#1a2744'}`, background:on?'rgba(29,106,235,0.15)':'transparent', color:on?'#7ab3ff':'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>{m}</button>
                })}
              </div>
            </Section>
            <Section label="谺｡蝗槭い繧ｯ繧ｷ繝ｧ繝ｳ">
              <input value={eNext} onChange={e=>setENext(e.target.value)} placeholder="萓具ｼ壽擂騾ｱ譛域屆縺ｫ蜀肴楔髮ｻ" style={{ width:'100%', padding:'8px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', boxSizing:'border-box' }}/>
            </Section>
            <Section label="譫ｶ髮ｻ繝｡繝｢">
              <textarea value={eMemo} onChange={e=>setEMemo(e.target.value)} rows={4} placeholder="譫ｶ髮ｻ蜀・ｮｹ繝ｻ諡・ｽ楢・錐縺ｪ縺ｩ..." style={{ width:'100%', padding:'8px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
            </Section>
            <button onClick={saveMemo} style={{ padding:'10px', borderRadius:7, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer' }}>沈縲菫晏ｭ倥☆繧・/button>
          </div>
        </div>
      )}
    </div>
  )
}

const selStyle = { padding:'6px 8px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#7ab3ff', fontSize:11, outline:'none', cursor:'pointer' }

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:7, textTransform:'uppercase' }}>{label}</div>
      {children}
    </div>
  )
}

function Lbl({ children }) {
  return <div style={{ fontSize:11, color:'#4a6490', fontWeight:700, marginBottom:8 }}>{children}</div>
}

function Modal({ onClose, title, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16, backdropFilter:'blur(4px)' }}>
      <div style={{ background:'#0d1829', borderRadius:14, padding:24, width:'100%', maxWidth:520, border:'1px solid #1a2744', maxHeight:'90vh', overflowY:'auto', fontFamily:"'Noto Sans JP',sans-serif" }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff', marginBottom:16 }}>{title}</div>
        {children}
        <button onClick={onClose} style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #1a2744', background:'transparent', color:'#4a6490', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 }}>髢峨§繧・/button>
      </div>
    </div>
  )
}

// 笏≫煤 繝繝・す繝･繝懊・繝・笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏≫煤笏・function Dashboard({ stats, calls, pharmacies, members, isMobile }) {
  const memberStats = useMemo(() => {
    const r = {}
    members.forEach(m => { r[m] = { total:0, ...Object.fromEntries(Object.keys(ACTIVE_STATUSES).map(s=>[s,0])) } })
    Object.values(calls).forEach(c => { if(c&&r[c.assignee]){r[c.assignee].total++;if(r[c.assignee][c.status]!==undefined)r[c.assignee][c.status]++} })
    return r
  }, [calls, members])

  const prefStats = useMemo(() => {
    const r = {}
    pharmacies.forEach(p => {
      if(!r[p.pref])r[p.pref]={total:0,done:0}
      r[p.pref].total++
      const c=calls[p.id]
      if(c&&c.status!=='譛ｪ逹謇・)r[p.pref].done++
    })
    return Object.entries(r).sort((a,b)=>b[1].total-a[1].total).slice(0,10)
  }, [pharmacies, calls])

  return (
    <div style={{ padding:isMobile?12:20, overflowY:'auto', height:`calc(100vh - ${isMobile?80:96}px)`, display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff' }}>投 繝繝・す繝･繝懊・繝・/div>

      <div style={{ display:'grid', gridTemplateColumns:isMobile?'repeat(3,1fr)':'repeat(auto-fit,minmax(130px,1fr))', gap:8 }}>
        {Object.entries(ACTIVE_STATUSES).map(([s,c])=>(
          <div key={s} style={{ padding:isMobile?'10px 8px':'14px', borderRadius:9, background:'#0b1221', border:`1px solid ${c.color}30`, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${c.color},transparent)` }}/>
            <div style={{ fontSize:isMobile?18:22, fontWeight:900, color:c.bright }}>{stats.cnt[s]||0}</div>
            <div style={{ fontSize:isMobile?9:11, color:'#4a6490', marginTop:2 }}>{STATUS_ICONS[s]} {s}</div>
            <div style={{ fontSize:9, color:'#2a3d60', marginTop:2 }}>{Math.round((stats.cnt[s]||0)/Math.max(stats.total,1)*100)}%</div>
          </div>
        ))}
      </div>

      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>則 諡・ｽ楢・挨騾ｲ謐・/div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:360 }}>
            <thead><tr style={{ background:'#080e1a' }}>
              <th style={{ padding:'7px 12px', textAlign:'left', fontSize:9, color:'#2a3d60', fontWeight:700 }}>諡・ｽ楢・/th>
              <th style={{ padding:'7px 8px', textAlign:'center', fontSize:9, color:'#2a3d60' }}>蜷郁ｨ・/th>
              {Object.entries(ACTIVE_STATUSES).map(([s,c])=><th key={s} style={{ padding:'7px 5px', textAlign:'center', fontSize:9, color:c.bright }}>{STATUS_ICONS[s]}</th>)}
            </tr></thead>
            <tbody>
              {members.map((m,i)=>(
                <tr key={m} style={{ borderTop:'1px solid #1a2744', background:i%2===0?'#0b1221':'#080e1a' }}>
                  <td style={{ padding:'9px 12px', fontSize:12, color:m==='譛ｪ蜑ｲ蠖・?'#2a3d60':'#c8d4e8', fontWeight:700 }}>{m}</td>
                  <td style={{ padding:'9px 8px', textAlign:'center', fontSize:12, color:'#7ab3ff', fontWeight:800 }}>{memberStats[m]?.total||0}</td>
                  {Object.entries(ACTIVE_STATUSES).map(([s,c])=>(
                    <td key={s} style={{ padding:'9px 5px', textAlign:'center', fontSize:12, color:c.bright }}>{memberStats[m]?.[s]||0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>寮 驛ｽ驕灘ｺ懃恁蛻･騾ｲ謐・/div>
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
          {prefStats.map(([pref,s])=>{
            const pct=Math.round(s.done/Math.max(s.total,1)*100)
            return(
              <div key={pref} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:isMobile?70:90, fontSize:11, color:'#7ab3ff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flexShrink:0 }}>{pref}</div>
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

