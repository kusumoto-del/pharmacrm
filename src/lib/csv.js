// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 厚労省オープンデータ 薬局CSV パーサー
// 文字コード：UTF-8-BOM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COL = {
  id:      ['医療機関コード','施設コード','施設ID'],
  name:    ['薬局名称','施設名称','名称','薬局名'],
  pref:    ['都道府県名','都道府県'],
  city:    ['市区町村名','市区町村'],
  addr:    ['所在地','住所'],
  phone:   ['電話番号'],
  fax:     ['ＦＡＸ番号','FAX番号','Fax番号'],
  zip:     ['郵便番号'],
  chain:   ['法人名','開設者名','開設者'],
  open:    ['開店時間','開始時間','営業開始'],
  close:   ['閉店時間','終了時間','営業終了'],
  holiday: ['定休日'],
}

function parseLine(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i+1]==='"'){cur+='"';i++} else q=!q }
    else if (c===',' && !q) { out.push(cur); cur='' }
    else cur += c
  }
  out.push(cur)
  return out
}

function detectCol(headers, cands) {
  for (const c of cands) {
    const i = headers.findIndex(h => h.replace(/\s/g,'').startsWith(c.replace(/\s/g,'')))
    if (i !== -1) return i
  }
  return -1
}

export function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('データが空です')

  const headers = parseLine(lines[0])
  const cols = Object.fromEntries(
    Object.entries(COL).map(([k, v]) => [k, detectCol(headers, v)])
  )
  const g = (row, k) => {
    const i = cols[k]
    return i >= 0 && row[i] ? row[i].trim() : ''
  }

  const records = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i])
    if (row.every(c => !c.trim())) continue
    const pref = g(row,'pref'), city = g(row,'city')
    records.push({
      id:         g(row,'id') || `R${i}`,
      name:       g(row,'name') || '（名称不明）',
      pref, city,
      addr:       g(row,'addr') || `${pref}${city}`,
      phone:      g(row,'phone'),
      fax:        g(row,'fax'),
      zip:        g(row,'zip'),
      chain:      g(row,'chain'),
      open_time:  g(row,'open'),
      close_time: g(row,'close'),
      holiday:    g(row,'holiday'),
    })
  }
  if (!records.length) throw new Error('有効なレコードが見つかりません')
  return records
}
