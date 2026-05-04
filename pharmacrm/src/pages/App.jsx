import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUSES, STATUS_ICONS, getMembers, saveMembers, SAMPLE_PHARMACIES } from '../lib/constants'
import ImportModal from '../components/ImportModal'

const ACTIVE_STATUSES = Object.fromEntries(Object.entries(STATUSES).filter(([s]) => s !== 'NG'))
const PAGE_SIZE = 100

const makeCall = () => ({ status: '未着手', assignee: '未割当', memo: '', next_action: '', last_call: null, locked: false })

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

  // データ
  const [rows,      setRows]      = useState([])  // [{pharmacy, call}]
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [page,      setPage]      = useState(0)

  // フィルター
  const [fStatus,  setFStatus]  = useState('')
  const [fPref,    setFPref]    = useState('')
  const [fCity,    setFCity]    = useState('')
  const [fMember,  setFMember]  = useState('')
  const [fText,    setFText]    = useState('')
  const [fChain,   setFChain]   = useState('')
  const [fRxMin,   setFRxMin]   = useState('')
  const [searchInput, setSearchInput] = useState('')

  // 詳細
  const [sel,      setSel]      = useState(null)
  const [eMemo,    setEMemo]    = useState('')
  const [eNext,    setENext]    = useState('')

  // UI
  const [tab,         setTab]         = useState('list')
  const [showImport,  setShowImport]  = useState(false)
  const [showSettings,setShowSettings]= useState(false)
  const [showBulk,    setShowBulk]    = useState(false)
  const [showMenu,    setShowMenu]    = useState(false)
  const [showAdv,     setShowAdv]     = useState(false)

  // 担当者
  const [members,   setMembers]   = useState(getMembers)
  const [newMember, setNewMember] = useState('')

  // 一括
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkStatus,   setBulkStatus]   = useState('')
  const [bulkLock,     setBulkLock]     = useState('')

  // プリフェッチ用
  const [prefs,  setPrefs]  = useState(['全て'])
  const [cities, setCities] = useState(['全て'])
  const [statCnt,setStatCnt]= useState({})

  const saveTimer = useRef(null)
  const searchTimer = useRef(null)

  // ── 都道府県リストを事前取得 ──────────────────
  useEffect(() => {
    supabase.from('pharmacies').select('pref').then(({ data }) => {
      if (!data) return
      const unique = ['全て', ...Array.from(new Set(data.map(r => r.pref).filter(Boolean))).sort()]
      setPrefs(unique)
    })
  }, [])

  // ── 市区町村リストを都道府県変更時に取得 ──────
  useEffect(() => {
    if (!fPref || fPref === '全て') { setCities(['全て']); return }
    supabase.from('pharmacies').select('city').eq('pref', fPref).then(({ data }) => {
      if (!data) return
      const unique = ['全て', ...Array.from(new Set(data.map(r => r.city).filter(Boolean))).sort()]
      setCities(unique)
    })
  }, [fPref])

  // ── ステータス集計を取得 ──────────────────────
  const fetchStatCnt = useCallback(async () => {
    const { data } = await supabase.from('call_records').select('status')
    if (!data) return
    const cnt = {}
    data.forEach(r => { cnt[r.status] = (cnt[r.status] || 0) + 1 })
    setStatCnt(cnt)
  }, [])

  useEffect(() => { fetchStatCnt() }, [fetchStatCnt])

  // ── メインデータ取得（サーバーサイドフィルタ） ─
  const fetchRows = useCallback(async (pg = 0) => {
    setLoading(true)
    try {
      const from = pg * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      // pharmaciesにフィルター適用
      let q = supabase.from('pharmacies')
        .select('id,name,pref,city,addr,phone,chain,rep,rx_count,concentration,zip', { count: 'exact' })
        .order('pref')
        .range(from, to)

      if (fPref  && fPref  !== '全て') q = q.eq('pref', fPref)
      if (fCity  && fCity  !== '全て') q = q.eq('city', fCity)
      if (fChain && fChain !== '')     q = q.ilike('chain', `%${fChain}%`)
      if (fText  && fText  !== '')     q = q.or(`name.ilike.%${fText}%,addr.ilike.%${fText}%,phone.ilike.%${fText}%,chain.ilike.%${fText}%`)
      if (fRxMin && fRxMin !== '')     q = q.gte('rx_count', Number(fRxMin))

      const { data: phData, count, error } = await q
      if (error) throw error

      if (!phData?.length) {
        setRows([]); setTotal(count || 0); setLoading(false); return
      }

      // 対応するcall_recordsを取得
      const ids = phData.map(p => p.id)
      let crQuery = supabase.from('call_records')
        .select('pharmacy_id,status,assignee,memo,next_action,last_call,locked')
        .in('pharmacy_id', ids)

      if (fStatus && fStatus !== '全て') crQuery = crQuery.eq('status', fStatus)
      if (fMember && fMember !== '全て') crQuery = crQuery.eq('assignee', fMember)

      const { data: crData } = await crQuery

      // マージ
      const crMap = {}
      crData?.forEach(r => { crMap[r.pharmacy_id] = r })

      // ステータス・担当者フィルターがある場合は絞り込み
      let merged = phData.map(p => ({
        pharmacy: p,
        call: crMap[p.id] || { pharmacy_id: p.id, status: '未着手', assignee: '未割当', memo: '', next_action: '', last_call: null, locked: false }
      }))

      if (fStatus && fStatus !== '全て') {
        merged = merged.filter(r => r.call.status === fStatus)
      }
      if (fMember && fMember !== '全て') {
        merged = merged.filter(r => r.call.assignee === fMember)
      }

      setRows(merged)
      setTotal(count || 0)
    } catch(e) {
      console.error(e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [fPref, fCity, fChain, fText, fRxMin, fStatus, fMember])

  // フィルター変更時にpage=0でリセット
  useEffect(() => {
    setPage(0)
    fetchRows(0)
  }, [fPref, fCity, fChain, fText, fRxMin, fStatus, fMember])

  useEffect(() => {
    fetchRows(page)
  }, [page])

  // 検索をデバウンス
  const handleSearch = (v) => {
    setSearchInput(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setFText(v), 400)
  }

  const selectedRow = sel ? rows.find(r => r.pharmacy.id === sel) : null
  const selectedP   = selectedRow?.pharmacy
  const selectedC   = selectedRow?.call

  useEffect(() => {
    if (selectedC) { setEMemo(selectedC.memo || ''); setENext(selectedC.next_action || '') }
  }, [sel])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── アクション ──────────────────────────────
  const updateCall = useCallback(async (id, patch) => {
    setRows(prev => prev.map(r => r.pharmacy.id === id ? { ...r, call: { ...r.call, ...patch } } : r))
    const existing = rows.find(r => r.pharmacy.id === id)?.call
    await supabase.from('call_records').upsert({
      pharmacy_id: id,
      status:      existing?.status   || '未着手',
      assignee:    existing?.assignee || '未割当',
      memo:        existing?.memo     || '',
      next_action: existing?.next_action || '',
      locked:      existing?.locked   || false,
      ...patch,
      updated_by: user.id,
    }, { onConflict: 'pharmacy_id' })
  }, [rows, user])

  const setStatus = useCallback(async (id, status) => {
    const lastCall = ['架電済', '折り返し待ち'].includes(status)
      ? new Date().toISOString().slice(0, 10)
      : rows.find(r => r.pharmacy.id === id)?.call?.last_call
    await updateCall(id, { status, last_call: lastCall })
    await supabase.from('call_history').insert({ pharmacy_id: id, status, created_by: user.id })
    fetchStatCnt()
  }, [rows, updateCall, user, fetchStatCnt])

  const setAssignee  = (id, assignee) => updateCall(id, { assignee })
  const toggleLock   = (id) => {
    const locked = !rows.find(r => r.pharmacy.id === id)?.call?.locked
    updateCall(id, { locked })
  }

  const saveMemo = () => {
    if (!sel) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => updateCall(sel, { memo: eMemo, next_action: eNext }), 300)
  }

  // ── 一括設定 ────────────────────────────────
  const executeBulk = useCallback(async () => {
    if (!bulkAssignee && !bulkStatus && !bulkLock) return

    const confirmed = window.confirm(`現在の絞り込み条件の全件に一括設定します。よろしいですか？`)
    if (!confirmed) return

    // ロック済み以外のIDを全件取得（ページをまたいで）
    let allIds = []
    for (let from = 0; from < 100000; from += 5000) {
      let q = supabase.from('pharmacies').select('id').range(from, from + 4999)
      if (fPref  && fPref  !== '全て') q = q.eq('pref', fPref)
      if (fCity  && fCity  !== '全て') q = q.eq('city', fCity)
      if (fChain && fChain !== '')     q = q.ilike('chain', `%${fChain}%`)
      if (fText  && fText  !== '')     q = q.or(`name.ilike.%${fText}%,addr.ilike.%${fText}%,phone.ilike.%${fText}%`)
      if (fRxMin && fRxMin !== '')     q = q.gte('rx_count', Number(fRxMin))
      const { data } = await q
      if (!data?.length) break
      allIds = [...allIds, ...data.map(r => r.id)]
      if (data.length < 5000) break
    }

    // ロック済みを除外
    const { data: lockedData } = await supabase.from('call_records').select('pharmacy_id').eq('locked', true).in('pharmacy_id', allIds)
    const lockedIds = new Set(lockedData?.map(r => r.pharmacy_id) || [])
    const targets = allIds.filter(id => !lockedIds.has(id))

    if (!targets.length) { alert('対象がありません（全てロック済み）'); return }

    const BATCH = 500
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH).map(id => ({
        pharmacy_id:  id,
        status:      bulkStatus   || '未着手',
        assignee:    bulkAssignee || '未割当',
        locked:      bulkLock === 'lock' ? true : bulkLock === 'unlock' ? false : false,
        memo: '', next_action: '', updated_by: user.id,
      }))
      await supabase.from('call_records').upsert(batch, { onConflict: 'pharmacy_id', ignoreDuplicates: false })
    }

    setShowBulk(false)
    setBulkAssignee(''); setBulkStatus(''); setBulkLock('')
    fetchRows(page)
    fetchStatCnt()
    alert(`${targets.length.toLocaleString()}件に一括設定しました`)
  }, [bulkAssignee, bulkStatus, bulkLock, fPref, fCity, fChain, fText, fRxMin, user, page, fetchRows, fetchStatCnt])

  const exportCSV = async () => {
    let all = []
    for (let from = 0; from < 100000; from += 5000) {
      let q = supabase.from('pharmacies').select('id,name,pref,city,phone,chain').range(from, from + 4999)
      if (fPref  && fPref  !== '全て') q = q.eq('pref', fPref)
      if (fText  && fText  !== '')     q = q.or(`name.ilike.%${fText}%,phone.ilike.%${fText}%`)
      const { data } = await q
      if (!data?.length) break
      all = [...all, ...data]
      if (data.length < 5000) break
    }
    const ids = all.map(p => p.id)
    const { data: crData } = await supabase.from('call_records').select('*').in('pharmacy_id', ids)
    const crMap = {}
    crData?.forEach(r => { crMap[r.pharmacy_id] = r })

    const csvRows = [['薬局名', '都道府県', '市区町村', '電話番号', 'ステータス', '担当者', '最終架電', '次回アクション', 'メモ']]
    all.forEach(p => {
      const c = crMap[p.id] || {}
      csvRows.push([p.name, p.pref, p.city, p.phone, c.status || '未着手', c.assignee || '未割当', c.last_call || '', c.next_action || '', c.memo || ''])
    })
    const csv = csvRows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kakeiden.csv'; a.click()
  }

  const addMember    = () => { if (!newMember.trim()) return; const u = [...members, newMember.trim()]; setMembers(u); saveMembers(u); setNewMember('') }
  const removeMember = m  => { const u = members.filter(x => x !== m); setMembers(u); saveMembers(u) }
  const logout       = () => supabase.auth.signOut()

  const totalAll = Object.values(statCnt).reduce((a, v) => a + v, 0) || total

  // ── レンダー ────────────────────────────────
  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif", background: '#080e1a', minHeight: '100vh', color: '#c8d4e8' }}>

      {/* ヘッダー */}
      <header style={{ background: 'linear-gradient(180deg,#0d1829,#080e1a)', borderBottom: '1px solid #1a2744', position: 'sticky', top: 0, zIndex: 50, padding: isMobile ? '0 12px' : '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: isMobile ? 48 : 54 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#1d6aeb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>&#128138;</div>
            <div>
              <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 800, color: '#e8f0ff', letterSpacing: '0.06em' }}>PHARMA<span style={{ color: '#3b82f6' }}>CRM</span></div>
              {!isMobile && <div style={{ fontSize: 9, color: '#3b5280', letterSpacing: '0.12em' }}>&#20840;&#22269;&#34311;&#23616;&#26550;&#38651;&#31649;&#29702;</div>}
            </div>
          </div>

          {isMobile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#3b5280' }}>{totalAll.toLocaleString()}&#20214;</span>
              <button onClick={() => setShowMenu(!showMenu)} style={{ background: 'none', border: '1px solid #1a2744', borderRadius: 6, color: '#94a3b8', padding: '5px 9px', cursor: 'pointer', fontSize: 16 }}>&#9776;</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {[['list', '&#128203; &#26550;&#38651;&#12522;&#12473;&#12488;'], ['dashboard', '&#128202; &#12480;&#12483;&#12471;&#12517;&#12508;&#12540;&#12489;']].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: tab === t ? 'linear-gradient(135deg,#1d6aeb,#7c3aed)' : 'transparent', color: tab === t ? '#fff' : '#4a6490' }} dangerouslySetInnerHTML={{ __html: l }} />
              ))}
              <div style={{ width: 1, height: 20, background: '#1a2744' }} />
              <button onClick={() => setShowImport(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #1a2744', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'transparent', color: '#4a8aff' }}>&#128229; &#21462;&#36796;</button>
              <button onClick={exportCSV} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #1a2744', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'transparent', color: '#34d399' }}>&#128228; &#20986;&#21147;</button>
              <button onClick={() => setShowBulk(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #f59e0b44', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>&#9889; &#19968;&#25324;&#35373;&#23450;</button>
              <button onClick={() => setShowSettings(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #1a2744', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'transparent', color: '#94a3b8' }}>&#9881;&#65039;</button>
              <span style={{ fontSize: 11, color: '#3b5280', padding: '4px 10px', borderRadius: 6, background: '#0d1829', border: '1px solid #1a2744' }}>{totalAll.toLocaleString()}&#20214;</span>
              <button onClick={logout} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #1a2744', cursor: 'pointer', fontSize: 10, fontWeight: 700, background: 'transparent', color: '#3b5280' }}>&#12525;&#12464;&#12450;&#12454;&#12488;</button>
            </div>
          )}
        </div>

        {/* モバイルドロワー */}
        {isMobile && showMenu && (
          <div style={{ borderTop: '1px solid #1a2744', padding: '8px 0' }}>
            {[['list', '&#128203; &#26550;&#38651;&#12522;&#12473;&#12488;'], ['dashboard', '&#128202; &#12480;&#12483;&#12471;&#12517;&#12508;&#12540;&#12489;']].map(([t, l]) => (
              <button key={t} onClick={() => { setTab(t); setShowMenu(false) }} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: tab === t ? 'rgba(29,106,235,0.15)' : 'transparent', color: tab === t ? '#60a5fa' : '#94a3b8', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: l }} />
            ))}
            <div style={{ height: 1, background: '#1a2744', margin: '4px 0' }} />
            <button onClick={() => { setShowImport(true); setShowMenu(false) }} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: '#4a8aff', textAlign: 'left' }}>&#128229; CSV&#21462;&#36796;</button>
            <button onClick={() => { exportCSV(); setShowMenu(false) }} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: '#34d399', textAlign: 'left' }}>&#128228; &#20986;&#21147;</button>
            <button onClick={() => { setShowBulk(true); setShowMenu(false) }} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: '#f59e0b', textAlign: 'left' }}>&#9889; &#19968;&#25324;&#35373;&#23450;</button>
            <button onClick={() => { setShowSettings(true); setShowMenu(false) }} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: '#94a3b8', textAlign: 'left' }}>&#9881;&#65039; &#25285;&#24403;&#32773;&#35373;&#23450;</button>
            <button onClick={logout} style={{ display: 'block', width: '100%', padding: '11px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'transparent', color: '#ef4444', textAlign: 'left' }}>&#12525;&#12464;&#12450;&#12454;&#12488;</button>
          </div>
        )}

        {/* 進捗バー */}
        <div style={{ padding: '5px 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 9, color: '#3b5280', fontWeight: 700, whiteSpace: 'nowrap' }}>&#25104;&#32004; {statCnt['&#25104;&#32004;'] || 0} / {totalAll.toLocaleString()}</span>
          <div style={{ flex: 1, height: 3, background: '#1a2744', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((statCnt['&#25104;&#32004;'] || 0) / Math.max(totalAll, 1) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#1d6aeb,#7c3aed,#10b981)', transition: 'width 0.6s' }} />
          </div>
        </div>
      </header>

      {tab === 'dashboard' ? (
        <Dashboard statCnt={statCnt} totalAll={totalAll} members={members} isMobile={isMobile} />
      ) : (
        <MainList
          rows={rows} loading={loading} total={total} page={page} setPage={setPage} totalPages={totalPages}
          statCnt={statCnt} totalAll={totalAll}
          fStatus={fStatus} setFStatus={setFStatus}
          fPref={fPref} setFPref={v => { setFPref(v); setFCity('') }}
          fCity={fCity} setFCity={setFCity}
          fMember={fMember} setFMember={setFMember}
          searchInput={searchInput} handleSearch={handleSearch}
          fChain={fChain} setFChain={setFChain}
          fRxMin={fRxMin} setFRxMin={setFRxMin}
          prefs={prefs} cities={cities} members={members}
          sel={sel} setSel={setSel}
          selectedP={selectedP} selectedC={selectedC}
          eMemo={eMemo} setEMemo={setEMemo}
          eNext={eNext} setENext={setENext}
          setStatus={setStatus} setAssignee={setAssignee}
          saveMemo={saveMemo} toggleLock={toggleLock}
          showAdv={showAdv} setShowAdv={setShowAdv}
          isMobile={isMobile}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); setPage(0); fetchRows(0); fetchStatCnt() }} />}

      {/* 一括設定 */}
      {showBulk && (
        <Modal onClose={() => setShowBulk(false)} title="&#9889; &#19968;&#25324;&#35373;&#23450;">
          <div style={{ fontSize: 12, color: '#4a6490', marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: '#080e1a', border: '1px solid #1a2744' }}>
            &#29694;&#22312;&#12398;&#32508;&#12426;&#36796;&#12415;&#26465;&#20214;&#12398;&#20840;&#20214;&#65288;&#12525;&#12483;&#12463;&#38500;&#22806;&#65289;&#12395;&#36�;&#29992;&#12375;&#12414;&#12377;
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#4a6490', fontWeight: 700, marginBottom: 8 }}>&#25285;&#24403;&#32773;&#12434;&#19968;&#25324;&#35373;&#23450;</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setBulkAssignee('')} style={{ padding: '6px 12px', borderRadius: 6, border: `1.5px solid ${bulkAssignee === '' ? '#475569' : '#1a2744'}`, background: bulkAssignee === '' ? 'rgba(71,85,105,0.2)' : 'transparent', color: bulkAssignee === '' ? '#94a3b8' : '#3b5280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>&#22793;&#26356;&#12375;&#12394;&#12356;</button>
              {members.filter(m => m !== '&#26410;&#21106;&#24403;').map(m => (
                <button key={m} onClick={() => setBulkAssignee(bulkAssignee === m ? '' : m)} style={{ padding: '6px 12px', borderRadius: 6, border: `1.5px solid ${bulkAssignee === m ? '#1d6aeb' : '#1a2744'}`, background: bulkAssignee === m ? 'rgba(29,106,235,0.2)' : 'transparent', color: bulkAssignee === m ? '#60a5fa' : '#3b5280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{m}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#4a6490', fontWeight: 700, marginBottom: 8 }}>&#12473;&#12486;&#12540;&#12479;&#12473;&#12434;&#19968;&#25324;&#35373;&#23450;</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setBulkStatus('')} style={{ padding: '6px 12px', borderRadius: 6, border: `1.5px solid ${bulkStatus === '' ? '#475569' : '#1a2744'}`, background: bulkStatus === '' ? 'rgba(71,85,105,0.2)' : 'transparent', color: bulkStatus === '' ? '#94a3b8' : '#3b5280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>&#22793;&#26356;&#12375;&#12394;&#12356;</button>
              {Object.entries(ACTIVE_STATUSES).map(([s, c]) => (
                <button key={s} onClick={() => setBulkStatus(bulkStatus === s ? '' : s)} style={{ padding: '6px 12px', borderRadius: 6, border: `1.5px solid ${bulkStatus === s ? c.color : '#1a2744'}`, background: bulkStatus === s ? c.bg : 'transparent', color: bulkStatus === s ? c.bright : '#3b5280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{STATUS_ICONS[s]} {s}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#4a6490', fontWeight: 700, marginBottom: 8 }}>&#128274; &#12525;&#12483;&#12463;&#12434;&#19968;&#25324;&#35373;&#23450;</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['', '&#22793;&#26356;&#12375;&#12394;&#12356;'], ['lock', '&#128274; &#19968;&#25324;&#12525;&#12483;&#12463;'], ['unlock', '&#128275; &#19968;&#25324;&#35299;&#38500;']].map(([v, l]) => (
                <button key={v} onClick={() => setBulkLock(bulkLock === v && v !== '' ? '' : v)} style={{ padding: '6px 14px', borderRadius: 6, border: `1.5px solid ${bulkLock === v && v !== '' ? '#f59e0b' : '#1a2744'}`, background: bulkLock === v && v !== '' ? 'rgba(245,158,11,0.2)' : 'transparent', color: bulkLock === v && v !== '' ? '#fbbf24' : '#3b5280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} dangerouslySetInnerHTML={{ __html: l }} />
              ))}
            </div>
          </div>
          <button onClick={executeBulk} disabled={!bulkAssignee && !bulkStatus && !bulkLock} style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: (!bulkAssignee && !bulkStatus && !bulkLock) ? '#1a2744' : 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: (!bulkAssignee && !bulkStatus && !bulkLock) ? 'not-allowed' : 'pointer' }}>
            &#9889; &#19968;&#25324;&#35373;&#23450;&#12434;&#23455;&#34892;
          </button>
        </Modal>
      )}

      {/* 担当者設定 */}
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} title="&#9881;&#65039; &#25285;&#24403;&#32773;&#35373;&#23450;">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 260, overflowY: 'auto' }}>
            {members.filter(m => m !== '&#26410;&#21106;&#24403;').map(m => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: '#1a2744' }}>
                <span style={{ fontSize: 14, color: '#c8d4e8', fontWeight: 600 }}>{m}</span>
                <button onClick={() => removeMember(m)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}>&#10005;</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={newMember} onChange={e => setNewMember(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMember()} placeholder="&#25285;&#24403;&#32773;&#21517;&#12434;&#20837;&#21147;"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #1a2744', background: '#080e1a', color: '#c8d4e8', fontSize: 14, outline: 'none' }} />
            <button onClick={addMember} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#1d6aeb', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>&#36861;&#21152;</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ━━ メインリスト ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MainList({ rows, loading, total, page, setPage, totalPages, statCnt, totalAll, fStatus, setFStatus, fPref, setFPref, fCity, setFCity, fMember, setFMember, searchInput, handleSearch, fChain, setFChain, fRxMin, setFRxMin, prefs, cities, members, sel, setSel, selectedP, selectedC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo, toggleLock, showAdv, setShowAdv, isMobile }) {

  if (isMobile && sel && selectedP && selectedC) {
    return <MobileDetail selectedP={selectedP} selectedC={selectedC} eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext} setStatus={setStatus} setAssignee={setAssignee} saveMemo={saveMemo} toggleLock={toggleLock} members={members} onBack={() => setSel(null)} />
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 82px)' }}>
      <div style={{ width: (!isMobile && sel) ? '55%' : '100%', display: 'flex', flexDirection: 'column', borderRight: (!isMobile && sel) ? '1px solid #1a2744' : 'none', transition: 'width 0.3s' }}>

        {/* フィルターバー */}
        <div style={{ padding: '10px 14px', background: '#0b1221', borderBottom: '1px solid #1a2744', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#2a3d60' }}>&#128269;</span>
            <input value={searchInput} onChange={e => handleSearch(e.target.value)} placeholder="&#34311;&#23616;&#21517;&#12539;&#20住;&#25152;&#12539;&#38651;&#35441;&#30058;&#21495;&#12539;&#31038;&#21517;"
              style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 6, border: '1px solid #1a2744', background: '#080e1a', color: '#c8d4e8', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <select value={fStatus || '&#20840;&#12390;'} onChange={e => setFStatus(e.target.value === '&#20840;&#12390;' ? '' : e.target.value)} style={SS}>
            {['&#20840;&#12390;', ...Object.keys(ACTIVE_STATUSES)].map(o => <option key={o}>{o}</option>)}
          </select>
          <select value={fPref || '&#20840;&#12390;'} onChange={e => setFPref(e.target.value === '&#20840;&#12390;' ? '' : e.target.value)} style={SS}>
            {prefs.map(o => <option key={o}>{o}</option>)}
          </select>
          <select value={fCity || '&#20840;&#12390;'} onChange={e => setFCity(e.target.value === '&#20840;&#12390;' ? '' : e.target.value)} style={SS}>
            {cities.map(o => <option key={o}>{o}</option>)}
          </select>
          <select value={fMember || '&#20840;&#12390;'} onChange={e => setFMember(e.target.value === '&#20840;&#12390;' ? '' : e.target.value)} style={SS}>
            {['&#20840;&#12390;', ...members].map(o => <option key={o}>{o}</option>)}
          </select>
          <button onClick={() => setShowAdv(!showAdv)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${(fChain || fRxMin) ? '#3b82f6' : '#1a2744'}`, background: (fChain || fRxMin) ? 'rgba(59,130,246,0.15)' : 'transparent', color: (fChain || fRxMin) ? '#60a5fa' : '#3b5280', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
            {(fChain || fRxMin) ? '&#128309;' : '&#9883;&#65039;'} &#35443;&#32048;
          </button>
        </div>

        {/* 詳細フィルター */}
        {showAdv && (
          <div style={{ padding: '10px 14px', background: '#0b1221', borderBottom: '1px solid #1a2744', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={fChain} onChange={e => setFChain(e.target.value)} placeholder="&#31038;&#21517;&#12391;&#32508;&#12426;&#36796;&#12415;"
              style={{ flex: 1, minWidth: 140, padding: '6px 10px', borderRadius: 6, border: `1px solid ${fChain ? '#3b82f6' : '#1a2744'}`, background: '#080e1a', color: '#c8d4e8', fontSize: 12, outline: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#3b5280', whiteSpace: 'nowrap' }}>&#30064;&#26041;&#31955;</span>
              <input value={fRxMin} onChange={e => setFRxMin(e.target.value)} placeholder="&#26519;&#20197;&#19978;" type="number"
                style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: `1px solid ${fRxMin ? '#3b82f6' : '#1a2744'}`, background: '#080e1a', color: '#c8d4e8', fontSize: 12, outline: 'none' }} />
              <span style={{ fontSize: 11, color: '#3b5280' }}>&#26519;&#20197;&#19978;</span>
            </div>
            <button onClick={() => { setFChain(''); setFRxMin('') }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>&#12463;&#12522;&#12450;</button>
          </div>
        )}

        {/* ステータスチップ */}
        <div style={{ padding: '6px 14px', background: '#080e1a', borderBottom: '1px solid #1a2744', display: 'flex', gap: 5, overflowX: 'auto' }}>
          <button onClick={() => setFStatus('')} style={{ padding: '3px 10px', borderRadius: 99, border: `1px solid ${!fStatus ? '#4a6490' : '#1a2744'}`, background: !fStatus ? 'rgba(74,100,144,0.2)' : 'transparent', color: !fStatus ? '#94a3b8' : '#2a3d60', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            &#20840;&#12390; {totalAll.toLocaleString()}
          </button>
          {Object.entries(ACTIVE_STATUSES).map(([s, c]) => (
            <button key={s} onClick={() => setFStatus(fStatus === s ? '' : s)} style={{ padding: '3px 10px', borderRadius: 99, border: `1px solid ${fStatus === s ? c.color : '#1a2744'}`, background: fStatus === s ? c.bg : 'transparent', color: fStatus === s ? c.bright : '#2a3d60', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {STATUS_ICONS[s]} {s} {statCnt[s] || 0}
            </button>
          ))}
        </div>

        {/* 件数・ページナビ */}
        <div style={{ padding: '5px 14px', background: '#080e1a', borderBottom: '1px solid #0d1829', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: '#2a3d60' }}>
            {loading ? '&#35501;&#12415;&#36796;&#12415;&#20013;...' : `${total.toLocaleString()}&#20214;&#20013; ${rows.length}&#20214;&#34920;&#31034;`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #1a2744', background: 'transparent', color: page === 0 ? '#2a3d60' : '#7ab3ff', cursor: page === 0 ? 'default' : 'pointer', fontSize: 11 }}>&#8592;</button>
              <span style={{ fontSize: 11, color: '#4a6490' }}>{page + 1}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #1a2744', background: 'transparent', color: page === totalPages - 1 ? '#2a3d60' : '#7ab3ff', cursor: page === totalPages - 1 ? 'default' : 'pointer', fontSize: 11 }}>&#8594;</button>
            </div>
          )}
        </div>

        {/* テーブル / カード */}
        {isMobile ? (
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {rows.map(({ pharmacy: p, call: c }) => {
              const st = ACTIVE_STATUSES[c.status] || ACTIVE_STATUSES['&#26410;&#30528;&#25163;']
              return (
                <div key={p.id} onClick={() => setSel(p.id)} style={{ padding: '13px 16px', borderBottom: '1px solid #0d1829', background: '#080e1a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 4, height: 48, borderRadius: 99, background: st?.color || '#64748b', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#e8f0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {c.locked && <span style={{ fontSize: 10, marginRight: 4 }}>&#128274;</span>}{p.name}
                      </div>
                      <span style={{ padding: '3px 8px', borderRadius: 4, background: st?.bg, color: st?.bright, fontSize: 10, fontWeight: 700, border: `1px solid ${st?.color}44`, marginLeft: 8, flexShrink: 0 }}>{STATUS_ICONS[c.status]} {c.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#3b5280' }}>{p.pref}</span>
                      <span style={{ fontSize: 12, color: '#3b5280', fontFamily: 'monospace' }}>{p.phone || '&#8212;'}</span>
                      {c.assignee !== '&#26410;&#21106;&#24403;' && <span style={{ fontSize: 12, color: '#4a8aff', fontWeight: 600 }}>&#128100; {c.assignee}</span>}
                    </div>
                  </div>
                  <div style={{ color: '#2a3d60', fontSize: 18, flexShrink: 0 }}>&#8250;</div>
                </div>
              )
            })}
            {!loading && rows.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#2a3d60', fontSize: 13 }}>&#26465;&#20214;&#12395;&#19968;&#33268;&#12377;&#12427;&#34311;&#23616;&#12364;&#12354;&#12426;&#12414;&#12379;&#12435;</div>}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0b1221', position: 'sticky', top: 0, zIndex: 2 }}>
                  {['', '&#34311;&#23616;&#21517;', '&#31038;&#21517;', '&#37117;&#36947;&#24220;&#30476;', '&#38651;&#35441;&#30058;&#21495;', '&#20966;&#26041;&#31955;', '&#12473;&#12486;&#12540;&#12479;&#12473;', '&#25285;&#24403;&#32773;', '&#26368;&#32066;&#26550;&#38651;'].map(h => (
                    <th key={h} style={{ padding: '8px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#2a3d60', borderBottom: '1px solid #1a2744', whiteSpace: 'nowrap' }} dangerouslySetInnerHTML={{ __html: h }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ pharmacy: p, call: c }, i) => {
                  const st = ACTIVE_STATUSES[c.status] || ACTIVE_STATUSES['&#26410;&#30528;&#25163;']
                  const isSel = sel === p.id
                  return (
                    <tr key={p.id} onClick={() => setSel(isSel ? null : p.id)} style={{ background: isSel ? 'rgba(29,106,235,0.12)' : i % 2 === 0 ? '#080e1a' : '#090f1c', cursor: 'pointer', borderBottom: '1px solid #0d1829' }}>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button onClick={e => { e.stopPropagation(); toggleLock(p.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: c.locked ? '#f59e0b' : '#2a3d60', padding: 0 }}>
                          {c.locked ? '&#128274;' : '&#128275;'}
                        </button>
                      </td>
                      <td style={{ padding: '7px 8px', fontSize: 12, color: isSel ? '#7ab3ff' : '#c8d4e8', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isSel && <span style={{ color: '#3b82f6', marginRight: 4 }}>&#9658;</span>}{p.name}
                      </td>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: '#4a6490', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.chain || '&#8212;'}</td>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: '#4a6490' }}>{p.pref}</td>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: '#4a6490', fontFamily: 'monospace' }}>{p.phone || '&#8212;'}</td>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: '#34d399' }}>{p.rx_count ? Number(p.rx_count).toLocaleString() : '-'}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{ padding: '2px 7px', borderRadius: 4, background: st?.bg, color: st?.bright, fontSize: 10, fontWeight: 700, border: `1px solid ${st?.color}44` }}>{STATUS_ICONS[c.status]} {c.status}</span>
                      </td>
                      <td style={{ padding: '7px 8px', fontSize: 11, color: c.assignee === '&#26410;&#21106;&#24403;' ? '#2a3d60' : '#7ab3ff' }}>{c.assignee}</td>
                      <td style={{ padding: '7px 8px', fontSize: 10, color: '#2a3d60' }}>{c.last_call || '&#8212;'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && rows.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#2a3d60', fontSize: 13 }}>&#26465;&#20214;&#12395;&#19968;&#33268;&#12375;&#12414;&#12379;&#12435;</div>}
          </div>
        )}
      </div>

      {/* デスクトップ詳細パネル */}
      {!isMobile && sel && selectedP && selectedC && (
        <DetailPanel selectedP={selectedP} selectedC={selectedC} eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext} setStatus={setStatus} setAssignee={setAssignee} saveMemo={saveMemo} toggleLock={toggleLock} members={members} onClose={() => setSel(null)} />
      )}
    </div>
  )
}

const SS = { padding: '6px 8px', borderRadius: 6, border: '1px solid #1a2744', background: '#080e1a', color: '#7ab3ff', fontSize: 11, outline: 'none', cursor: 'pointer' }

// ━━ 詳細パネル共通 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DetailPanel({ selectedP, selectedC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo, toggleLock, members, onClose, isFullScreen = false }) {
  const containerStyle = isFullScreen
    ? { minHeight: 'calc(100vh - 80px)', background: '#0b1221' }
    : { width: '45%', display: 'flex', flexDirection: 'column', background: '#0b1221', overflowY: 'auto' }

  return (
    <div style={containerStyle}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #1a2744', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#0d1829' }}>
        <div style={{ flex: 1, marginRight: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#e8f0ff', marginBottom: 4 }}>{selectedP.name}</div>
          {selectedP.chain && <div style={{ fontSize: 10, color: '#3b5280', marginBottom: 2 }}>&#128226; {selectedP.chain}</div>}
          {selectedP.rep   && <div style={{ fontSize: 10, color: '#3b5280', marginBottom: 4 }}>&#128100; {selectedP.rep}</div>}
          <div style={{ fontSize: 11, color: '#3b5280' }}>&#128205; {selectedP.addr}</div>
          <a href={`tel:${selectedP.phone}`} style={{ fontSize: 14, color: '#60a5fa', fontWeight: 800, textDecoration: 'none', display: 'block', marginTop: 4 }}>&#128222; {selectedP.phone || '&#8212;'}</a>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {selectedP.rx_count      && <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: 11, fontWeight: 700 }}>&#128138; {Number(selectedP.rx_count).toLocaleString()}&#26519;</span>}
            {selectedP.concentration && <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: 11, fontWeight: 700 }}>&#128202; &#38598;&#20013;&#29575; {selectedP.concentration}%</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => toggleLock(selectedP.id)} style={{ background: 'none', border: `1px solid ${selectedC.locked ? '#f59e0b' : '#334155'}`, borderRadius: 6, color: selectedC.locked ? '#f59e0b' : '#475569', cursor: 'pointer', fontSize: 13, padding: '5px 9px', fontWeight: 700 }}>
            {selectedC.locked ? '&#128274;' : '&#128275;'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#2a3d60', cursor: 'pointer', fontSize: 20 }}>&#10005;</button>
        </div>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section label="&#12473;&#12486;&#12540;&#12479;&#12473;&#22793;&#26356;">
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {Object.entries(ACTIVE_STATUSES).map(([s, c]) => {
              const on = selectedC.status === s
              return <button key={s} onClick={() => setStatus(selectedP.id, s)} style={{ padding: '5px 10px', borderRadius: 5, border: `1.5px solid ${on ? c.color : '#1a2744'}`, background: on ? c.bg : 'transparent', color: on ? c.bright : '#3b5280', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{STATUS_ICONS[s]} {s}</button>
            })}
          </div>
        </Section>
        <Section label="&#25285;&#24403;&#32773;">
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {members.map(m => {
              const on = selectedC.assignee === m
              return <button key={m} onClick={() => setAssignee(selectedP.id, m)} style={{ padding: '4px 10px', borderRadius: 5, border: `1.5px solid ${on ? '#1d6aeb' : '#1a2744'}`, background: on ? 'rgba(29,106,235,0.15)' : 'transparent', color: on ? '#7ab3ff' : '#3b5280', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{m}</button>
            })}
          </div>
        </Section>
        <Section label="&#27425;&#22238;&#12450;&#12463;&#12471;&#12519;&#12531;">
          <input value={eNext} onChange={e => setENext(e.target.value)} placeholder="&#20363;&#65306;&#26469;&#36023;&#26376;&#26332;&#12395;&#20877;&#26550;&#38651;"
            style={{ width: '100%', padding: '8px 11px', borderRadius: 6, border: '1px solid #1a2744', background: '#080e1a', color: '#c8d4e8', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </Section>
        <Section label="&#26550;&#38651;&#12513;&#12514;">
          <textarea value={eMemo} onChange={e => setEMemo(e.target.value)} rows={4} placeholder="&#26550;&#38651;&#20869;&#23481;&#12539;&#25285;&#24403;&#32773;&#21517;&#12394;&#12393;..."
            style={{ width: '100%', padding: '8px 11px', borderRadius: 6, border: '1px solid #1a2744', background: '#080e1a', color: '#c8d4e8', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </Section>
        <button onClick={saveMemo} style={{ padding: '10px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#1d6aeb,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          &#128190;&#12288;&#20445;&#23384;&#12377;&#12427;
        </button>
      </div>
    </div>
  )
}

function MobileDetail({ selectedP, selectedC, eMemo, setEMemo, eNext, setENext, setStatus, setAssignee, saveMemo, toggleLock, members, onBack }) {
  return <DetailPanel selectedP={selectedP} selectedC={selectedC} eMemo={eMemo} setEMemo={setEMemo} eNext={eNext} setENext={setENext} setStatus={setStatus} setAssignee={setAssignee} saveMemo={saveMemo} toggleLock={toggleLock} members={members} onClose={onBack} isFullScreen={true} />
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#2a3d60', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 7, textTransform: 'uppercase' }} dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </div>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#0d1829', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, border: '1px solid #1a2744', maxHeight: '90vh', overflowY: 'auto', fontFamily: "'Noto Sans JP',sans-serif" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#e8f0ff', marginBottom: 16 }} dangerouslySetInnerHTML={{ __html: title }} />
        {children}
        <button onClick={onClose} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #1a2744', background: 'transparent', color: '#4a6490', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>&#38281;&#12376;&#12427;</button>
      </div>
    </div>
  )
}

// ━━ ダッシュボード ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Dashboard({ statCnt, totalAll, members, isMobile }) {
  return (
    <div style={{ padding: isMobile ? 12 : 20, overflowY: 'auto', height: 'calc(100vh - 82px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#e8f0ff' }}>&#128202; &#12480;&#12483;&#12471;&#12517;&#12508;&#12540;&#12489;</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
        {Object.entries(ACTIVE_STATUSES).map(([s, c]) => (
          <div key={s} style={{ padding: isMobile ? '10px 8px' : '14px', borderRadius: 9, background: '#0b1221', border: `1px solid ${c.color}30`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${c.color},transparent)` }} />
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: c.bright }}>{statCnt[s] || 0}</div>
            <div style={{ fontSize: isMobile ? 9 : 11, color: '#4a6490', marginTop: 2 }}>{STATUS_ICONS[s]} {s}</div>
            <div style={{ fontSize: 9, color: '#2a3d60', marginTop: 2 }}>{Math.round((statCnt[s] || 0) / Math.max(totalAll, 1) * 100)}%</div>
          </div>
        ))}
        <div style={{ padding: isMobile ? '10px 8px' : '14px', borderRadius: 9, background: '#0b1221', border: '1px solid #1a2744' }}>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#e8f0ff' }}>{totalAll.toLocaleString()}</div>
          <div style={{ fontSize: isMobile ? 9 : 11, color: '#4a6490', marginTop: 2 }}>&#128203; &#32317;&#34311;&#23616;&#25968;</div>
        </div>
      </div>
    </div>
  )
}
