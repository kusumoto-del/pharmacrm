import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATUSES, STATUS_ICONS, MEMBERS, SAMPLE_PHARMACIES } from '../lib/constants'
import Header from '../components/Header'
import ImportModal from '../components/ImportModal'

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
export default function App({ user }) {
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
  const [showImport, setShowImport] = useState(false)
  const saveTimer = useRef(null)

  // ── Supabase からデータ取得 ─────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 薬局マスタ（最大10万件）
      const { data: phData, error: phErr } = await supabase
        .from('pharmacies').select('*').order('pref').limit(100000)
      if (phErr) throw phErr

      // 架電データ
      const { data: crData, error: crErr } = await supabase
        .from('call_records').select('*').limit(100000)
      if (crErr) throw crErr

      const ph = phData?.length ? phData : SAMPLE_PHARMACIES
      setPharmacies(ph)

      const callMap = {}
      ph.forEach(p => { callMap[p.id] = makeCall() })
      crData?.forEach(r => { callMap[r.pharmacy_id] = r })
      setCalls(callMap)
    } catch(e) {
      console.error(e)
      // フォールバック：サンプルデータ
      setPharmacies(SAMPLE_PHARMACIES)
      setCalls(Object.fromEntries(SAMPLE_PHARMACIES.map(p => [p.id, makeCall()])))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 選択薬局が変わったらメモを同期
  const selectedP = sel ? pharmacies.find(p => p.id === sel) : null
  const selectedC = sel ? calls[sel] : null
  useEffect(() => {
    if (selectedC) { setEMemo(selectedC.memo||''); setENext(selectedC.next_action||'') }
  }, [sel])

  // ── 派生データ ──────────────────────────────
  const prefs = useMemo(() =>
    ['全て', ...Array.from(new Set(pharmacies.map(p=>p.pref).filter(Boolean))).sort()],
    [pharmacies])

  const filtered = useMemo(() => pharmacies.filter(p => {
    const c = calls[p.id]
    if (!c) return false
    if (fStatus !== '全て' && c.status   !== fStatus)  return false
    if (fPref   !== '全て' && p.pref     !== fPref)    return false
    if (fMember !== '全て' && c.assignee !== fMember)  return false
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

  // ── ステータス変更（即時反映 + DB保存）──────
  const setStatus = useCallback(async (id, status) => {
    const lastCall = ['架電済','折り返し待ち'].includes(status)
      ? new Date().toISOString().slice(0,10) : calls[id]?.last_call

    setCalls(prev => ({ ...prev, [id]: { ...prev[id], status, last_call:lastCall } }))

    // Supabase upsert
    await supabase.from('call_records').upsert({
      pharmacy_id: id, status, last_call: lastCall,
      assignee: calls[id]?.assignee||'未割当',
      updated_by: user.id,
    }, { onConflict:'pharmacy_id' })

    // 履歴ログ
    await supabase.from('call_history').insert({
      pharmacy_id:id, status, assignee:calls[id]?.assignee, created_by:user.id,
    })
  }, [calls, user])

  // ── 担当者変更 ───────────────────────────────
  const setAssignee = useCallback(async (id, assignee) => {
    setCalls(prev => ({ ...prev, [id]: { ...prev[id], assignee } }))
    await supabase.from('call_records').upsert({
      pharmacy_id:id, assignee, status:calls[id]?.status||'未着手', updated_by:user.id,
    }, { onConflict:'pharmacy_id' })
  }, [calls, user])

  // ── メモ保存（デバウンス300ms）──────────────
  const saveMemo = useCallback(() => {
    if (!sel) return
    setCalls(prev => ({ ...prev, [sel]: { ...prev[sel], memo:eMemo, next_action:eNext } }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('call_records').upsert({
        pharmacy_id:sel, memo:eMemo, next_action:eNext,
        status:calls[sel]?.status||'未着手', assignee:calls[sel]?.assignee||'未割当',
        updated_by:user.id,
      }, { onConflict:'pharmacy_id' })
    }, 300)
  }, [sel, eMemo, eNext, calls, user])

  // ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#080e1a', display:'flex', alignItems:'center', justifyContent:'center', color:'#3b5280', fontSize:14, fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>💊</div>
        データを読み込み中...
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif", background:'#080e1a', minHeight:'100vh', color:'#c8d4e8' }}>
      <Header
        tab={tab} setTab={setTab}
        total={stats.total} donePct={donePct} statCnt={stats.cnt} statusIcons={STATUS_ICONS}
        user={user}
        onImport={()=>setShowImport(true)}
        onExport={()=>exportCSV(filtered, calls)}
      />

      {tab === 'dashboard' ? (
        <Dashboard stats={stats} calls={calls} pharmacies={pharmacies} members={MEMBERS}/>
      ) : (
        <div style={{ display:'flex', height:'calc(100vh - 96px)' }}>

          {/* ━━ リストパネル ━━ */}
          <div style={{ width:selectedP?'55%':'100%', display:'flex', flexDirection:'column', borderRight:'1px solid #1a2744', transition:'width 0.3s ease' }}>

            {/* フィルター */}
            <div style={{ padding:'10px 14px', background:'#0b1221', borderBottom:'1px solid #1a2744', display:'flex', gap:7, flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ position:'relative', flex:1, minWidth:170 }}>
                <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#2a3d60' }}>🔍</span>
                <input value={fText} onChange={e=>setFText(e.target.value)} placeholder="薬局名・住所・電話番号で検索..."
                  style={{ width:'100%', padding:'6px 10px 6px 28px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', boxSizing:'border-box' }}/>
              </div>
              <MiniSel value={fStatus}  onChange={setFStatus}  options={['全て',...Object.keys(STATUSES)]}/>
              <MiniSel value={fPref}    onChange={setFPref}    options={prefs}/>
              <MiniSel value={fMember}  onChange={setFMember}  options={['全て',...MEMBERS]}/>
              <span style={{ fontSize:11, color:'#2a3d60', fontWeight:700, whiteSpace:'nowrap' }}>{filtered.length.toLocaleString()}件</span>
            </div>

            {/* ステータスチップ */}
            <div style={{ padding:'7px 14px', background:'#080e1a', borderBottom:'1px solid #1a2744', display:'flex', gap:5, overflowX:'auto' }}>
              <Chip active={fStatus==='全て'} onClick={()=>setFStatus('全て')} color="#4a6490">全て {stats.total}</Chip>
              {Object.entries(STATUSES).map(([s,c])=>(
                <Chip key={s} active={fStatus===s} onClick={()=>setFStatus(fStatus===s?'全て':s)} color={c.color}>
                  {STATUS_ICONS[s]} {s} {stats.cnt[s]||0}
                </Chip>
              ))}
            </div>

            {/* テーブル */}
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
                      <tr key={p.id} onClick={()=>setSel(isSel?null:p.id)}
                        style={{ background:isSel?'rgba(29,106,235,0.12)':i%2===0?'#080e1a':'#090f1c', cursor:'pointer', borderBottom:'1px solid #0d1829', transition:'background 0.15s' }}>
                        <td style={{ padding:'8px 10px', fontSize:12, color:isSel?'#7ab3ff':'#c8d4e8', fontWeight:600, maxWidth:190, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {isSel && <span style={{ color:'#3b82f6', marginRight:4 }}>▶</span>}{p.name}
                        </td>
                        <td style={{ padding:'8px 10px', fontSize:11, color:'#4a6490' }}>{p.pref}</td>
                        <td style={{ padding:'8px 10px', fontSize:11, color:'#4a6490', fontFamily:"'Courier New',monospace" }}>{p.phone||'—'}</td>
                        <td style={{ padding:'8px 10px' }}>
                          <span style={{ padding:'2px 8px', borderRadius:4, background:st.bg, color:st.bright, fontSize:10, fontWeight:700, border:`1px solid ${st.color}44` }}>
                            {STATUS_ICONS[c.status]} {c.status}
                          </span>
                        </td>
                        <td style={{ padding:'8px 10px', fontSize:11, color:c.assignee==='未割当'?'#2a3d60':'#7ab3ff' }}>{c.assignee}</td>
                        <td style={{ padding:'8px 10px', fontSize:10, color:'#2a3d60' }}>{c.last_call||'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length===0 && (
                <div style={{ padding:48, textAlign:'center', color:'#2a3d60', fontSize:13 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>条件に一致する薬局がありません
                </div>
              )}
            </div>
          </div>

          {/* ━━ 詳細パネル ━━ */}
          {selectedP && selectedC && (
            <div style={{ width:'45%', display:'flex', flexDirection:'column', background:'#0b1221', overflowY:'auto' }}>
              <div style={{ padding:'16px 18px', borderBottom:'1px solid #1a2744' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1, marginRight:10 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:'#e8f0ff', marginBottom:4 }}>{selectedP.name}</div>
                    {selectedP.chain && <div style={{ fontSize:10, color:'#3b5280', marginBottom:4 }}>🏢 {selectedP.chain}</div>}
                    <div style={{ fontSize:11, color:'#3b5280' }}>📍 {selectedP.addr}</div>
                    <div style={{ fontSize:12, color:'#7ab3ff', marginTop:4, fontFamily:"'Courier New',monospace", fontWeight:700 }}>📞 {selectedP.phone||'—'}</div>
                  </div>
                  <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:'#2a3d60', cursor:'pointer', fontSize:20 }}>✕</button>
                </div>
                <div style={{ display:'flex', gap:7, marginTop:10, flexWrap:'wrap' }}>
                  {selectedP.zip        && <Tag>📮 {selectedP.zip}</Tag>}
                  {selectedP.open_time  && <Tag>🕐 {selectedP.open_time}〜{selectedP.close_time}</Tag>}
                  {selectedP.holiday    && <Tag>🗓 {selectedP.holiday}</Tag>}
                </div>
              </div>

              <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:16 }}>
                {/* ステータス */}
                <Section label="ステータス変更">
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {Object.entries(STATUSES).map(([s,c])=>{
                      const on = selectedC.status===s
                      return (
                        <button key={s} onClick={()=>setStatus(sel,s)} style={{ padding:'5px 11px', borderRadius:5, border:`1.5px solid ${on?c.color:'#1a2744'}`, background:on?c.bg:'transparent', color:on?c.bright:'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>
                          {STATUS_ICONS[s]} {s}
                        </button>
                      )
                    })}
                  </div>
                </Section>

                {/* 担当者 */}
                <Section label="担当者">
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {MEMBERS.map(m=>{
                      const on = selectedC.assignee===m
                      return (
                        <button key={m} onClick={()=>setAssignee(sel,m)} style={{ padding:'4px 11px', borderRadius:5, border:`1.5px solid ${on?'#1d6aeb':'#1a2744'}`, background:on?'rgba(29,106,235,0.15)':'transparent', color:on?'#7ab3ff':'#3b5280', fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </Section>

                {/* 次回アクション */}
                <Section label="次回アクション">
                  <input value={eNext} onChange={e=>setENext(e.target.value)} placeholder="例：来週月曜に再架電"
                    style={{ width:'100%', padding:'8px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', boxSizing:'border-box' }}/>
                </Section>

                {/* メモ */}
                <Section label="架電メモ">
                  <textarea value={eMemo} onChange={e=>setEMemo(e.target.value)} rows={4} placeholder="架電内容・担当者名・受付状況など..."
                    style={{ width:'100%', padding:'8px 11px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#c8d4e8', fontSize:12, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
                </Section>

                <button onClick={saveMemo} style={{ padding:'10px', borderRadius:7, border:'none', background:'linear-gradient(135deg,#1d6aeb,#7c3aed)', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', boxShadow:'0 2px 14px rgba(29,106,235,0.4)' }}>
                  💾　保存する
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showImport && <ImportModal onClose={()=>setShowImport(false)} onDone={()=>{setShowImport(false);fetchData()}}/>}
    </div>
  )
}

// ── 小コンポーネント ─────────────────────────
function Chip({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{ padding:'3px 10px', borderRadius:99, border:`1px solid ${active?color:'#1a2744'}`, background:active?`${color}22`:'transparent', color:active?color:'#2a3d60', fontSize:10, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s' }}>
      {children}
    </button>
  )
}
function MiniSel({ value, onChange, options }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={{ padding:'6px 9px', borderRadius:6, border:'1px solid #1a2744', background:'#080e1a', color:'#7ab3ff', fontSize:11, fontWeight:600, outline:'none', cursor:'pointer' }}>
      {options.map(o=><option key={o}>{o}</option>)}
    </select>
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
function Tag({ children }) {
  return <span style={{ padding:'3px 8px', borderRadius:4, background:'#1a2744', color:'#4a6490', fontSize:10, fontWeight:600 }}>{children}</span>
}

// ── ダッシュボード ───────────────────────────
function Dashboard({ stats, calls, pharmacies, members }) {
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
    return Object.entries(r).sort((a,b)=>b[1].total-a[1].total).slice(0,12)
  }, [pharmacies, calls])

  return (
    <div style={{ padding:20, overflowY:'auto', height:'calc(100vh - 96px)', display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:16, fontWeight:800, color:'#e8f0ff', letterSpacing:'0.04em' }}>📊 ダッシュボード</div>

      {/* ステータスカード */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
        {Object.entries(STATUSES).map(([s,c])=>(
          <div key={s} style={{ padding:'16px 14px', borderRadius:10, background:'#0b1221', border:`1px solid ${c.color}30`, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${c.color},transparent)` }}/>
            <div style={{ fontSize:26, fontWeight:900, color:c.bright }}>{stats.cnt[s]||0}</div>
            <div style={{ fontSize:11, color:'#4a6490', marginTop:4 }}>{STATUS_ICONS[s]} {s}</div>
            <div style={{ fontSize:10, color:'#2a3d60', marginTop:2 }}>{Math.round((stats.cnt[s]||0)/Math.max(stats.total,1)*100)}%</div>
          </div>
        ))}
        <div style={{ padding:'16px 14px', borderRadius:10, background:'#0b1221', border:'1px solid #1a2744' }}>
          <div style={{ fontSize:26, fontWeight:900, color:'#e8f0ff' }}>{stats.total.toLocaleString()}</div>
          <div style={{ fontSize:11, color:'#4a6490', marginTop:4 }}>📋 総薬局数</div>
        </div>
      </div>

      {/* 担当者別 */}
      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'11px 16px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff', letterSpacing:'0.04em' }}>👥 担当者別進捗</div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'#080e1a' }}>
            <th style={{ padding:'7px 14px', textAlign:'left', fontSize:9, color:'#2a3d60', fontWeight:700, letterSpacing:'0.1em' }}>担当者</th>
            <th style={{ padding:'7px 10px', textAlign:'center', fontSize:9, color:'#2a3d60', fontWeight:700 }}>合計</th>
            {Object.entries(STATUSES).map(([s,c])=><th key={s} style={{ padding:'7px 6px', textAlign:'center', fontSize:9, color:c.bright }}>{STATUS_ICONS[s]}</th>)}
          </tr></thead>
          <tbody>
            {members.map((m,i)=>(
              <tr key={m} style={{ borderTop:'1px solid #1a2744', background:i%2===0?'#0b1221':'#080e1a' }}>
                <td style={{ padding:'9px 14px', fontSize:12, color:m==='未割当'?'#2a3d60':'#c8d4e8', fontWeight:700 }}>{m}</td>
                <td style={{ padding:'9px 10px', textAlign:'center', fontSize:12, color:'#7ab3ff', fontWeight:800 }}>{memberStats[m]?.total||0}</td>
                {Object.entries(STATUSES).map(([s,c])=>(
                  <td key={s} style={{ padding:'9px 6px', textAlign:'center', fontSize:12, color:c.bright }}>{memberStats[m]?.[s]||0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 都道府県別 */}
      <div style={{ borderRadius:10, background:'#0b1221', border:'1px solid #1a2744', overflow:'hidden' }}>
        <div style={{ padding:'11px 16px', borderBottom:'1px solid #1a2744', fontSize:12, fontWeight:800, color:'#7ab3ff', letterSpacing:'0.04em' }}>🗾 都道府県別進捗（上位12）</div>
        <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px' }}>
          {prefStats.map(([pref,s])=>{
            const pct=Math.round(s.done/Math.max(s.total,1)*100)
            return(
              <div key={pref} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:90, fontSize:11, color:'#7ab3ff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flexShrink:0 }}>{pref}</div>
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
