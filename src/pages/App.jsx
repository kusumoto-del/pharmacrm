import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUSES, STATUS_ICONS, STATUS_GROUPS } from '../lib/constants'
import ImportModal from '../components/ImportModal'
import * as XLSX from 'xlsx'

const PAGE = 100
const PREFS = ['全て','北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']

// ── エリアマップ定数 ──
const TOPO_ID_TO_PREF = {
  'JP.HK':'北海道','JP.AO':'青森県','JP.IW':'岩手県','JP.MG':'宮城県','JP.AK':'秋田県',
  'JP.YM':'山形県','JP.FS':'福島県','JP.IB':'茨城県','JP.TC':'栃木県','JP.GM':'群馬県',
  'JP.ST':'埼玉県','JP.CB':'千葉県','JP.TK':'東京都','JP.KN':'神奈川県','JP.NI':'新潟県',
  'JP.TY':'富山県','JP.IS':'石川県','JP.FI':'福井県','JP.YN':'山梨県','JP.NN':'長野県',
  'JP.GF':'岐阜県','JP.SZ':'静岡県','JP.AC':'愛知県','JP.ME':'三重県','JP.SI':'滋賀県',
  'JP.KT':'京都府','JP.OS':'大阪府','JP.HG':'兵庫県','JP.NR':'奈良県','JP.WK':'和歌山県',
  'JP.TT':'鳥取県','JP.SM':'島根県','JP.OK':'岡山県','JP.HS':'広島県','JP.YC':'山口県',
  'JP.TS':'徳島県','JP.KG':'香川県','JP.EH':'愛媛県','JP.KC':'高知県','JP.FK':'福岡県',
  'JP.SG':'佐賀県','JP.NS':'長崎県','JP.KM':'熊本県','JP.OT':'大分県','JP.MZ':'宮崎県',
  'JP.KS':'鹿児島県','JP.ON':'沖縄県',
}
const PREF_TO_TOPO_ID = {}
Object.entries(TOPO_ID_TO_PREF).forEach(([tid,p])=>{PREF_TO_TOPO_ID[p]=tid})

const REGION_PREFS = {
  '北海道':['北海道'],'東北':['青森県','岩手県','宮城県','秋田県','山形県','福島県'],
  '関東':['茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県'],
  '中部':['新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県'],
  '近畿':['三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県'],
  '中国':['鳥取県','島根県','岡山県','広島県','山口県'],
  '四国':['徳島県','香川県','愛媛県','高知県'],
  '九州':['福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県'],
  '沖縄':['沖縄県'],
}
const PREF_REGION={}
Object.entries(REGION_PREFS).forEach(([r,ps])=>ps.forEach(p=>{PREF_REGION[p]=r}))

const UNASSIGNED_COLOR = '#1e2d45'
const TOPO_URL = 'https://cdn.jsdelivr.net/npm/datamaps@0.5.10/src/js/data/jpn.topo.json'

// 各都道府県の代表点（県庁所在地）の緯度経度
const PREF_LONLAT = {
  '北海道':[142.80,43.20],'青森県':[140.74,40.60],'岩手県':[141.50,39.60],
  '宮城県':[141.10,38.20],'秋田県':[140.10,39.60],'山形県':[140.00,38.55],
  '福島県':[140.50,37.35],'茨城県':[140.40,36.34],'栃木県':[139.90,36.65],
  '群馬県':[138.90,36.50],'埼玉県':[139.30,36.00],'千葉県':[140.40,35.45],
  '東京都':[139.70,35.70],'神奈川県':[139.20,35.38],'新潟県':[138.80,37.75],
  '富山県':[137.20,36.80],'石川県':[136.55,36.60],'福井県':[136.00,36.05],
  '山梨県':[138.60,35.60],'長野県':[137.90,36.50],'岐阜県':[136.90,35.75],
  '静岡県':[138.20,34.85],'愛知県':[137.10,35.00],'三重県':[136.55,34.20],
  '滋賀県':[136.20,35.15],'京都府':[135.35,35.42],'大阪府':[135.20,34.58],
  '兵庫県':[134.65,35.00],'奈良県':[136.00,34.30],'和歌山県':[135.65,33.80],
  '鳥取県':[133.80,35.52],'島根県':[133.00,35.45],'岡山県':[133.90,34.58],
  '広島県':[132.75,34.38],'山口県':[131.50,34.15],'徳島県':[134.45,33.85],
  '香川県':[133.90,34.20],'愛媛県':[132.70,33.75],'高知県':[133.40,33.45],
  '福岡県':[130.55,33.65],'佐賀県':[130.00,33.30],'長崎県':[129.70,32.90],
  '熊本県':[130.85,32.75],'大分県':[131.60,33.25],'宮崎県':[131.35,31.95],
  '鹿児島県':[130.55,31.45],'沖縄県':[127.68,26.21],
}

function useIsMobile() {
  const [v, setV] = useState(window.innerWidth < 768)
  useEffect(() => {
    const f = () => setV(window.innerWidth < 768)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return v
}

function exportFormatExcel(filtered) {
  const headers = ['開設者氏名（会社名）','薬局名','社長名','患者数','電話番号','アプローチ状況','薬剤師','管理者氏名','住所','URL','電話番号','郵便番号','店舗数','社長名（スペース削除）','役職','TC結果']
  const rows = filtered.map(({ p, c }) => [p.chain||'',p.name||'',p.rep||'',p.rx_count||'',p.phone||'',c.status||'','','',p.addr||'','',p.phone||'',p.zip||'','',(p.rep||'').replace(/\s/g,''),'',c.memo||''])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map((_,i) => ({ wch: [20,20,12,8,14,12,8,12,30,20,14,12,8,14,8,20][i]||12 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '貼付けシート')
  XLSX.writeFile(wb, '送付先リスト.xlsx')
}

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
  const [areaAssigns, setAreaAssigns]  = useState({})
  const saveTimer = useRef(null)
  const allDataRef = useRef([])
  useEffect(() => { allDataRef.current = allData }, [allData])

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

  const loadAreaAssigns = useCallback(() => {
    supabase.from('pref_assignments').select('pref_name,member_name').then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(r => { if (r.pref_name && r.member_name && r.member_name !== '未割当') map[r.pref_name] = r.member_name })
        setAreaAssigns(map)
      }
    })
  }, [])
  useEffect(() => { loadAreaAssigns() }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'dashboard') loadAreaAssigns() }, [tab])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const BATCH = 5000
      let phAll = [], crAll = []
      for (let from = 0; from < 100000; from += BATCH) {
        if (cancelled) return
        const { data } = await supabase.from('pharmacies').select('id,name,pref,city,addr,phone,zip,chain,rep,rx_count,concentration').order('pref').range(from, from + BATCH - 1)
        if (!data?.length) break
        phAll = [...phAll, ...data]
        setLoadPct(Math.min(50, Math.round(phAll.length / 600)))
        if (data.length < BATCH) break
      }
      for (let from = 0; from < 100000; from += BATCH) {
        if (cancelled) return
        const { data } = await supabase.from('call_records').select('pharmacy_id,status,division,assignee,memo,next_action,last_call,locked').range(from, from + BATCH - 1)
        if (!data?.length) break
        crAll = [...crAll, ...data]
        setLoadPct(50 + Math.min(50, Math.round(crAll.length / 600)))
        if (data.length < BATCH) break
      }
      if (cancelled) return
      const crMap = {}
      crAll.forEach(r => { crMap[r.pharmacy_id] = r })
      const merged = phAll.map(p => ({ p, c: crMap[p.id] || { pharmacy_id: p.id, status: '未着手', division: '', assignee: '未割当', memo: '', next_action: '', last_call: null, locked: false } }))
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
  const statCnt    = useMemo(() => { const cnt = {}; allData.forEach(({ c }) => { cnt[c.status] = (cnt[c.status] || 0) + 1 }); return cnt }, [allData])
  const cities     = useMemo(() => { if (!fPref) return ['全て']; return ['全て', ...Array.from(new Set(allData.filter(({p})=>p.pref===fPref).map(({p})=>p.city).filter(Boolean))).sort()] }, [allData, fPref])
  const selRow = sel ? allData.find(r => r.p.id === sel) : null
  const selP = selRow?.p, selC = selRow?.c
  useEffect(() => { if (selC) { setEMemo(selC.memo||''); setENext(selC.next_action||'') } }, [sel])

  const updateLocal = useCallback((id, patch) => {
    setAllData(prev => prev.map(r => r.p.id === id ? { ...r, c: { ...r.c, ...patch } } : r))
  }, [])

  // ⑤ syncDBを確実に保存（updated_byなし・シンプル化）
  const syncDB = useCallback(async (id, patch) => {
    const ex = allDataRef.current.find(r => r.p.id === id)?.c || {}
    const record = {
      pharmacy_id: id,
      status:      patch.status      ?? ex.status      ?? '未着手',
      division:    patch.division    ?? ex.division    ?? '',
      assignee:    patch.assignee    ?? ex.assignee    ?? '未割当',
      memo:        patch.memo        ?? ex.memo        ?? '',
      next_action: patch.next_action ?? ex.next_action ?? '',
      last_call:   patch.last_call   ?? ex.last_call   ?? null,
      locked:      patch.locked      ?? ex.locked      ?? false,
    }
    const { error } = await supabase.from('call_records').upsert(record, { onConflict: 'pharmacy_id' })
    if (error) console.error('syncDB error:', error)
  }, [])

  const setStatus = useCallback(async (id, status) => {
    const lastCall = ['折返し待ち','アポ取得','関心有り'].includes(status)
      ? new Date().toISOString().slice(0,10)
      : allDataRef.current.find(r=>r.p.id===id)?.c?.last_call ?? null
    updateLocal(id, { status, last_call: lastCall })
    await syncDB(id, { status, last_call: lastCall })
  }, [updateLocal, syncDB])

  const setAssignee = useCallback((id, assignee) => {
    updateLocal(id, { assignee })
    syncDB(id, { assignee })
  }, [updateLocal, syncDB])

  const setDivision = useCallback((id, division) => {
    updateLocal(id, { division })
    syncDB(id, { division })
  }, [updateLocal, syncDB])

  const toggleLock = useCallback((id) => {
    const locked = !allDataRef.current.find(r=>r.p.id===id)?.c?.locked
    updateLocal(id, { locked })
    syncDB(id, { locked })
  }, [updateLocal, syncDB])

  const saveMemo = useCallback(async () => {
    if (!sel) return
    updateLocal(sel, { memo: eMemo, next_action: eNext })
    clearTimeout(saveTimer.current)
    await syncDB(sel, { memo: eMemo, next_action: eNext })
  }, [sel, eMemo, eNext, updateLocal, syncDB])

  // 架電リスト一括連動（ロック除外）+ エリアマップも同期
  const applyPrefToList = useCallback(async (prefName, memberName, updateAreaMap = false) => {
    const targets = allDataRef.current.filter(({ p, c }) => p.pref === prefName && !c.locked)
    if (!targets.length) return
    setAllData(prev => prev.map(r => {
      if (r.p.pref !== prefName || r.c.locked) return r
      return { ...r, c: { ...r.c, assignee: memberName } }
    }))
    const BATCH = 500
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH).map(({ p, c }) => ({
        pharmacy_id: p.id, status: c.status||'未着手', division: c.division||'', assignee: memberName,
        locked: false, memo: c.memo||'', next_action: c.next_action||'',
        last_call: c.last_call||null,
      }))
      const { error } = await supabase.from('call_records').upsert(batch, { onConflict: 'pharmacy_id' })
      if (error) console.error('applyPref error:', error)
    }
    // エリアマップも同期（一括操作時のみ）
    if (updateAreaMap) {
      const topoId = PREF_TO_TOPO_ID[prefName] || prefName
      if (memberName && memberName !== '未割当') {
        await supabase.from('pref_assignments')
          .upsert({ pref_id: topoId, pref_name: prefName, member_name: memberName, updated_at: new Date().toISOString() }, { onConflict: 'pref_name' })
        setAreaAssigns(prev => ({ ...prev, [prefName]: memberName }))
      } else {
        await supabase.from('pref_assignments').delete().eq('pref_name', prefName)
        setAreaAssigns(prev => { const n = {...prev}; delete n[prefName]; return n })
      }
    }
  }, [setAreaAssigns])

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
        status:   bulkStatus   || c.status   || '未着手',
        assignee: bulkAssignee || c.assignee || '未割当',
        locked:   bulkLock==='lock' ? true : bulkLock==='unlock' ? false : (c.locked||false),
        memo:     c.memo||'', next_action: c.next_action||'', last_call: c.last_call||null,
      }))
      await supabase.from('call_records').upsert(batch, { onConflict: 'pharmacy_id' })
    }
    // 担当者を一括設定した場合、都道府県ごとにエリアマップも更新
    if (bulkAssignee) {
      const prefs = [...new Set(targets.map(r => r.p.pref))]
      for (const pref of prefs) {
        const topoId = PREF_TO_TOPO_ID[pref] || pref
        if (bulkAssignee !== '未割当') {
          await supabase.from('pref_assignments')
            .upsert({ pref_id: topoId, pref_name: pref, member_name: bulkAssignee, updated_at: new Date().toISOString() }, { onConflict: 'pref_name' })
          setAreaAssigns(prev => ({ ...prev, [pref]: bulkAssignee }))
        } else {
          await supabase.from('pref_assignments').delete().eq('pref_name', pref)
          setAreaAssigns(prev => { const n = {...prev}; delete n[pref]; return n })
        }
      }
    }
    setShowBulk(false); setBulkAssignee(''); setBulkStatus(''); setBulkLock('')
    alert(`${targets.length.toLocaleString()}件に一括設定しました`)
  }, [filtered, bulkAssignee, bulkStatus, bulkLock, setAreaAssigns])

  const addMember = async () => {
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
  const logout = () => supabase.auth.signOut()
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
          <span style={{ fontSize:9, color:'#475569', whiteSpace:'nowrap' }}>売手 {statCnt['売手']||0} / 買手 {statCnt['買手']||0} / アポ {statCnt['アポ取得']||0}</span>
        </div>
      </header>

      {tab === 'dashboard' ? (
        <Dashboard allData={allData} statCnt={statCnt} members={members} memberColors={memberColors} isMobile={isMobile} areaAssigns={areaAssigns} setAreaAssigns={setAreaAssigns} applyPrefToList={applyPrefToList}/>
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
          setStatus={setStatus} setAssignee={setAssignee} setDivision={setDivision} saveMemo={saveMemo} toggleLock={toggleLock}
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
            { label:'担当者を一括設定', val:bulkAssignee, set:setBulkAssignee, opts:[{v:'未割当',l:'🚫 未割当（外す）',color:'#64748b'},...members.filter(m=>m!=='未割当').map(m=>({v:m,l:m,color:'#1d6aeb'}))] },
            { label:'ステータスを一括設定', val:bulkStatus, set:setBulkStatus, opts:Object.entries(STATUSES).map(([s,c])=>({v:s,l:`${STATUS_ICONS[s]} ${s}`,color:c.color,bg:c.bg,bright:c.bright})) },
            { label:'🔒 ロックを一括設定', val:bulkLock, set:setBulkLock, opts:[{v:'lock',l:'🔒 一括ロック',color:'#f59e0b'},{v:'unlock',l:'🔓 一括解除',color:'#94a3b8'}] },
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
    </div>
  )
}

// ③ 3段階ステータス選択（区分・ステータス・担当者）
function StatusSelector({ current, onSelect, isMobile }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {Object.entries(STATUS_GROUPS).map(([group, statuses]) => {
        const label = group==='区分'?'A. 区分':group==='ステータス'?'B. ステータス':group==='受付'?'B. 架電済（受付）':group==='社長接続'?'B. 架電済（社長接続）':group==='架電NG'?'B. 架電NG':group
        return (
          <div key={group}>
            <div style={{ fontSize:9, color:'#3b5280', fontWeight:800, marginBottom:5, letterSpacing:'0.08em' }}>{label}</div>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {statuses.map(s => {
                const c = STATUSES[s]; const on = current === s
                return (
                  <button key={s} onClick={()=>onSelect(s)} style={{ padding:isMobile?'7px 9px':'4px 8px', borderRadius:6, border:`1.5px solid ${on?c.color:'#1a2744'}`, background:on?c.bg:'transparent', color:on?c.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    {STATUS_ICONS[s]} {s}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
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

function ListPanel({ paged, filtered, statCnt, allData, page, setPage, totalPages, fText, setFText, fStatus, setFStatus, fPref, setFPref, fCity, setFCity, fMember, setFMember, fChain, setFChain, fRxMin, setFRxMin, cities, members, sel, setSel, selP, selC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, setDivision, saveMemo, toggleLock, showAdv, setShowAdv, isMobile }) {
  if (isMobile && sel && selP && selC) {
    return <DetailView p={selP} c={selC} eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext} setStatus={setStatus} setAssignee={setAssignee} setDivision={setDivision} saveMemo={saveMemo} toggleLock={toggleLock} members={members} onClose={()=>setSel(null)} isMobile={true}/>
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
          <SS value={fMember||'全て'} onChange={v=>setFMember(v==='全て'?'':v)} options={['全て',...members.filter(m=>m!=='未割当')]}/>
          <button onClick={()=>setShowAdv(!showAdv)} style={{ padding:'6px 9px', borderRadius:6, border:`1px solid ${(fChain||fRxMin||fCity)?'#3b82f6':'#1a2744'}`, background:(fChain||fRxMin||fCity)?'rgba(59,130,246,0.15)':'transparent', color:(fChain||fRxMin||fCity)?'#60a5fa':'#3b5280', fontSize:11, cursor:'pointer', fontWeight:700 }}>詳細</button>
          <span style={{ fontSize:11, color:'#2a3d60', fontWeight:700, whiteSpace:'nowrap' }}>{filtered.length.toLocaleString()}件</span>
        </div>
        {showAdv && (
          <div style={{ padding:'8px 12px', background:'#0b1221', borderBottom:'1px solid #1a2744', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <SS value={fCity||'全て'} onChange={v=>setFCity(v==='全て'?'':v)} options={cities}/>
            <input value={fChain} onChange={e=>setFChain(e.target.value)} placeholder="社名で絞り込み" style={{ flex:1, minWidth:130, padding:'6px 10px', borderRadius:6, border:`1px solid ${fChain?'#3b82f6':'#1a2744'}`, background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none' }}/>
            <input value={fRxMin} onChange={e=>setFRxMin(e.target.value)} placeholder="処方箋枚以上" type="number" style={{ width:100, padding:'6px 8px', borderRadius:6, border:`1px solid ${fRxMin?'#3b82f6':'#1a2744'}`, background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none' }}/>
            <button onClick={()=>{setFChain('');setFRxMin('');setFCity('')}} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #334155', background:'transparent', color:'#64748b', fontSize:11, cursor:'pointer' }}>クリア</button>
          </div>
        )}
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
                <div key={p.id} onClick={()=>setSel(p.id)} style={{ padding:'12px 16px', borderBottom:'1px solid #0d1929', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:4, height:44, borderRadius:99, background:st?.color||'#64748b', flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#e8f0ff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{c.locked&&<span style={{ fontSize:10, marginRight:3 }}>🔒</span>}{p.name}</div>
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
                  {['','薬局名','社名','都道府県','電話番号','処方箋','区分','ステータス','担当者','最終架電'].map(h=>(
                    <th key={h} style={{ padding:'7px 8px', textAlign:'left', fontSize:9, fontWeight:700, color:'#2a3d60', borderBottom:'1px solid #1a2744', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(({ p, c }, i) => {
                  const st = STATUSES[c.status] || STATUSES['未着手']; const isSel = sel===p.id
                  return (
                    <tr key={p.id} onClick={()=>setSel(isSel?null:p.id)} style={{ background:isSel?'rgba(29,106,235,0.12)':i%2===0?'#080e1a':'#090f1c', cursor:'pointer', borderBottom:'1px solid #0d1829' }}>
                      <td style={{ padding:'5px 8px', textAlign:'center' }}>
                        <button onClick={e=>{e.stopPropagation();toggleLock(p.id)}} style={{ background:'none', border:'none', cursor:'pointer', fontSize:11, color:c.locked?'#f59e0b':'#2a3d60', padding:0 }}>{c.locked?'🔒':'🔓'}</button>
                      </td>
                      <td style={{ padding:'6px 8px', fontSize:12, color:isSel?'#7ab3ff':'#c8d4e8', fontWeight:600, maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{isSel&&<span style={{ color:'#3b82f6', marginRight:4 }}>▶</span>}{p.name}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#4a6490', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.chain||'—'}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#4a6490' }}>{p.pref}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#4a6490', fontFamily:'monospace' }}>{p.phone||'—'}</td>
                      <td style={{ padding:'6px 8px', fontSize:11, color:'#34d399' }}>{p.rx_count?Number(p.rx_count).toLocaleString():'-'}</td>
                      <td style={{ padding:'6px 4px' }}>{c.division&&<span style={{ padding:'2px 5px', borderRadius:4, background:STATUSES[c.division]?.bg, color:STATUSES[c.division]?.bright, fontSize:9, fontWeight:700, border:`1px solid ${STATUSES[c.division]?.color}44` }}>{STATUS_ICONS[c.division]} {c.division}</span>}</td>
                      <td style={{ padding:'6px 8px' }}><span style={{ padding:'2px 7px', borderRadius:4, background:st?.bg, color:st?.bright, fontSize:10, fontWeight:700, border:`1px solid ${st?.color}44` }}>{STATUS_ICONS[c.status]} {c.status}</span></td>
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
        <DetailView p={selP} c={selC} eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext} setStatus={setStatus} setAssignee={setAssignee} setDivision={setDivision} saveMemo={saveMemo} toggleLock={toggleLock} members={members} onClose={()=>setSel(null)} isMobile={false}/>
      )}
    </div>
  )
}

function DetailView({ p, c, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, setDivision, saveMemo, toggleLock, members, onClose, isMobile }) {
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
            <button onClick={()=>toggleLock(p.id)} style={{ background:'none', border:`1px solid ${c.locked?'#f59e0b':'#334155'}`, borderRadius:6, color:c.locked?'#f59e0b':'#475569', cursor:'pointer', fontSize:12, padding:'5px 9px', fontWeight:700 }}>{c.locked?'🔒':'🔓'}</button>
            {!isMobile&&<button onClick={onClose} style={{ background:'none', border:'none', color:'#2a3d60', cursor:'pointer', fontSize:20 }}>✕</button>}
          </div>
        </div>
      </div>
      <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:14 }}>
        {/* A. 区分（独立して保存） */}
        <div>
          <div style={{ fontSize:9, color:'#3b5280', fontWeight:800, marginBottom:6 }}>A. 区分</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {['売手','買手','M&A済み'].map(s=>{ const c2=STATUSES[s]; const on=c.division===s; return (
              <button key={s} onClick={()=>setDivision(p.id, c.division===s?'':s)} style={{ padding:'4px 9px', borderRadius:6, border:`1.5px solid ${on?c2.color:'#1a2744'}`, background:on?c2.bg:'transparent', color:on?c2.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {STATUS_ICONS[s]} {s}
              </button>
            )})}
          </div>
        </div>
        {/* B. ステータス（独立して保存） */}
        <div>
          <div style={{ fontSize:9, color:'#3b5280', fontWeight:800, marginBottom:6 }}>B. ステータス</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[['ステータス',['未着手']],['受付',['不在','着信拒否','受付ブロック','折返し待ち']],['社長接続',['多忙','関心無し','関心有り','アポ取得']],['架電NG',['進行中','クレーム有','要注意']]].map(([grp,sts])=>(
              <div key={grp}>
                <div style={{ fontSize:8, color:'#2a3d60', marginBottom:4 }}>{grp==='ステータス'?'基本':grp==='受付'?'架電済（受付）':grp==='社長接続'?'架電済（社長接続）':'架電NG'}</div>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {sts.map(s=>{ const c2=STATUSES[s]; const on=c.status===s; return (
                    <button key={s} onClick={()=>setStatus(p.id,s)} style={{ padding:'4px 8px', borderRadius:6, border:`1.5px solid ${on?c2.color:'#1a2744'}`, background:on?c2.bg:'transparent', color:on?c2.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      {STATUS_ICONS[s]} {s}
                    </button>
                  )})}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* C. 担当者 */}
        <div>
          <div style={{ fontSize:9, color:'#3b5280', fontWeight:800, marginBottom:7 }}>C. 担当者</div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {members.map(m=>{ const on=c.assignee===m; return <button key={m} onClick={()=>setAssignee(p.id,m)} style={{ padding:'5px 10px', borderRadius:6, border:`1.5px solid ${on?'#1d6aeb':'#1a2744'}`, background:on?'rgba(29,106,235,0.15)':'transparent', color:on?'#7ab3ff':'#3b5280', fontSize:12, fontWeight:700, cursor:'pointer' }}>{m}</button> })}
          </div>
        </div>
        <div>
          <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:7, textTransform:'uppercase' }}>次回アクション</div>
          <input value={eNext} onChange={e=>setENext(e.target.value)} onBlur={saveMemo} placeholder="例：来週月曜に再架電" style={{ width:'100%', padding:'9px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
        </div>
        <div>
          <div style={{ fontSize:9, color:'#2a3d60', fontWeight:800, letterSpacing:'0.1em', marginBottom:7, textTransform:'uppercase' }}>架電メモ</div>
          <textarea value={eMemo} onChange={e=>setEMemo(e.target.value)} onBlur={saveMemo} rows={4} placeholder="架電内容・担当者名など..." style={{ width:'100%', padding:'9px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
        </div>
        <button onClick={saveMemo} style={{ padding:12, borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', marginBottom:isMobile?32:0 }}>💾　保存する</button>
      </div>
    </div>
  )
}

function Dashboard({ allData, statCnt, members, memberColors, isMobile, areaAssigns, setAreaAssigns, applyPrefToList }) {
  const total = allData.length
  const memberStats = useMemo(() => {
    const r = {}
    members.forEach(m => { r[m] = { total:0 } })
    allData.forEach(({ c }) => { if(r[c.assignee]){ r[c.assignee].total++; r[c.assignee][c.status]=(r[c.assignee][c.status]||0)+1 } })
    return r
  }, [allData, members])
  const prefStats = useMemo(() => {
    const r = {}
    allData.forEach(({ p, c }) => { if(!r[p.pref])r[p.pref]={total:0,done:0}; r[p.pref].total++; if(c.status!=='未着手')r[p.pref].done++ })
    return Object.entries(r).sort((a,b)=>b[1].total-a[1].total).slice(0,24)
  }, [allData])
  const keyStatuses = ['売手','買手','M&A済み','アポ取得','関心有り','折返し待ち','未着手']
  return (
    <div style={{ padding:isMobile?12:20, overflowY:'auto', minHeight:'calc(100vh - 82px)', display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff' }}>📊 ダッシュボード</div>
      <div style={{ display:'grid', gridTemplateColumns:isMobile?'repeat(3,1fr)':'repeat(auto-fit,minmax(130px,1fr))', gap:8 }}>
        {keyStatuses.map(s=>{ const c=STATUSES[s]; return (
          <div key={s} style={{ padding:isMobile?'10px 8px':'14px', borderRadius:9, background:'#0b1221', border:`1px solid ${c.color}30`, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${c.color},transparent)` }}/>
            <div style={{ fontSize:isMobile?18:22, fontWeight:900, color:c.bright }}>{statCnt[s]||0}</div>
            <div style={{ fontSize:isMobile?9:11, color:'#4a6490', marginTop:2 }}>{STATUS_ICONS[s]} {s}</div>
            <div style={{ fontSize:9, color:'#2a3d60', marginTop:2 }}>{Math.round((statCnt[s]||0)/Math.max(total,1)*100)}%</div>
          </div>
        )})}
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
                  <td style={{ padding:'8px 12px', fontSize:12, color:'#c8d4e8', fontWeight:700 }}>{m}</td>
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
            const assignee = areaAssigns[pref] || '未割当'
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
      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff' }}>🗾 エリア担当マップ</div>
        <div style={{ padding:14 }}>
          <AreaMap members={members} memberColors={memberColors} allData={allData} areaAssigns={areaAssigns} setAreaAssigns={setAreaAssigns} applyPrefToList={applyPrefToList}/>
        </div>
      </div>
    </div>
  )
}

function AreaMap({ members, memberColors, allData, areaAssigns, setAreaAssigns, applyPrefToList }) {
  const svgRef    = useRef(null)
  const wrapRef   = useRef(null)
  const pathsRef  = useRef(null)
  const labelsRef = useRef(null)
  const initRef   = useRef(false)
  const selRef          = useRef('未割当')
  const areaAssignsRef  = useRef(areaAssigns)
  const memberColorsRef = useRef(memberColors)

  const [sel, setSel]             = useState('未割当')
  const [tooltip, setTooltip]     = useState({ visible:false, prefName:null, x:0, y:0 })
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapErr, setMapErr]       = useState(false)
  const [msg, setMsg]             = useState('')

  useEffect(() => { selRef.current = sel }, [sel])
  useEffect(() => { areaAssignsRef.current = areaAssigns }, [areaAssigns])
  useEffect(() => { memberColorsRef.current = memberColors }, [memberColors])

  useEffect(() => {
    if (initRef.current) return
    const d3 = window.d3, topo = window.topojson
    if (!d3 || !topo || !svgRef.current) return
    initRef.current = true

    const proj = d3.geoMercator().center([136.5, 38]).scale(1550).translate([420, 380])
    const pg   = d3.geoPath(proj)
    const svg  = d3.select(svgRef.current)

    fetch(TOPO_URL).then(r => r.json()).then(jp => {
      const features = topo.feature(jp, jp.objects.jpn).features
      const pathLayer  = svg.append('g').attr('class', 'path-layer')
      const labelLayer = svg.append('g').attr('class', 'label-layer')

      pathsRef.current = pathLayer.selectAll('.pp').data(features).join('path')
        .attr('class', 'pp').attr('d', pg)
        .attr('fill', UNASSIGNED_COLOR)
        .attr('stroke', 'rgba(255,255,255,0.15)').attr('stroke-width', '0.7')
        .style('cursor', 'pointer')
        .on('click', (_, d) => {
          const prefName = TOPO_ID_TO_PREF[d.id]
          if (!prefName) return
          const cur = selRef.current
          const prev = areaAssignsRef.current
          const next = { ...prev }
          if (!cur || cur === '未割当') { delete next[prefName] }
          else if (next[prefName] === cur) { delete next[prefName] }
          else { next[prefName] = cur }
          const newMember = next[prefName]
          if (newMember) {
            supabase.from('pref_assignments')
              .upsert({ pref_id: PREF_TO_TOPO_ID[prefName]||d.id, pref_name: prefName, member_name: newMember, updated_at: new Date().toISOString() }, { onConflict: 'pref_name' })
              .then(({ error }) => { if (error) console.error('pref save:', error) })
          } else {
            supabase.from('pref_assignments').delete().eq('pref_name', prefName)
          }
          setAreaAssigns(next)
          // ④ ロック除外で架電リストに反映
          if (newMember && newMember !== '未割当') {
            applyPrefToList(prefName, newMember)
            setMsg(`${prefName} → 「${newMember}」に設定・架電リスト更新中...`)
            setTimeout(() => setMsg(''), 3000)
          }
        })
        .on('mouseenter', (e, d) => {
          d3.select(e.currentTarget).raise().attr('opacity', '0.75').attr('stroke', '#fff').attr('stroke-width', '1.5')
          const rect = wrapRef.current?.getBoundingClientRect()
          if (!rect) return
          const prefName = TOPO_ID_TO_PREF[d.id]
          let x = e.clientX - rect.left + 12, y = e.clientY - rect.top - 10
          if (x + 160 > rect.width) x -= 175
          setTooltip({ visible: true, prefName, x, y })
        })
        .on('mousemove', e => {
          const rect = wrapRef.current?.getBoundingClientRect()
          if (!rect) return
          let x = e.clientX - rect.left + 12, y = e.clientY - rect.top - 10
          if (x + 160 > rect.width) x -= 175
          setTooltip(prev => ({ ...prev, x, y }))
        })
        .on('mouseleave', (e) => {
          d3.select(e.currentTarget).attr('opacity', '1').attr('stroke', 'rgba(255,255,255,0.15)').attr('stroke-width', '0.7')
          setTooltip(prev => ({ ...prev, visible: false }))
        })

      // ラベル：緯度経度から正確に配置
      labelsRef.current = labelLayer.selectAll('.pl').data(Object.entries(PREF_LONLAT)).join('text')
        .attr('class', 'pl')
        .attr('x', d => proj(d[1])[0])
        .attr('y', d => proj(d[1])[1])
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('font-size', 4.5)
        .attr('font-family', "'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif")
        .attr('fill', '#4a6a8a').attr('font-weight', '400')
        .attr('paint-order', 'stroke').attr('stroke', 'rgba(8,14,26,0.6)')
        .attr('stroke-width', '2').attr('stroke-linejoin', 'round')
        .attr('pointer-events', 'none')
        .text(d => d[0])

      setMapLoaded(true)
    }).catch(e => { console.error('map load error:', e); setMapErr(true) })
  }, [])

  useEffect(() => {
    if (!pathsRef.current || !labelsRef.current) return
    pathsRef.current
      .attr('fill', d => { const m = areaAssigns[TOPO_ID_TO_PREF[d.id]]; return m ? (memberColors[m]||'#334155') : UNASSIGNED_COLOR })
      .attr('stroke', d => areaAssigns[TOPO_ID_TO_PREF[d.id]] ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)')
    labelsRef.current
      .attr('fill', d => areaAssigns[d[0]] ? 'rgba(255,255,255,0.90)' : '#4a6a8a')
      .attr('font-weight', d => areaAssigns[d[0]] ? '600' : '400')
      .attr('stroke', d => areaAssigns[d[0]] ? 'rgba(0,0,0,0.4)' : 'rgba(8,14,26,0.6)')
  }, [areaAssigns, memberColors])

  const bulkRegion = (region) => {
    if (!sel || sel === '未割当') return
    const prefs = REGION_PREFS[region] || []
    const next = { ...areaAssigns }
    prefs.forEach(p => { next[p] = sel })
    setAreaAssigns(next)
    supabase.from('pref_assignments').upsert(
      prefs.map(p => ({ pref_id: PREF_TO_TOPO_ID[p]||p, pref_name: p, member_name: sel, updated_at: new Date().toISOString() })),
      { onConflict: 'pref_name' }
    ).then(({ error }) => { if (error) console.error('bulk error:', error) })
    prefs.forEach(p => applyPrefToList(p, sel))
    setMsg(`${region}地方を「${sel}」に設定・架電リスト更新中...`)
    setTimeout(() => setMsg(''), 4000)
  }

  const clearAll = async () => {
    if (!window.confirm('全担当をクリアしますか？')) return
    setAreaAssigns({})
    await supabase.from('pref_assignments').delete().neq('pref_name', '__dummy__')
  }

  const tipMember = tooltip.prefName ? areaAssigns[tooltip.prefName] : null
  const memberList = ['未割当', ...members.filter(m => m !== '未割当')]

  return (
    <div>
      <div style={{ marginBottom:8, fontSize:11, color:'#4a6490' }}>
        都道府県をクリック → <b style={{ color:'#7ab3ff' }}>エリア保存＋架電リスト即時更新</b>（🔒ロック除外）
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10, alignItems:'center' }}>
        <span style={{ fontSize:11, color:'#4a6490', marginRight:2, whiteSpace:'nowrap' }}>担当者:</span>
        {memberList.map(m => {
          const color = m === '未割当' ? '#334155' : (memberColors[m] || '#334155')
          const active = sel === m
          const cnt = Object.values(areaAssigns).filter(v => v === m).length
          return (
            <button key={m} onClick={() => setSel(m)} style={{ padding:'4px 10px', borderRadius:7, border:`2px solid ${active ? color : '#1a2744'}`, background: active ? color + '33' : 'transparent', color: active ? color : '#4a6490', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              {m !== '未割当' && <span style={{ width:7, height:7, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }}/>}
              {m}{cnt > 0 && <span style={{ fontSize:10, opacity:0.8 }}>{cnt}</span>}
            </button>
          )
        })}
      </div>
      {sel && sel !== '未割当' && (
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8, alignItems:'center' }}>
          <span style={{ fontSize:10, color:'#2a3d60', marginRight:2 }}>地方一括:</span>
          {Object.keys(REGION_PREFS).map(r => (
            <button key={r} onClick={() => bulkRegion(r)} style={{ fontSize:10, padding:'2px 8px', borderRadius:9, border:'1px solid #1a2744', background:'transparent', color:'#4a6490', cursor:'pointer' }}>{r}</button>
          ))}
          <button onClick={clearAll} style={{ fontSize:10, padding:'2px 8px', borderRadius:9, border:'1px solid #7f1d1d', background:'transparent', color:'#f87171', cursor:'pointer', marginLeft:'auto' }}>全クリア</button>
        </div>
      )}
      <div ref={wrapRef} style={{ position:'relative', width:'100%', background:'#080e1a', borderRadius:8, overflow:'hidden', border:'1px solid #1a2744' }}>
        {!mapLoaded && !mapErr && <div style={{ padding:'40px', textAlign:'center', color:'#3b5280', fontSize:13 }}>地図を読み込み中...</div>}
        {mapErr && <div style={{ padding:'40px', textAlign:'center', color:'#ef4444', fontSize:13 }}>地図データの読み込みに失敗しました</div>}
        <svg ref={svgRef} viewBox="0 0 800 680" style={{ width:'100%', display:'block' }}/>
        {tooltip.visible && tooltip.prefName && (
          <div style={{ position:'absolute', left:tooltip.x, top:tooltip.y, background:'#0d1829', border:'1px solid #2a3d60', borderRadius:8, padding:'6px 10px', pointerEvents:'none', zIndex:50, fontSize:12, whiteSpace:'nowrap' }}>
            <div style={{ fontWeight:700, color:'#e8f0ff', marginBottom:3 }}>
              {tooltip.prefName}<span style={{ fontSize:10, color:'#3b5280', marginLeft:5 }}>{PREF_REGION[tooltip.prefName]}</span>
            </div>
            <div style={{ fontSize:11 }}>
              {tipMember ? <span style={{ color:memberColors[tipMember]||'#7ab3ff', fontWeight:700 }}>{tipMember}</span> : <span style={{ color:'#3b5280' }}>未割当</span>}
            </div>
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:10, padding:'8px 12px', borderRadius:8, background:'#080e1a', border:'1px solid #1a2744' }}>
        {members.filter(m => m !== '未割当').map(m => {
          const cnt = Object.values(areaAssigns).filter(v => v === m).length
          const color = memberColors[m] || '#334155'
          return (
            <div key={m} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:10, height:10, borderRadius:3, background:color, display:'inline-block', flexShrink:0 }}/>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{m}</span>
              <span style={{ fontSize:11, color, fontWeight:700 }}>{cnt}県</span>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <button
          onClick={async () => {
            const entries = Object.entries(areaAssigns).filter(([,m]) => m && m !== '未割当')
            if (!entries.length) { setMsg('先に都道府県に担当者を割り当ててください'); return }
            const targets = allData.filter(({ p, c }) => entries.some(([pref]) => p.pref === pref) && !c.locked)
            if (!window.confirm(`エリアマップの全設定を架電リストに反映します。\n対象：${entries.length}都道府県 / ${targets.length.toLocaleString()}件\n（🔒ロック済みは除外）\nよろしいですか？`)) return
            setMsg('反映中...')
            for (const [prefName, memberName] of entries) {
              await applyPrefToList(prefName, memberName, true)
            }
            setMsg(`✅ ${entries.length}都道府県 / ${targets.length.toLocaleString()}件を反映しました`)
            setTimeout(() => setMsg(''), 6000)
          }}
          style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}
        >
          ⚡ 架電リストに担当者を一括反映
        </button>
        <span style={{ fontSize:11, color:'#4a6490' }}>※ 🔒ロック済みの店舗は変更されません</span>
      </div>
      {msg && (
        <div style={{ marginTop:8, fontSize:12, color: msg.startsWith('✅') ? '#22c55e' : '#f59e0b', padding:'6px 10px', borderRadius:6, background:'#0d1829', border:`1px solid ${msg.startsWith('✅') ? '#22c55e33' : '#f59e0b33'}` }}>
          {msg}
        </div>
      )}
    </div>
  )
}
