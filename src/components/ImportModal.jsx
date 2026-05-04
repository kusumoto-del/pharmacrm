import { useState, useRef } from 'react'
import { MHLW_URL } from '../lib/constants'
import { parseCSV } from '../lib/csv'
import { supabase } from '../lib/supabase'

export default function ImportModal({ onClose, onDone }) {
  const [state, setState] = useState('idle')  // idle|loading|done|error
  const [msg,   setMsg]   = useState('')
  const [drag,  setDrag]  = useState(false)
  const fileRef = useRef()

  const handleFile = async file => {
    if (!file) return
    setState('loading'); setMsg('CSVを解析中...')
    try {
      const text = await file.text()
      const records = parseCSV(text)

      setMsg(`${records.length.toLocaleString()}件を解析完了。Supabaseへ保存中...`)

      // バッチで500件ずつupsert（大量データ対応）
      const BATCH = 500
      let inserted = 0
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH)
        const { error } = await supabase.from('pharmacies').upsert(batch, { onConflict: 'id' })
        if (error) throw error
        inserted += batch.length
        setMsg(`保存中... ${inserted.toLocaleString()} / ${records.length.toLocaleString()}件`)
      }

      // call_records の初期レコードを一括作成（既存はスキップ）
      const callInit = records.map(r => ({ pharmacy_id: r.id, status:'未着手', assignee:'未割当', memo:'', next_action:'' }))
      for (let i = 0; i < callInit.length; i += BATCH) {
        await supabase.from('call_records').upsert(callInit.slice(i, i + BATCH), { onConflict: 'pharmacy_id', ignoreDuplicates: true })
      }

      setState('done')
      setMsg(`✅ ${records.length.toLocaleString()}件の取込が完了しました`)
      onDone?.()
    } catch(e) {
      setState('error'); setMsg(e.message)
    }
  }

  const C = {
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, backdropFilter:'blur(4px)' },
    card:    { background:'#0d1829', borderRadius:14, padding:30, width:540, border:'1px solid #1a2744', boxShadow:'0 20px 60px rgba(0,0,0,0.6)', fontFamily:"'Noto Sans JP',sans-serif" },
  }

  return (
    <div style={C.overlay}>
      <div style={C.card}>
        <div style={{ fontSize:16, fontWeight:800, color:'#e8f0ff', marginBottom:6 }}>📥 厚労省オープンデータ CSV 取込</div>

        {/* 手順 */}
        <div style={{ background:'#080e1a', borderRadius:9, padding:'12px 16px', marginBottom:18, border:'1px solid #1a2744' }}>
          <div style={{ fontSize:11, color:'#f59e0b', fontWeight:800, marginBottom:8, letterSpacing:'0.05em' }}>📋 取込手順</div>
          {[
            <><a href={MHLW_URL} target="_blank" rel="noreferrer" style={{color:'#4a8aff'}}>厚労省オープンデータページ</a>を開く</>,
            '「薬局」ZIPをダウンロード → 解凍',
            '解凍した 05_pharmacy_*.csv を下記にドロップ',
          ].map((t,i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:6 }}>
              <span style={{ width:18, height:18, borderRadius:99, background:'rgba(29,106,235,0.25)', color:'#4a8aff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</span>
              <span style={{ fontSize:11, color:'#7ab3ff', lineHeight:1.6 }}>{t}</span>
            </div>
          ))}
          <div style={{ fontSize:10, color:'#2a3d60', marginTop:6 }}>※ 最新版（2025年12月1日）全国約6.5万件 ／ 営利利用可（PDL1.0）</div>
        </div>

        {/* ドロップゾーン */}
        {state !== 'done' && (
          <div
            onDragOver={e=>{e.preventDefault();setDrag(true)}}
            onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}}
            style={{ border:`2px dashed ${drag?'#1d6aeb':'#1a2744'}`, borderRadius:9, padding:26, textAlign:'center', marginBottom:14, background:drag?'rgba(29,106,235,0.06)':'transparent', transition:'all 0.2s' }}
          >
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
            <div style={{ fontSize:30, marginBottom:8 }}>📄</div>
            <div onClick={()=>fileRef.current?.click()} style={{ color:'#4a8aff', fontSize:13, fontWeight:700, cursor:'pointer', marginBottom:4 }}>クリックして CSV を選択</div>
            <div style={{ fontSize:11, color:'#2a3d60' }}>または .csv ファイルをドラッグ＆ドロップ</div>
          </div>
        )}

        {state==='loading' && <div style={{ textAlign:'center', color:'#7ab3ff', fontSize:13, padding:'10px 0' }}>⏳ {msg}</div>}
        {state==='done'    && <div style={{ textAlign:'center', color:'#34d399', fontSize:13, fontWeight:800, padding:'10px 0' }}>{msg}</div>}
        {state==='error'   && <div style={{ textAlign:'center', color:'#f87171', fontSize:12, padding:'10px 0' }}>❌ {msg}</div>}

        <button onClick={onClose} style={{ width:'100%', padding:10, borderRadius:7, border:'1px solid #1a2744', background:'transparent', color:'#4a6490', fontSize:12, fontWeight:700, cursor:'pointer', marginTop:6 }}>
          {state==='done' ? '閉じる' : 'キャンセル'}
        </button>
      </div>
    </div>
  )
}
