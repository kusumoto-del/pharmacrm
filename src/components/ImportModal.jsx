import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

const COL_MAP = {
  id:            ['SCUEL事業所コード', 'SCUEL_ID', 'ID', '№', 'No', 'NO', '施設コード', '医療機関コード'],
  chain:         ['サービス_開設法人名', '法人_名称', '会社名', '法人名', '開設者名'],
  rep:           ['サービス_開設者氏名', 'サービス_管理者氏名', '代表者', '開設者氏名', '管理者氏名'],
  name:          ['事業所_名称', 'サービス_事業所_名称', '薬局名', '施設名称', '名称'],
  pref:          ['事業所_都道府県', '都道府県', '都道府県名'],
  city:          ['事業所_市区町村', '市区町村', '市区町村名'],
  addr:          ['事業所_住所', '住所', '所在地'],
  phone:         ['サービス_電話番号', '電話番号', 'TEL', 'Tel'],
  fax:           ['サービス_FAX番号', 'FAX番号', 'FAX', 'Fax'],
  zip:           ['事業所_郵便番号', '郵便番号'],
  rxCount:       ['処方箋受付回数', '処方箋枚数', '受付回数'],
  concentration: ['集中率_処方箋受付回数に占める特定の保険医療機関に係るものの割合', '集中率', '集中率（%）'],
  status:        ['ステータス', 'status', 'Status'],
  assignee:      ['担当者', 'Assignee'],
  lastCall:      ['最終架電', '最終架電日'],
  nextAct:       ['次回アクション', '次回行動'],
  memo:          ['メモ', '備考', 'Memo'],
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const i = headers.findIndex(h => String(h).trim() === c)
    if (i !== -1) return i
  }
  return -1
}

function parseRows(rows) {
  if (rows.length < 2) throw new Error('データが空です')
  const headers = rows[0].map(h => String(h ?? '').trim())
  const cols = Object.fromEntries(
    Object.entries(COL_MAP).map(([k, v]) => [k, findCol(headers, v)])
  )
  const g = (row, k) => {
    const i = cols[k]
    return i >= 0 && row[i] != null ? String(row[i]).trim() : ''
  }

  const pharmacies = []
  const callRecords = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => c == null || c === '')) continue
    const nameVal = g(row, 'name')
    if (!nameVal) continue

    const id = g(row, 'id') || `R${i}`
    const pref = g(row, 'pref')
    const city = g(row, 'city')

    pharmacies.push({
      id,
      name:          nameVal,
      pref,
      city,
      addr:          g(row, 'addr') || `${pref}${city}`,
      phone:         g(row, 'phone'),
      fax:           g(row, 'fax'),
      zip:           g(row, 'zip'),
      chain:         g(row, 'chain'),
      rep:           g(row, 'rep'),
      rx_count:      g(row, 'rxCount') || null,
      concentration: g(row, 'concentration') || null,
    })

    callRecords.push({
      pharmacy_id:  id,
      status:       g(row, 'status')   || '未着手',
      assignee:     g(row, 'assignee') || '未割当',
      memo:         g(row, 'memo')     || '',
      next_action:  g(row, 'nextAct')  || '',
      last_call:    g(row, 'lastCall') || null,
    })
  }

  if (!pharmacies.length) throw new Error('有効なデータが見つかりませんでした')
  return { pharmacies, callRecords }
}

export default function ImportModal({ onClose, onDone }) {
  const [state, setState] = useState('idle')
  const [msg,   setMsg]   = useState('')
  const [drag,  setDrag]  = useState(false)
  const fileRef = useRef()

  const handleFile = async file => {
    if (!file) return
    setState('loading'); setMsg('ファイルを読み込み中...')
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      let rows = []

      if (ext === 'xlsx' || ext === 'xls') {
        setMsg('Excelファイルを解析中...')
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(buf, { type: 'array', cellDates: false })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })
      } else {
        setMsg('CSVファイルを解析中...')
        const text = await file.text()
        const clean = text.replace(/^\uFEFF/, '')
        rows = clean.split(/\r?\n/).filter(l => l.trim()).map(l => {
          const out = []; let cur = '', q = false
          for (let i = 0; i < l.length; i++) {
            const c = l[i]
            if (c === '"') { if (q && l[i+1]==='"'){cur+='"';i++}else q=!q }
            else if ((c===',' || c==='\t') && !q) { out.push(cur); cur='' }
            else cur += c
          }
          out.push(cur)
          return out
        })
      }

      const { pharmacies, callRecords } = parseRows(rows)
      setMsg(`${pharmacies.length.toLocaleString()}件を解析完了。Supabaseへ保存中...`)

      const BATCH = 500
      let saved = 0
      for (let i = 0; i < pharmacies.length; i += BATCH) {
        const { error } = await supabase.from('pharmacies').upsert(
          pharmacies.slice(i, i + BATCH), { onConflict: 'id' }
        )
        if (error) throw error
        saved += BATCH
        setMsg(`保存中... ${Math.min(saved, pharmacies.length).toLocaleString()} / ${pharmacies.length.toLocaleString()}件`)
      }

      for (let i = 0; i < callRecords.length; i += BATCH) {
        await supabase.from('call_records').upsert(
          callRecords.slice(i, i + BATCH),
          { onConflict: 'pharmacy_id', ignoreDuplicates: true }
        )
      }

      setState('done')
      setMsg(`${pharmacies.length.toLocaleString()}件の取込が完了しました`)
      onDone?.()
    } catch(e) {
      setState('error'); setMsg(e.message)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16, backdropFilter:'blur(4px)' }}>
      <div style={{ background:'#0d1829', borderRadius:14, padding:28, width:'100%', maxWidth:520, border:'1px solid #1a2744', fontFamily:"'Noto Sans JP',sans-serif" }}>

        <div style={{ fontSize:16, fontWeight:800, color:'#e8f0ff', marginBottom:6 }}>📥 薬局データ取込</div>
        <div style={{ fontSize:11, color:'#3b5280', marginBottom:16, lineHeight:1.8 }}>
          Excel（.xlsx）またはCSV（.csv）に対応。列名を自動認識します。
        </div>

        {/* 認識する列 */}
        <div style={{ background:'#080e1a', borderRadius:9, padding:'10px 14px', marginBottom:16, border:'1px solid #1a2744', fontSize:11, color:'#4a6490', lineHeight:2 }}>
          <div style={{ color:'#f59e0b', fontWeight:800, marginBottom:4 }}>📋 自動認識する列</div>
          {[
            ['薬局名',    '事業所_名称 / 薬局名'],
            ['会社名',    'サービス_開設法人名 / 会社名 / 法人名'],
            ['代表者',    'サービス_開設者氏名 / 代表者'],
            ['電話番号',  'サービス_電話番号 / 電話番号 / TEL'],
            ['処方箋枚数','処方箋受付回数 / 処方箋枚数'],
            ['集中率',    '集中率_処方箋受付回数に占める… / 集中率'],
            ['都道府県',  '事業所_都道府県 / 都道府県'],
            ['住所',      '事業所_住所 / 住所'],
          ].map(([label, cols]) => (
            <div key={label} style={{ display:'flex', gap:8 }}>
              <span style={{ color:'#7ab3ff', width:72, flexShrink:0 }}>{label}</span>
              <span>{cols}</span>
            </div>
          ))}
        </div>

        {/* ドロップゾーン */}
        {state !== 'done' && (
          <div
            onDragOver={e=>{e.preventDefault();setDrag(true)}}
            onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}}
            style={{ border:`2px dashed ${drag?'#1d6aeb':'#1a2744'}`, borderRadius:9, padding:28, textAlign:'center', marginBottom:14, background:drag?'rgba(29,106,235,0.06)':'transparent', transition:'all 0.2s' }}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])}/>
            <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
            <div onClick={()=>fileRef.current?.click()} style={{ color:'#4a8aff', fontSize:13, fontWeight:700, cursor:'pointer', marginBottom:4 }}>
              クリックしてファイルを選択
            </div>
            <div style={{ fontSize:11, color:'#2a3d60' }}>Excel（.xlsx）またはCSV をドラッグ＆ドロップ</div>
          </div>
        )}

        {state==='loading' && (
          <div style={{ textAlign:'center', padding:'12px 0' }}>
            <div style={{ color:'#7ab3ff', fontSize:13, marginBottom:8 }}>⏳ {msg}</div>
            <div style={{ height:4, background:'#1a2744', borderRadius:99, overflow:'hidden' }}>
              <div style={{ height:'100%', background:'linear-gradient(90deg,#1d6aeb,#7c3aed)', borderRadius:99, width:'60%' }}/>
            </div>
          </div>
        )}
        {state==='done' && (
          <div style={{ textAlign:'center', padding:'12px 0' }}>
            <div style={{ fontSize:24, marginBottom:6 }}>✅</div>
            <div style={{ color:'#34d399', fontSize:14, fontWeight:800 }}>{msg}</div>
          </div>
        )}
        {state==='error' && (
          <div style={{ textAlign:'center', color:'#f87171', fontSize:12, padding:'10px 0' }}>❌ {msg}</div>
        )}

        <button onClick={onClose} style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #1a2744', background:'transparent', color:'#4a6490', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:6 }}>
          {state==='done' ? '閉じる' : 'キャンセル'}
        </button>
      </div>
    </div>
  )
}
