import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUSES, STATUS_ICONS, STATUS_GROUPS, getMembers, saveMembers } from '../lib/constants'
import ImportModal from '../components/ImportModal'
import * as XLSX from 'xlsx'

const PAGE = 100
const PREFS = ['全て','北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']

function useIsMobile() {
  const [v, setV] = useState(window.innerWidth < 768)
  useEffect(() => { const f = () => setV(window.innerWidth < 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return v
}

// 定型フォーマット出力（送付先リスト）
function exportFormatExcel(filtered) {
  const headers = ['開設者氏名（会社名）','薬局名','社長名','患者数','電話番号','アプローチ状況','薬剤師','管理者氏名','住所','URL','電話番号','郵便番号','店舗数','社長名（スペース削除）','役職','TC結果']
  const rows = filtered.map(({ p, c }) => [
    p.chain || '',    // 開設者氏名
    p.name  || '',    // 薬局名
    p.rep   || '',    // 社長名
    p.rx_count || '', // 患者数
    p.phone || '',    // 電話番号
    c.status || '',   // アプローチ状況
    '',               // 薬剤師
    '',               // 管理者氏名
    p.addr  || '',    // 住所
    '',               // URL
    p.phone || '',    // 電話番号（2）
    p.zip   || '',    // 郵便番号
    '',               // 店舗数
    (p.rep||'').replace(/\s/g,''), // 社長名スペース削除
    '',               // 役職
    c.memo  || '',    // TC結果
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map((_,i) => ({ wch: [20,20,12,8,14,12,8,12,30,20,14,12,8,14,8,20][i]||12 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '貼付けシート')
  XLSX.writeFile(wb, '送付先リスト.xlsx')
}

// 通常CSV出力
function exportCSV(filtered) {
  const rows = [['会社名','代表者','薬局名','郵便番号','住所','電話番号','処方箋枚数','ステータス','担当者','最終架電','次回アクション','メモ']]
  filtered.forEach(({ p, c }) => rows.push([p.chain||'',p.rep||'',p.name,p.zip||'',p.addr,p.phone,p.rx_count||'',c.status,c.assignee,c.last_call||'',c.next_action||'',c.memo||'']))
  const csv = rows.map(r=>r.map(v=>`"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const a = document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'})); a.download='架電リスト.csv'; a.click()
}

export default function App({ user }) {
  const isMobile = useIsMobile()
  const [allData,    setAllData]    = useState([])
  const [loadPct,    setLoadPct]    = useState(0)
  const [ready,      setReady]      = useState(false)
  const [fText,      setFText]      = useState('')
  const [fStatus,    setFStatus]    = useState('')
  const [fPref,      setFPref]      = useState('')
  const [fCity,      setFCity]      = useState('')
  const [fMember,    setFMember]    = useState('')
  const [fChain,     setFChain]     = useState('')
  const [fRxMin,     setFRxMin]     = useState('')
  const [page,       setPage]       = useState(0)
  const [sel,        setSel]        = useState(null)
  const [tab,        setTab]        = useState('list')
  const [eMemo,      setEMemo]      = useState('')
  const [eNext,      setENext]      = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showSettings,setShowSettings] = useState(false)
  const [showBulk,   setShowBulk]   = useState(false)
  const [showMenu,   setShowMenu]   = useState(false)
  const [showAdv,    setShowAdv]    = useState(false)
  const [members,    setMembers]    = useState([])
  const [newMember,  setNewMember]  = useState('')
  const [memberColors, setMemberColors] = useState({})
  const [bulkAssignee,setBulkAssignee] = useState('')
  const [bulkStatus,  setBulkStatus]   = useState('')
  const [bulkLock,    setBulkLock]     = useState('')
  const saveTimer = useRef(null)

  // Supabaseからメンバーリストを取得
  useEffect(() => {
    supabase.from('members').select('name,color').order('id').then(({ data }) => {
      if (data?.length) {
        setMembers(['未割当', ...data.map(m => m.name)])
        const colors = {}
        data.forEach(m => { colors[m.name] = m.color })
        setMemberColors(colors)
      }
    })
  }, [])

  // バックグラウンドで全データ読込
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const BATCH = 5000
      let phAll = [], crAll = []
      for (let from = 0; from < 100000; from += BATCH) {
        if (cancelled) return
        const { data } = await supabase.from('pharmacies')
          .select('id,name,pref,city,addr,phone,zip,chain,rep,rx_count,concentration')
          .order('pref').range(from, from + BATCH - 1)
        if (!data?.length) break
        phAll = [...phAll, ...data]
        setLoadPct(Math.min(50, Math.round(phAll.length / 600)))
        if (data.length < BATCH) break
      }
      for (let from = 0; from < 100000; from += BATCH) {
        if (cancelled) return
        const { data } = await supabase.from('call_records')
          .select('pharmacy_id,status,assignee,memo,next_action,last_call,locked')
          .range(from, from + BATCH - 1)
        if (!data?.length) break
        crAll = [...crAll, ...data]
        setLoadPct(50 + Math.min(50, Math.round(crAll.length / 600)))
        if (data.length < BATCH) break
      }
      if (cancelled) return
      const crMap = {}
      crAll.forEach(r => { crMap[r.pharmacy_id] = r })
      const merged = phAll.map(p => ({
        p,
        c: crMap[p.id] || { pharmacy_id: p.id, status: '未着手', assignee: '未割当', memo: '', next_action: '', last_call: null, locked: false }
      }))
      setAllData(merged)
      setLoadPct(100)
      setReady(true)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!ready) return []
    return allData.filter(({ p, c }) => {
      if (fStatus && c.status !== fStatus) return false
      if (fPref   && p.pref !== fPref)     return false
      if (fCity   && p.city !== fCity)     return false
      if (fMember && c.assignee !== fMember) return false
      if (fChain  && !(p.chain||'').includes(fChain)) return false
      if (fRxMin  && (Number(p.rx_count)||0) < Number(fRxMin)) return false
      if (fText) {
        const t = fText.toLowerCase()
        if (![ p.name, p.addr, p.phone, p.chain, p.rep, p.zip ].some(v => v && v.toLowerCase().includes(t))) return false
      }
      return true
    })
  }, [allData, fText, fStatus, fPref, fCity, fMember, fChain, fRxMin, ready])

  useEffect(() => { setPage(0) }, [fText, fStatus, fPref, fCity, fMember, fChain, fRxMin])
  const paged      = useMemo(() => filtered.slice(page * PAGE, (page + 1) * PAGE), [filtered, page])
  const totalPages = Math.ceil(filtered.length / PAGE)
  const statCnt    = useMemo(() => {
    const cnt = {}
    allData.forEach(({ c }) => { cnt[c.status] = (cnt[c.status] || 0) + 1 })
    return cnt
  }, [allData])
  const cities = useMemo(() => {
    if (!fPref) return ['全て']
    return ['全て', ...Array.from(new Set(allData.filter(({p})=>p.pref===fPref).map(({p})=>p.city).filter(Boolean))).sort()]
  }, [allData, fPref])
  const selRow = sel ? allData.find(r => r.p.id === sel) : null
  const selP = selRow?.p, selC = selRow?.c
  useEffect(() => { if (selC) { setEMemo(selC.memo||''); setENext(selC.next_action||'') } }, [sel])

  const updateLocal = useCallback((id, patch) => {
    setAllData(prev => prev.map(r => r.p.id === id ? { ...r, c: { ...r.c, ...patch } } : r))
  }, [])

  const syncDB = useCallback(async (id, patch) => {
    const ex = allData.find(r => r.p.id === id)?.c || {}
    await supabase.from('call_records').upsert({
      pharmacy_id: id,
      status:      ex.status      || '未着手',
      assignee:    ex.assignee    || '未割当',
      memo:        ex.memo        || '',
      next_action: ex.next_action || '',
      locked:      ex.locked      || false,
      ...patch,
      updated_by: user.id,
    }, { onConflict: 'pharmacy_id' })
  }, [allData, user])

  const setStatus = useCallback(async (id, status) => {
    const lastCall = ['折返し待ち','アポ取得','関心有り'].includes(status) ? new Date().toISOString().slice(0,10) : allData.find(r=>r.p.id===id)?.c?.last_call
    updateLocal(id, { status, last_call: lastCall })
    await syncDB(id, { status, last_call: lastCall })
  }, [allData, updateLocal, syncDB])

  const setAssignee = (id, assignee) => { updateLocal(id, { assignee }); syncDB(id, { assignee }) }
  const toggleLock  = (id) => { const locked = !allData.find(r=>r.p.id===id)?.c?.locked; updateLocal(id, { locked }); syncDB(id, { locked }) }
  const saveMemo = () => {
    if (!sel) return
    updateLocal(sel, { memo: eMemo, next_action: eNext })
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => syncDB(sel, { memo: eMemo, next_action: eNext }), 500)
  }

  const executeBulk = useCallback(async () => {
    if (!bulkAssignee && !bulkStatus && !bulkLock) return
    const targets = filtered.filter(r => !r.c.locked)
    if (!targets.length) { alert('対象がありません'); return }
    if (!window.confirm(`${targets.length.toLocaleString()}件に一括設定します。よろしいですか？`)) return
    setAllData(prev => prev.map(r => {
      if (!targets.find(t => t.p.id === r.p.id)) return r
      return { ...r, c: { ...r.c,
        ...(bulkAssignee ? { assignee: bulkAssignee } : {}),
        ...(bulkStatus   ? { status:   bulkStatus   } : {}),
        ...(bulkLock === 'lock' ? { locked: true } : bulkLock === 'unlock' ? { locked: false } : {}),
      }}
    }))
    const BATCH = 500
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH).map(({ p, c }) => ({
        pharmacy_id: p.id,
        status:      bulkStatus   || c.status   || '未着手',
        assignee:    bulkAssignee || c.assignee || '未割当',
        locked:      bulkLock === 'lock' ? true : bulkLock === 'unlock' ? false : (c.locked||false),
        memo:        c.memo        || '',
        next_action: c.next_action || '',
        updated_by:  user.id,
      }))
      await supabase.from('call_records').upsert(batch, { onConflict: 'pharmacy_id' })
    }
    setShowBulk(false); setBulkAssignee(''); setBulkStatus(''); setBulkLock('')
    alert(`${targets.length.toLocaleString()}件に一括設定しました`)
  }, [filtered, bulkAssignee, bulkStatus, bulkLock, user])

  const addMember    = async () => {
    if(!newMember.trim()) return
    const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6']
    const color = colors[members.length % colors.length]
    await supabase.from('members').insert({ name: newMember.trim(), color })
    setMembers(prev => [...prev, newMember.trim()])
    setMemberColors(prev => ({ ...prev, [newMember.trim()]: color }))
    setNewMember('')
  }
  const removeMember = async (m) => {
    await supabase.from('members').delete().eq('name', m)
    setMembers(prev => prev.filter(x => x !== m))
    setMemberColors(prev => { const n = {...prev}; delete n[m]; return n })
  }
  const logout       = () => supabase.auth.signOut()
  const donePct = allData.length ? Math.round(allData.filter(r=>!['未着手'].includes(r.c.status)).length/allData.length*100) : 0

  if (!ready) return (
    <div style={{ minHeight:'100vh', background:'#080e1a', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ fontSize:36, marginBottom:16 }}>💊</div>
      <div style={{ fontSize:14, color:'#4a6490', marginBottom:20 }}>データを読み込み中... {loadPct}%</div>
      <div style={{ width:240, height:6, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
        <div style={{ width:`${loadPct}%`, height:'100%', background:'linear-gradient(90deg,#1d6aeb,#7c3aed)', transition:'width 0.3s' }}/>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif", background:'#080e1a', minHeight:'100vh', color:'#c8d4e8' }}>
      <header style={{ background:'linear-gradient(180deg,#0d1829,#080e1a)', borderBottom:'1px solid #1a2744', position:'sticky', top:0, zIndex:50, padding:isMobile?'0 12px':'0 20px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:isMobile?48:54 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>💊</div>
            <div>
              <div style={{ fontSize:isMobile?13:15, fontWeight:800, color:'#e8f0ff', letterSpacing:'0.06em' }}>PHARMA<span style={{ color:'#3b82f6' }}>CRM</span></div>
              {!isMobile && <div style={{ fontSize:9, color:'#3b5280' }}>全国薬局架電管理</div>}
            </div>
          </div>
          {isMobile ? (
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#3b5280' }}>{allData.length.toLocaleString()}件</span>
              <button onClick={()=>setShowMenu(!showMenu)} style={{ background:'none', border:'1px solid #1a2744', borderRadius:6, color:'#94a3b8', padding:'5px 9px', cursor:'pointer', fontSize:16 }}>☰</button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
              {[['list','📋 架電リスト'],['dashboard','📊 ダッシュボード']].map(([t,l])=>(
                <button key={t} onClick={()=>setTab(t)} style={{ padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, background:tab===t?'linear-gradient(135deg,#1d6aeb,#7c3aed)':'transparent', color:tab===t?'#fff':'#4a6490' }}>{l}</button>
              ))}
              <div style={{ width:1, height:20, background:'#1a2744' }}/>
              <button onClick={()=>setShowImport(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#4a8aff' }}>📥 取込</button>
              <button onClick={()=>exportCSV(filtered)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#34d399' }}>📤 CSV出力</button>
              <button onClick={()=>exportFormatExcel(filtered)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #22c55e44', cursor:'pointer', fontSize:11, fontWeight:700, background:'rgba(34,197,94,0.1)', color:'#4ade80' }}>📊 定型出力</button>
              <button onClick={()=>setShowBulk(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #f59e0b44', cursor:'pointer', fontSize:11, fontWeight:700, background:'rgba(245,158,11,0.1)', color:'#f59e0b' }}>⚡ 一括</button>
              <button onClick={()=>setShowSettings(true)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:11, fontWeight:700, background:'transparent', color:'#94a3b8' }}>⚙️</button>
              <span style={{ fontSize:11, color:'#3b5280', padding:'4px 10px', borderRadius:6, background:'#0d1829', border:'1px solid #1a2744' }}>{allData.length.toLocaleString()}件</span>
              <button onClick={logout} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #1a2744', cursor:'pointer', fontSize:10, fontWeight:700, background:'transparent', color:'#3b5280' }}>ログアウト</button>
            </div>
          )}
        </div>
        {isMobile && showMenu && (
          <div style={{ borderTop:'1px solid #1a2744', padding:'8px 0' }}>
            {[['list','📋 架電リスト'],['dashboard','📊 ダッシュボード']].map(([t,l])=>(
              <button key={t} onClick={()=>{setTab(t);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:tab===t?'rgba(29,106,235,0.15)':'transparent', color:tab===t?'#60a5fa':'#94a3b8', textAlign:'left' }}>{l}</button>
            ))}
            <div style={{ height:1, background:'#1a2744', margin:'4px 0' }}/>
            <button onClick={()=>{setShowImport(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#4a8aff', textAlign:'left' }}>📥 CSV取込</button>
            <button onClick={()=>{exportCSV(filtered);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#34d399', textAlign:'left' }}>📤 CSV出力</button>
            <button onClick={()=>{exportFormatExcel(filtered);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#4ade80', textAlign:'left' }}>📊 定型出力</button>
            <button onClick={()=>{setShowBulk(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#f59e0b', textAlign:'left' }}>⚡ 一括設定</button>
            <button onClick={()=>{setShowSettings(true);setShowMenu(false)}} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#94a3b8', textAlign:'left' }}>⚙️ 担当者設定</button>
            <button onClick={logout} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background:'transparent', color:'#ef4444', textAlign:'left' }}>🚪 ログアウト</button>
          </div>
        )}
        <div style={{ padding:'5px 0 6px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:9, color:'#3b5280', fontWeight:700, whiteSpace:'nowrap' }}>進捗 {donePct}%</span>
          <div style={{ flex:1, height:3, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
            <div style={{ width:`${donePct}%`, height:'100%', background:'linear-gradient(90deg,#1d6aeb,#7c3aed,#10b981)', transition:'width 0.5s' }}/>
          </div>
          <span style={{ fontSize:9, color:'#475569', whiteSpace:'nowrap' }}>
            売手 {statCnt['売手']||0} / 買手 {statCnt['買手']||0} / アポ {statCnt['アポ取得']||0}
          </span>
        </div>
      </header>

      {tab === 'dashboard' ? (
        <Dashboard allData={allData} statCnt={statCnt} members={members} memberColors={memberColors} isMobile={isMobile}/>
      ) : (
        <ListPanel
          paged={paged} filtered={filtered} statCnt={statCnt} allData={allData}
          page={page} setPage={setPage} totalPages={totalPages}
          fText={fText} setFText={setFText} fStatus={fStatus} setFStatus={setFStatus}
          fPref={fPref} setFPref={v=>{setFPref(v);setFCity('')}} fCity={fCity} setFCity={setFCity}
          fMember={fMember} setFMember={setFMember} fChain={fChain} setFChain={setFChain}
          fRxMin={fRxMin} setFRxMin={setFRxMin} cities={cities} members={members}
          sel={sel} setSel={setSel} selP={selP} selC={selC}
          eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext}
          setStatus={setStatus} setAssignee={setAssignee} saveMemo={saveMemo} toggleLock={toggleLock}
          showAdv={showAdv} setShowAdv={setShowAdv} isMobile={isMobile}
        />
      )}

      {showImport && <ImportModal onClose={()=>setShowImport(false)} onDone={()=>{setShowImport(false);window.location.reload()}}/>}

      {showBulk && (
        <Modal onClose={()=>setShowBulk(false)} title="⚡ 一括設定">
          <div style={{ fontSize:12, color:'#4a6490', marginBottom:16, padding:'8px 12px', borderRadius:8, background:'#080e1a', border:'1px solid #1a2744' }}>
            絞り込み結果 <span style={{ color:'#f59e0b', fontWeight:800 }}>{filtered.filter(r=>!r.c.locked).length.toLocaleString()}件</span>（ロック除外）に適用
          </div>
          {[
            { label:'担当者を一括設定', val:bulkAssignee, set:setBulkAssignee, opts:members.filter(m=>m!=='未割当').map(m=>({v:m,l:m,color:'#1d6aeb'})) },
            { label:'ステータスを一括設定', val:bulkStatus, set:setBulkStatus,
              opts:Object.entries(STATUSES).map(([s,c])=>({v:s,l:`${STATUS_ICONS[s]} ${s}`,color:c.color,bg:c.bg,bright:c.bright})) },
            { label:'🔒 ロックを一括設定', val:bulkLock, set:setBulkLock,
              opts:[{v:'lock',l:'🔒 一括ロック',color:'#f59e0b'},{v:'unlock',l:'🔓 一括解除',color:'#94a3b8'}] },
          ].map(({ label, val, set, opts }) => (
            <div key={label} style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:'#4a6490', fontWeight:700, marginBottom:8 }}>{label}</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button onClick={()=>set('')} style={{ padding:'5px 10px', borderRadius:6, border:`1.5px solid ${val===''?'#475569':'#1a2744'}`, background:val===''?'rgba(71,85,105,0.2)':'transparent', color:val===''?'#94a3b8':'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>変更しない</button>
                {opts.map(o=>(
                  <button key={o.v} onClick={()=>set(val===o.v?'':o.v)} style={{ padding:'5px 10px', borderRadius:6, border:`1.5px solid ${val===o.v?o.color:'#1a2744'}`, background:val===o.v?(o.bg||`${o.color}22`):'transparent', color:val===o.v?(o.bright||o.color):'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>{o.l}</button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={executeBulk} disabled={!bulkAssignee&&!bulkStatus&&!bulkLock}
            style={{ width:'100%', padding:12, borderRadius:8, border:'none', background:(!bulkAssignee&&!bulkStatus&&!bulkLock)?'#1a2744':'linear-gradient(135deg,#f59e0b,#ef4444)', color:'#fff', fontSize:13, fontWeight:800, cursor:(!bulkAssignee&&!bulkStatus&&!bulkLock)?'not-allowed':'pointer' }}>
            ⚡ 一括設定を実行
          </button>
        </Modal>
      )}

      {showSettings && (
        <Modal onClose={()=>setShowSettings(false)} title="⚙️ 担当者設定">
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16, maxHeight:260, overflowY:'auto' }}>
            {members.filter(m=>m!=='未割当').map(m=>(
              <div key={m} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:8, background:'#1a2744' }}>
                <span style={{ fontSize:14, color:'#c8d4e8', fontWeight:600 }}>{m}</span>
                <button onClick={()=>removeMember(m)} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:18 }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input value={newMember} onChange={e=>setNewMember(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addMember()} placeholder="担当者名を入力"
              style={{ flex:1, padding:'10px 12px', borderRadius:8, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:14, outline:'none' }}/>
            <button onClick={addMember} style={{ padding:'10px 16px', borderRadius:8, border:'none', background:'#1d6aeb', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>追加</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16, backdropFilter:'blur(4px)' }}>
      <div style={{ background:'#0d1829', borderRadius:14, padding:24, width:'100%', maxWidth:560, border:'1px solid #1a2744', maxHeight:'90vh', overflowY:'auto', fontFamily:"'Noto Sans JP',sans-serif" }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff', marginBottom:16 }}>{title}</div>
        {children}
        <button onClick={onClose} style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #1a2744', background:'transparent', color:'#4a6490', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8 }}>閉じる</button>
      </div>

      {/* エリアマップ */}
      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>🗾 エリア担当マップ</div>
        <div style={{ padding:14 }}>
          <AreaMap members={members} memberColors={memberColors}/>
        </div>
      </div>
    </div>
  )
}

// ステータス選択（グループ表示）
function StatusSelector({ current, onSelect, isMobile }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {Object.entries(STATUS_GROUPS).map(([group, statuses]) => (
        <div key={group}>
          <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, marginBottom:5, letterSpacing:'0.1em' }}>
            {group === '受付' ? '架電済 - 受付' : group === '社長接続' ? '架電済 - 社長接続' : group === '架電NG' ? '架電NG' : group}
          </div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {statuses.map(s => {
              const c = STATUSES[s]
              const on = current === s
              return (
                <button key={s} onClick={()=>onSelect(s)} style={{ padding:isMobile?'8px 10px':'4px 9px', borderRadius:6, border:`1.5px solid ${on?c.color:'#1a2744'}`, background:on?c.bg:'transparent', color:on?c.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  {STATUS_ICONS[s]} {s}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function SS({ value, onChange, options }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={{ padding:'6px 8px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#7ab3ff', fontSize:11, outline:'none', cursor:'pointer' }}>
      {options.map(o=><option key={o}>{o}</option>)}
    </select>
  )
}

function ListPanel({ paged, filtered, statCnt, allData, page, setPage, totalPages, fText, setFText, fStatus, setFStatus, fPref, setFPref, fCity, setFCity, fMember, setFMember, fChain, setFChain, fRxMin, setFRxMin, cities, members, sel, setSel, selP, selC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo, toggleLock, showAdv, setShowAdv, isMobile }) {
  if (isMobile && sel && selP && selC) {
    return <DetailView p={selP} c={selC} eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext} setStatus={setStatus} setAssignee={setAssignee} saveMemo={saveMemo} toggleLock={toggleLock} members={members} onClose={()=>setSel(null)} isMobile={true}/>
  }
  return (
    <div style={{ display:'flex', height:'calc(100vh - 82px)' }}>
      <div style={{ width:(!isMobile&&sel)?'55%':'100%', display:'flex', flexDirection:'column', borderRight:(!isMobile&&sel)?'1px solid #1a2744':'none', transition:'width 0.3s' }}>
        <div style={{ padding:'9px 12px', background:'#0b1221', borderBottom:'1px solid #1a2744', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ position:'relative', flex:1, minWidth:160 }}>
            <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#2a3d60' }}>🔍</span>
            <input value={fText} onChange={e=>setFText(e.target.value)} placeholder="薬局名・電話番号・社名・住所・郵便番号"
              style={{ width:'100%', padding:'7px 10px 7px 28px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <SS value={fStatus||'全て'} onChange={v=>setFStatus(v==='全て'?'':v)} options={['全て',...Object.keys(STATUSES)]}/>
          <SS value={fPref||'全て'}   onChange={v=>setFPref(v==='全て'?'':v)}   options={PREFS}/>
          <SS value={fCity||'全て'}   onChange={v=>setFCity(v==='全て'?'':v)}   options={cities}/>
          <SS value={fMember||'全て'} onChange={v=>setFMember(v==='全て'?'':v)} options={['全て',...members]}/>
          <button onClick={()=>setShowAdv(!showAdv)} style={{ padding:'6px 9px', borderRadius:6, border:`1px solid ${(fChain||fRxMin)?'#3b82f6':'#1a2744'}`, background:(fChain||fRxMin)?'rgba(59,130,246,0.15)':'transparent', color:(fChain||fRxMin)?'#60a5fa':'#3b5280', fontSize:11, cursor:'pointer', fontWeight:700 }}>
            詳細
          </button>
          <span style={{ fontSize:11, color:'#2a3d60', fontWeight:700, whiteSpace:'nowrap' }}>{filtered.length.toLocaleString()}件</span>
        </div>
        {showAdv && (
          <div style={{ padding:'8px 12px', background:'#0b1221', borderBottom:'1px solid #1a2744', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <input value={fChain} onChange={e=>setFChain(e.target.value)} placeholder="社名で絞り込み"
              style={{ flex:1, minWidth:130, padding:'6px 10px', borderRadius:6, border:`1px solid ${fChain?'#3b82f6':'#1a2744'}`, background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none' }}/>
            <input value={fRxMin} onChange={e=>setFRxMin(e.target.value)} placeholder="処方箋枚以上" type="number"
              style={{ width:100, padding:'6px 8px', borderRadius:6, border:`1px solid ${fRxMin?'#3b82f6':'#1a2744'}`, background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none' }}/>
            <button onClick={()=>{setFChain('');setFRxMin('')}} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #334155', background:'transparent', color:'#64748b', fontSize:11, cursor:'pointer' }}>クリア</button>
          </div>
        )}
        {/* ステータスチップ - グループ別 */}
        <div style={{ padding:'6px 12px', background:'#080e1a', borderBottom:'1px solid #1a2744' }}>
          <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
            <button onClick={()=>setFStatus('')} style={{ padding:'3px 9px', borderRadius:99, border:`1px solid ${!fStatus?'#4a6490':'#1a2744'}`, background:!fStatus?'rgba(74,100,144,0.2)':'transparent', color:!fStatus?'#94a3b8':'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>全て {allData.length.toLocaleString()}</button>
            {Object.entries(STATUS_GROUPS).map(([group, statuses]) => (
              <div key={group} style={{ display:'flex', gap:3, alignItems:'center', flexShrink:0 }}>
                <div style={{ width:1, height:14, background:'#1a2744', margin:'0 2px', flexShrink:0 }}/>
                {statuses.map(s => {
                  const c = STATUSES[s]
                  return (
                    <button key={s} onClick={()=>setFStatus(fStatus===s?'':s)} style={{ padding:'3px 8px', borderRadius:99, border:`1px solid ${fStatus===s?c.color:'#1a2744'}`, background:fStatus===s?c.bg:'transparent', color:fStatus===s?c.bright:'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                      {STATUS_ICONS[s]} {s} {statCnt[s]||0}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding:'4px 12px', background:'#080e1a', borderBottom:'1px solid #0d1829', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:'#2a3d60' }}>{filtered.length.toLocaleString()}件中 {paged.length}件表示</span>
          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{ padding:'2px 8px', borderRadius:4, border:'1px solid #1a2744', background:'transparent', color:page===0?'#2a3d60':'#7ab3ff', cursor:page===0?'default':'pointer', fontSize:11 }}>←</button>
              <span style={{ fontSize:11, color:'#4a6490' }}>{page+1}/{totalPages}</span>
              <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1} style={{ padding:'2px 8px', borderRadius:4, border:'1px solid #1a2744', background:'transparent', color:page===totalPages-1?'#2a3d60':'#7ab3ff', cursor:page===totalPages-1?'default':'pointer', fontSize:11 }}>→</button>
            </div>
          )}
        </div>
        {isMobile ? (
          <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
            {paged.map(({ p, c }) => {
              const st = STATUSES[c.status] || STATUSES['未着手']
              return (
                <div key={p.id} onClick={()=>setSel(p.id)} style={{ padding:'12px 16px', borderBottom:'1px solid #0d1829', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:4, height:44, borderRadius:99, background:st?.color||'#64748b', flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#e8f0ff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                        {c.locked&&<span style={{ fontSize:10, marginRight:3 }}>🔒</span>}{p.name}
                      </div>
                      <span style={{ padding:'2px 7px', borderRadius:4, background:st?.bg, color:st?.bright, fontSize:10, fontWeight:700, border:`1px solid ${st?.color}44`, marginLeft:8, flexShrink:0 }}>{STATUS_ICONS[c.status]} {c.status}</span>
                    </div>
                    <div style={{ display:'flex', gap:8, fontSize:11, color:'#3b5280' }}>
                      <span>{p.pref}</span><span style={{ fontFamily:'monospace' }}>{p.phone||'—'}</span>
                      {c.assignee!=='未割当'&&<span style={{ color:'#4a8aff' }}>👤{c.assignee}</span>}
                    </div>
                    {c.next_action&&<div style={{ fontSize:10, color:'#f59e0b', marginTop:3 }}>→ {c.next_action}</div>}
                  </div>
                  <div style={{ color:'#2a3d60', fontSize:18, flexShrink:0 }}>›</div>
                </div>
              )
            })}
            {paged.length===0&&<div style={{ padding:48, textAlign:'center', color:'#2a3d60' }}>条件に一致しません</div>}
          </div>
        ) : (
          <div style={{ flex:1, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#0b1221', position:'sticky', top:0, zIndex:2 }}>
                  {['','薬局名','社名','都道府県','電話番号','処方箋','ステータス','担当者','最終架電'].map(h=>(
                    <th key={h} style={{ padding:'7px 8px', textAlign:'left', fontSize:9, fontWeight:700, color:'#2a3d60', borderBottom:'1px solid #1a2744', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(({ p, c }, i) => {
                  const st = STATUSES[c.status] || STATUSES['未着手']
                  const isSel = sel===p.id
                  return (
                    <tr key={p.id} onClick={()=>setSel(isSel?null:p.id)} style={{ background:isSel?'rgba(29,106,235,0.12)':i%2===0?'#080e1a':'#090f1c', cursor:'pointer', borderBottom:'1px solid #0d1829' }}>
                      <td style={{ padding:'5px 8px', textAlign:'center' }}>
                        <button onClick={e=>{e.stopPropagation();toggleLock(p.id)}} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:c.locked?'#f59e0b':'#2a3d60', padding:0 }}>{c.locked?'🔒':'🔓'}</button>
                      </td>
                      <td style={{ padding:'6px 8px', fontSize:12, color:isSel?'#7ab3ff':'#c8d4e8', fontWeight:600, maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {isSel&&<span style={{ color:'#3b82f6', marginRight:4 }}>▶</span>}{p.name}
                      </td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#4a6490', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.chain||'—'}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#4a6490' }}>{p.pref}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#4a6490', fontFamily:'monospace' }}>{p.phone||'—'}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#34d399' }}>{p.rx_count?Number(p.rx_count).toLocaleString():'-'}</td>
                      <td style={{ padding:'6px 8px' }}>
                        <span style={{ padding:'2px 7px', borderRadius:4, background:st?.bg, color:st?.bright, fontSize:10, fontWeight:700, border:`1px solid ${st?.color}44` }}>{STATUS_ICONS[c.status]} {c.status}</span>
                      </td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:c.assignee==='未割当'?'#2a3d60':'#7ab3ff' }}>{c.assignee}</td>
                      <td style={{ padding:'6px 8px', fontSize:10, color:'#2a3d60' }}>{c.last_call||'—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {paged.length===0&&<div style={{ padding:48, textAlign:'center', color:'#2a3d60' }}>条件に一致しません</div>}
          </div>
        )}
      </div>
      {!isMobile && sel && selP && selC && (
        <DetailView p={selP} c={selC} eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext} setStatus={setStatus} setAssignee={setAssignee} saveMemo={saveMemo} toggleLock={toggleLock} members={members} onClose={()=>setSel(null)} isMobile={false}/>
      )}
    </div>
  )
}

function DetailView({ p, c, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo, toggleLock, members, onClose, isMobile }) {
  const st = STATUSES[c.status] || STATUSES['未着手']
  return (
    <div style={{ width:isMobile?'100%':'45%', display:'flex', flexDirection:'column', background:'#0b1221', overflowY:'auto', ...(isMobile?{minHeight:'calc(100vh - 82px)'}:{}) }}>
      <div style={{ padding:'13px 18px', borderBottom:'1px solid #1a2744', background:'#0d1829' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ flex:1, marginRight:10 }}>
            {isMobile && <button onClick={onClose} style={{ background:'none', border:'none', color:'#60a5fa', cursor:'pointer', fontSize:13, fontWeight:700, padding:'0 0 6px 0', display:'block' }}>← 戻る</button>}
            <div style={{ fontSize:14, fontWeight:800, color:'#e8f0ff', marginBottom:3 }}>{p.name}</div>
            {p.chain&&<div style={{ fontSize:10, color:'#3b5280', marginBottom:2 }}>🏢 {p.chain}</div>}
            {p.rep  &&<div style={{ fontSize:10, color:'#3b5280', marginBottom:3 }}>👤 {p.rep}</div>}
            {p.zip  &&<div style={{ fontSize:10, color:'#3b5280', marginBottom:2 }}>📮 〒{p.zip}</div>}
            <div style={{ fontSize:11, color:'#3b5280' }}>📍 {p.addr}</div>
            <a href={`tel:${p.phone}`} style={{ fontSize:14, color:'#60a5fa', fontWeight:800, textDecoration:'none', display:'block', marginTop:4 }}>📞 {p.phone||'—'}</a>
            <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
              {p.rx_count     &&<span style={{ padding:'2px 8px', borderRadius:4, background:'rgba(16,185,129,0.15)', color:'#34d399', fontSize:11, fontWeight:700 }}>💊 {Number(p.rx_count).toLocaleString()}枚</span>}
              {p.concentration&&<span style={{ padding:'2px 8px', borderRadius:4, background:'rgba(245,158,11,0.15)', color:'#fbbf24', fontSize:11, fontWeight:700 }}>📊 集中率 {p.concentration}%</span>}
              <span style={{ padding:'2px 8px', borderRadius:4, background:st.bg, color:st.bright, fontSize:11, fontWeight:700, border:`1px solid ${st.color}44` }}>{STATUS_ICONS[c.status]} {c.status}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={()=>toggleLock(p.id)} style={{ background:'none', border:`1px solid ${c.locked?'#f59e0b':'#334155'}`, borderRadius:6, color:c.locked?'#f59e0b':'#475569', cursor:'pointer', fontSize:12, padding:'5px 9px', fontWeight:700 }}>
              {c.locked?'🔒':'🔓'}
            </button>
            {!isMobile&&<button onClick={onClose} style={{ background:'none', border:'none', color:'#2a3d60', cursor:'pointer', fontSize:20 }}>✕</button>}
          </div>
        </div>
      </div>
      <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:8, textTransform:'uppercase' }}>ステータス変更</div>
          <StatusSelector current={c.status} onSelect={s=>setStatus(p.id,s)} isMobile={isMobile}/>
        </div>
        <div>
          <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:7, textTransform:'uppercase' }}>担当者</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {members.map(m=>{
              const on = c.assignee===m
              return <button key={m} onClick={()=>setAssignee(p.id,m)} style={{ padding:'5px 10px', borderRadius:6, border:`1.5px solid ${on?'#1d6aeb':'#1a2744'}`, background:on?'rgba(29,106,235,0.15)':'transparent', color:on?'#7ab3ff':'#3b5280', fontSize:12, fontWeight:700, cursor:'pointer' }}>{m}</button>
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:7, textTransform:'uppercase' }}>次回アクション</div>
          <input value={eNext} onChange={e=>setENext(e.target.value)} placeholder="例：来週月曜に再架電"
            style={{ width:'100%', padding:'9px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
        </div>
        <div>
          <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:7, textTransform:'uppercase' }}>架電メモ</div>
          <textarea value={eMemo} onChange={e=>setEMemo(e.target.value)} rows={4} placeholder="架電内容・担当者名など..."
            style={{ width:'100%', padding:'9px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
        </div>
        <button onClick={saveMemo} style={{ padding:12, borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', marginBottom:isMobile?32:0 }}>
          💾　保存する
        </button>
      </div>
    </div>
  )
}

function Dashboard({ allData, statCnt, members, memberColors, isMobile }) {
  const total = allData.length
  const memberStats = useMemo(() => {
    const r = {}
    members.forEach(m => { r[m] = { total:0 } })
    allData.forEach(({ c }) => { if(r[c.assignee]){ r[c.assignee].total++; r[c.assignee][c.status]=(r[c.assignee][c.status]||0)+1 } })
    return r
  }, [allData, members])
  const [prefAssignmentsDB, setPrefAssignmentsDB] = useState({})
  useEffect(() => {
    supabase.from('pref_assignments').select('pref_name,member_name').then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(r => { map[r.pref_name] = r.member_name || '未割当' })
        setPrefAssignmentsDB(map)
      }
    })
  }, [])

  const prefStats = useMemo(() => {
    const r = {}
    allData.forEach(({ p, c }) => {
      if(!r[p.pref])r[p.pref]={total:0,done:0}
      r[p.pref].total++
      if(c.status!=='未着手')r[p.pref].done++
    })
    return Object.entries(r).sort((a,b)=>b[1].total-a[1].total).slice(0,24)
  }, [allData])
  const keyStatuses = ['売手','買手','M&A済み','アポ取得','関心有り','折返し待ち','未着手']
  return (
    <div style={{ padding:isMobile?12:20, overflowY:'auto', height:'calc(100vh - 82px)', display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff' }}>📊 ダッシュボード</div>
      <div style={{ display:'grid', gridTemplateColumns:isMobile?'repeat(3,1fr)':'repeat(auto-fit,minmax(130px,1fr))', gap:8 }}>
        {keyStatuses.map(s=>{
          const c = STATUSES[s]
          return (
            <div key={s} style={{ padding:isMobile?'10px 8px':'14px', borderRadius:9, background:'#0b1221', border:`1px solid ${c.color}30`, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${c.color},transparent)` }}/>
              <div style={{ fontSize:isMobile?18:22, fontWeight:900, color:c.bright }}>{statCnt[s]||0}</div>
              <div style={{ fontSize:isMobile?9:11, color:'#4a6490', marginTop:2 }}>{STATUS_ICONS[s]} {s}</div>
              <div style={{ fontSize:9, color:'#2a3d60', marginTop:2 }}>{Math.round((statCnt[s]||0)/Math.max(total,1)*100)}%</div>
            </div>
          )
        })}
        <div style={{ padding:isMobile?'10px 8px':'14px', borderRadius:9, background:'#0b1221', border:'1px solid #1a2744' }}>
          <div style={{ fontSize:isMobile?18:22, fontWeight:900, color:'#e8f0ff' }}>{total.toLocaleString()}</div>
          <div style={{ fontSize:isMobile?9:11, color:'#4a6490', marginTop:2 }}>📋 総薬局数</div>
        </div>
      </div>
      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>👥 担当者別進捗</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:360 }}>
            <thead><tr style={{ background:'#080e1a' }}>
              <th style={{ padding:'7px 12px', textAlign:'left', fontSize:9, color:'#2a3d60', fontWeight:700 }}>担当者</th>
              <th style={{ padding:'7px 8px', textAlign:'center', fontSize:9, color:'#2a3d60' }}>合計</th>
              {['売手','買手','アポ取得','関心有り','折返し待ち','未着手'].map(s=>(
                <th key={s} style={{ padding:'7px 5px', textAlign:'center', fontSize:9, color:STATUSES[s]?.bright }}>{STATUS_ICONS[s]}</th>
              ))}
            </tr></thead>
            <tbody>
              {members.filter(m=>m!=='未割当').map((m,i)=>(
                <tr key={m} style={{ borderTop:'1px solid #1a2744', background:i%2===0?'#0b1221':'#080e1a' }}>
                  <td style={{ padding:'8px 12px', fontSize:12, color:m==='未割当'?'#2a3d60':'#c8d4e8', fontWeight:700 }}>{m}</td>
                  <td style={{ padding:'8px 8px', textAlign:'center', fontSize:12, color:'#7ab3ff', fontWeight:800 }}>{memberStats[m]?.total||0}</td>
                  {['売手','買手','アポ取得','関心有り','折返し待ち','未着手'].map(s=>(
                    <td key={s} style={{ padding:'8px 5px', textAlign:'center', fontSize:12, color:STATUSES[s]?.bright }}>{memberStats[m]?.[s]||0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>🗾 都道府県別進捗</div>
        <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px' }}>
          {prefStats.map(([pref,s])=>{
            const pct=Math.round(s.done/Math.max(s.total,1)*100)
            const assignee = prefAssignmentsDB[pref] || '未割当'
            const mColor = memberColors[assignee] || '#1d6aeb'
            return(
              <div key={pref} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:isMobile?70:100, fontSize:11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flexShrink:0, display:'flex', alignItems:'center', gap:4 }}>
                  {assignee!=='未割当'&&<span style={{ width:7, height:7, borderRadius:'50%', background:mColor, display:'inline-block', flexShrink:0 }}/>}
                  <span style={{ color:assignee!=='未割当'?mColor:'#7ab3ff' }}>{pref}</span>
                </div>
                <div style={{ flex:1, height:6, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', background:assignee!=='未割当'?mColor:'#1d6aeb', transition:'width 0.3s' }}/>
                </div>
                <div style={{ fontSize:10, color:'#2a3d60', whiteSpace:'nowrap', minWidth:50, textAlign:'right' }}>{s.done}/{s.total}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── エリアマップコンポーネント ─────────────────────
const PREF_GRID = [
  [1,'北海道',8,0,'北海道'],
  [2,'青森県',8,1,'青森'],[3,'岩手県',9,1,'岩手'],[4,'宮城県',9,2,'宮城'],
  [5,'秋田県',8,2,'秋田'],[6,'山形県',8,3,'山形'],[7,'福島県',9,3,'福島'],
  [8,'茨城県',9,4,'茨城'],[9,'栃木県',8,4,'栃木'],[10,'群馬県',7,4,'群馬'],
  [11,'埼玉県',8,5,'埼玉'],[12,'千葉県',9,5,'千葉'],[13,'東京都',8,6,'東京'],
  [14,'神奈川県',8,7,'神奈川'],[15,'新潟県',7,3,'新潟'],[16,'富山県',6,4,'富山'],
  [17,'石川県',5,4,'石川'],[18,'福井県',5,5,'福井'],[19,'山梨県',7,6,'山梨'],
  [20,'長野県',7,5,'長野'],[21,'岐阜県',6,5,'岐阜'],[22,'静岡県',7,7,'静岡'],
  [23,'愛知県',6,6,'愛知'],[24,'三重県',6,7,'三重'],[25,'滋賀県',5,6,'滋賀'],
  [26,'京都府',5,7,'京都'],[27,'大阪府',5,8,'大阪'],[28,'兵庫県',4,7,'兵庫'],
  [29,'奈良県',5,9,'奈良'],[30,'和歌山県',5,10,'和歌山'],[31,'鳥取県',4,6,'鳥取'],
  [32,'島根県',3,6,'島根'],[33,'岡山県',4,8,'岡山'],[34,'広島県',3,7,'広島'],
  [35,'山口県',2,7,'山口'],[36,'徳島県',5,11,'徳島'],[37,'香川県',4,10,'香川'],
  [38,'愛媛県',3,10,'愛媛'],[39,'高知県',4,11,'高知'],[40,'福岡県',2,8,'福岡'],
  [41,'佐賀県',1,8,'佐賀'],[42,'長崎県',0,9,'長崎'],[43,'熊本県',2,9,'熊本'],
  [44,'大分県',3,8,'大分'],[45,'宮崎県',3,9,'宮崎'],[46,'鹿児島県',2,10,'鹿児島'],
  [47,'沖縄県',1,12,'沖縄'],
]

const MC = {
  '未割当':'#334155','駒井':'#3b82f6','佐々木':'#10b981','谷畑':'#f59e0b',
  '西尾':'#ef4444','御手洗':'#a855f7','楠本':'#06b6d4','田中':'#f97316','佐藤':'#84cc16'
}

function AreaMap({ members, memberColors }) {
  const [assigns, setAssigns] = useState({})
  const [sel, setSel] = useState('未割当')
  const [hov, setHov] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const gc = m => memberColors[m] || MC[m] || '#334155'

  useEffect(() => {
    supabase.from('pref_assignments').select('pref_id,pref_name,member_name').then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(r => { map[Number(r.pref_id)] = r.member_name || '未割当' })
        setAssigns(map)
      }
      setLoaded(true)
    })
  }, [])

  const handleClick = async (id, name) => {
    setAssigns(prev => ({ ...prev, [id]: sel }))
    await supabase.from('pref_assignments').upsert(
      { pref_id: id, pref_name: name, member_name: sel, updated_at: new Date().toISOString() },
      { onConflict: 'pref_id' }
    )
  }

  if (!loaded) return <div style={{ padding:24, textAlign:'center', color:'#3b5280' }}>読み込み中...</div>

  const C = 50, G = 3
  const cols = 11, rows = 14
  const W = cols*(C+G), H = rows*(C+G)
  const hovPref = hov ? PREF_GRID.find(([id])=>id===hov) : null

  return (
    <div>
      {/* 担当者選択 */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <span style={{ fontSize:11, color:'#4a6490', marginRight:4 }}>担当者を選んで都道府県をクリック：</span>
        {['未割当',...members.filter(m=>m!=='未割当')].map(m => {
          const c = gc(m), active = sel===m
          const cnt = Object.values(assigns).filter(v=>v===m).length
          return (
            <button key={m} onClick={()=>setSel(m)} style={{
              padding:'5px 12px', borderRadius:7,
              border:`2px solid ${active?c:'#1a2744'}`,
              background:active?c+'33':'transparent',
              color:active?c:'#4a6490',
              fontSize:12, fontWeight:700, cursor:'pointer',
              display:'flex', alignItems:'center', gap:4
            }}>
              <span style={{ width:8,height:8,borderRadius:'50%',background:c,display:'inline-block' }}/>
              {m}{cnt>0&&<span style={{ fontSize:10,opacity:0.75 }}>{cnt}</span>}
            </button>
          )
        })}
      </div>

      {/* ホバー情報 */}
      <div style={{ minHeight:28, marginBottom:8 }}>
        {hovPref && (() => {
          const [id,name] = hovPref
          const assignee = assigns[id]||'未割当'
          const c = gc(assignee)
          return (
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'4px 12px', borderRadius:6, background:'#0d1829', border:`1px solid ${c}55` }}>
              <span style={{ width:10,height:10,borderRadius:3,background:c,display:'inline-block' }}/>
              <span style={{ fontSize:13, color:'#e8f0ff', fontWeight:700 }}>{name}</span>
              <span style={{ fontSize:11, color:c }}>{assignee}</span>
            </div>
          )
        })()}
      </div>

      {/* SVGグリッドマップ */}
      <div style={{ overflowX:'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', maxWidth:600, display:'block' }}>
          {PREF_GRID.map(([id, name, col, row, abbr]) => {
            const assignee = assigns[id]||'未割当'
            const c = gc(assignee)
            const isUnassigned = assignee==='未割当'
            const isHov = hov===id
            const x = col*(C+G), y = row*(C+G)
            return (
              <g key={id}
                onClick={()=>handleClick(id,name)}
                onMouseEnter={()=>setHov(id)}
                onMouseLeave={()=>setHov(null)}
                style={{ cursor:'pointer' }}>
                <rect x={x} y={y} width={C} height={C} rx={7}
                  fill={isUnassigned?'#1a2744':c+'44'}
                  stroke={isHov?gc(sel):isUnassigned?'#2a3d60':c}
                  strokeWidth={isHov?2.5:1.5}
                />
                <text x={x+C/2} y={y+C*(abbr.length>3?0.38:0.42)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={abbr.length>4?8:abbr.length>3?9:11}
                  fontFamily="'Noto Sans JP',sans-serif" fontWeight="700"
                  fill={isUnassigned?'#4a6490':c}>
                  {abbr}
                </text>
                {!isUnassigned && (
                  <text x={x+C/2} y={y+C*0.73}
                    textAnchor="middle"
                    fontSize={7} fontFamily="'Noto Sans JP',sans-serif"
                    fill={c} opacity={0.85}>
                    {assignee.length>3?assignee.slice(0,3):assignee}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* 凡例 */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:14, padding:'10px 14px', borderRadius:8, background:'#080e1a', border:'1px solid #1a2744' }}>
        {members.filter(m=>m!=='未割当').map(m => {
          const cnt = Object.values(assigns).filter(v=>v===m).length
          const c = gc(m)
          return (
            <div key={m} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:12,height:12,borderRadius:3,background:c,display:'inline-block',flexShrink:0 }}/>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{m}</span>
              <span style={{ fontSize:11, color:c, fontWeight:700 }}>{cnt}県</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
 
