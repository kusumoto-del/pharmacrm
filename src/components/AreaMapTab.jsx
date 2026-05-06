import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── 担当者カラー（constants.js の MEMBERS と色を合わせてください）──
const MEMBERS = [
  { n: '駒井',   c: '#3b82f6' },
  { n: '佐々木', c: '#10b981' },
  { n: '谷畑',   c: '#f59e0b' },
  { n: '西尾',   c: '#ef4444' },
  { n: '御手洗', c: '#a855f7' },
  { n: '楠本',   c: '#06b6d4' },
  { n: '田中',   c: '#f97316' },
  { n: '佐藤',   c: '#84cc16' },
];

const REGION_IDS = {
  '北海道': [1],
  '東北':   [2,3,4,5,6,7],
  '関東':   [8,9,10,11,12,13,14],
  '中部':   [15,16,17,18,19,20,21,22,23],
  '近畿':   [24,25,26,27,28,29,30],
  '中国':   [31,32,33,34,35],
  '四国':   [36,37,38,39],
  '九州':   [40,41,42,43,44,45,46],
  '沖縄':   [47],
};

const PREF_NAMES = {
  1:'北海道',2:'青森',3:'岩手',4:'宮城',5:'秋田',6:'山形',7:'福島',
  8:'茨城',9:'栃木',10:'群馬',11:'埼玉',12:'千葉',13:'東京',14:'神奈川',
  15:'新潟',16:'富山',17:'石川',18:'福井',19:'山梨',20:'長野',
  21:'岐阜',22:'静岡',23:'愛知',24:'三重',25:'滋賀',26:'京都',
  27:'大阪',28:'兵庫',29:'奈良',30:'和歌山',31:'鳥取',32:'島根',
  33:'岡山',34:'広島',35:'山口',36:'徳島',37:'香川',38:'愛媛',
  39:'高知',40:'福岡',41:'佐賀',42:'長崎',43:'熊本',44:'大分',
  45:'宮崎',46:'鹿児島',47:'沖縄'
};

// 面積に応じたフォントサイズ（大きい県ほど大きく）
const LABEL_SIZE = {
  1:12,                                     // 北海道
  3:8, 15:8, 20:8, 21:8, 39:8,            // 岩手・新潟・長野・岐阜・高知
  2:7, 5:7, 6:7, 7:7, 17:7, 22:7,
  28:7, 32:7, 34:7, 35:7, 38:7,
  40:7, 43:7, 44:7, 45:7, 46:7,           // 中サイズ
  4:6.5, 8:6.5, 9:6.5, 10:6.5, 16:6.5,
  18:6.5, 19:6.5, 23:6.5, 24:6.5,
  26:6.5, 29:6.5, 30:6.5, 31:6.5,
  33:6.5, 36:6.5, 41:6.5, 42:6.5, 47:6.5, // 小サイズ
  11:6, 12:6, 25:6, 37:6,                  // より小さい
  13:5.5, 14:5.5, 27:5.5,                  // 最小（東京・神奈川・大阪）
};

const PREF_REGION = {};
Object.entries(REGION_IDS).forEach(([r, ids]) => ids.forEach(id => { PREF_REGION[id] = r; }));

const REGIONS = Object.keys(REGION_IDS);
const UNASSIGNED_FILL = '#c8d0dc';
const TOPO_URL = 'https://cdn.jsdelivr.net/npm/datamaps@0.5.10/src/js/data/jpn.topo.json';

export default function AreaMapTab({ supabase }) {
  const svgRef     = useRef(null);
  const wrapRef    = useRef(null);
  const pathsRef   = useRef(null);
  const labelsRef  = useRef(null);
  const selRef     = useRef(null);
  const asgnRef    = useRef({});

  const [asgn, setAsgn]           = useState({});
  const [selMember, setSelMember]  = useState(null);
  const [tooltip, setTooltip]      = useState({ visible: false, prefId: null, x: 0, y: 0 });
  const [status, setStatus]        = useState({ msg: '担当者を選んで都道府県をクリック', c: '' });
  const [saving, setSaving]        = useState(false);
  const [loading, setLoading]      = useState(true);
  const [mapErr, setMapErr]        = useState(false);

  useEffect(() => { asgnRef.current = asgn; }, [asgn]);
  useEffect(() => { selRef.current = selMember; }, [selMember]);

  // ── Supabase読み込み ──
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let done = false;
    supabase.from('pref_assignments').select('pref_name,member_name')
      .then(({ data, error }) => {
        if (done || error) return;
        const map = {};
        (data || []).forEach(row => {
          const entry = Object.entries(PREF_NAMES).find(([, v]) => v === row.pref_name);
          const m = MEMBERS.find(m => m.n === row.member_name);
          if (entry && m) map[Number(entry[0])] = m;
        });
        setAsgn(map);
      })
      .finally(() => { if (!done) setLoading(false); });
    return () => { done = true; };
  }, [supabase]);

  // ── D3地図初期化（1回のみ）──
  useEffect(() => {
    const d3 = window.d3, topo = window.topojson;
    if (!d3 || !topo || !svgRef.current) return;

    const proj = d3.geoMercator().center([136.5, 38]).scale(1550).translate([370, 360]);
    const pg = d3.geoPath(proj);
    const svg = d3.select(svgRef.current);

    fetch(TOPO_URL).then(r => r.json()).then(jp => {
      const features = topo.feature(jp, jp.objects.jpn).features;

      // 都道府県パス
      pathsRef.current = svg.selectAll('.pp')
        .data(features).join('path')
        .attr('class', 'pp')
        .attr('d', pg)
        .attr('fill', UNASSIGNED_FILL)
        .attr('stroke', 'rgba(255,255,255,0.55)')
        .attr('stroke-width', '0.7')
        .style('cursor', 'pointer')
        .on('click', (_, d) => {
          const cur = selRef.current;
          if (!cur) { setStatus({ msg: '先に担当者を選択してください', c: '' }); return; }
          setAsgn(prev => {
            const next = { ...prev };
            if (next[d.id]?.n === cur.n) {
              delete next[d.id];
              setStatus({ msg: `${PREF_NAMES[d.id]} の割当を解除`, c: '' });
            } else {
              next[d.id] = cur;
              setStatus({ msg: `${PREF_NAMES[d.id]} → 「${cur.n}」に設定`, c: cur.c });
            }
            return next;
          });
        })
        .on('mouseenter', (e, d) => {
          d3.select(e.currentTarget).raise()
            .attr('opacity', '0.72').attr('stroke', '#fff').attr('stroke-width', '1.5');
          const rect = wrapRef.current?.getBoundingClientRect();
          if (!rect) return;
          let x = e.clientX - rect.left + 12, y = e.clientY - rect.top - 10;
          if (x + 150 > rect.width) x -= 165;
          setTooltip({ visible: true, prefId: d.id, x, y });
        })
        .on('mousemove', (e) => {
          const rect = wrapRef.current?.getBoundingClientRect();
          if (!rect) return;
          let x = e.clientX - rect.left + 12, y = e.clientY - rect.top - 10;
          if (x + 150 > rect.width) x -= 165;
          setTooltip(prev => ({ ...prev, x, y }));
        })
        .on('mouseleave', (e, d) => {
          const a = asgnRef.current[d.id];
          d3.select(e.currentTarget).attr('opacity', '1')
            .attr('stroke', a ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)')
            .attr('stroke-width', '0.7');
          setTooltip(prev => ({ ...prev, visible: false }));
        });

      // 都道府県名ラベル（アウトライン付きで視認性UP）
      labelsRef.current = svg.selectAll('.pl')
        .data(features).join('text')
        .attr('class', 'pl')
        .attr('x', d => pg.centroid(d)[0])
        .attr('y', d => pg.centroid(d)[1] + 1)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', d => LABEL_SIZE[d.id] || 6.5)
        .attr('font-family', '-apple-system,Hiragino Sans,Yu Gothic UI,sans-serif')
        .attr('fill', 'rgba(40,50,70,0.92)')
        .attr('font-weight', '500')
        .attr('paint-order', 'stroke')          // ← アウトライン文字の核心
        .attr('stroke', 'rgba(255,255,255,0.8)')
        .attr('stroke-width', '2.5')
        .attr('stroke-linejoin', 'round')
        .attr('pointer-events', 'none')
        .text(d => PREF_NAMES[d.id] || '');

      setLoading(false);
    }).catch(() => { setMapErr(true); setLoading(false); });
  }, []);

  // ── asgn変化時にD3描画を更新 ──
  useEffect(() => {
    if (!pathsRef.current || !labelsRef.current) return;
    pathsRef.current
      .attr('fill', d => asgn[d.id]?.c || UNASSIGNED_FILL)
      .attr('stroke', d => asgn[d.id] ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)');
    labelsRef.current
      .attr('fill', d => asgn[d.id] ? 'rgba(255,255,255,0.95)' : 'rgba(40,50,70,0.92)')
      .attr('font-weight', d => asgn[d.id] ? '700' : '500')
      .attr('stroke', d => asgn[d.id] ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)')
      .attr('stroke-width', d => asgn[d.id] ? '2' : '2.5');
  }, [asgn]);

  const bulk = useCallback((region) => {
    const m = selRef.current;
    if (!m) { setStatus({ msg: '先に担当者を選択してください', c: '' }); return; }
    const ids = REGION_IDS[region] || [];
    setAsgn(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = m; }); return n; });
    setStatus({ msg: `${region}地方 ${ids.length}件を「${m.n}」に一括設定`, c: m.c });
  }, []);

  const clearAll = useCallback(() => {
    if (!window.confirm('全担当をクリアしますか？')) return;
    setAsgn({});
    setStatus({ msg: '全担当をクリアしました', c: '' });
  }, []);

  const save = useCallback(async () => {
    if (!supabase) return;
    setSaving(true);
    try {
      await supabase.from('pref_assignments').delete().neq('pref_name', '__x__');
      const rows = Object.entries(asgn).map(([id, m]) => ({
        pref_name: PREF_NAMES[id],
        member_name: m.n,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('pref_assignments').insert(rows);
        if (error) throw error;
      }
      setStatus({ msg: 'Supabaseに保存 — 全員に即時反映', c: '#22c55e' });
    } catch (e) {
      setStatus({ msg: '保存エラー: ' + e.message, c: '#ef4444' });
    } finally { setSaving(false); }
  }, [supabase, asgn]);

  const total = Object.keys(asgn).length;
  const tipAsgn = tooltip.prefId != null ? asgn[tooltip.prefId] : null;

  // ── スタイル定数 ──
  const S = {
    root:    { display:'flex', flexDirection:'column', height:'100%', minHeight:520 },
    hdr:     { padding:'8px 14px', borderBottom:'0.5px solid var(--color-border-tertiary)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 },
    hdrTitle:{ fontSize:13, fontWeight:600 },
    hdrSub:  { fontSize:11, fontWeight:400, color:'var(--color-text-secondary)', marginLeft:10 },
    saveBtn: (saving) => ({ padding:'4px 14px', borderRadius:6, border:'none', background: saving ? 'var(--color-background-secondary)' : '#3b82f6', color: saving ? 'var(--color-text-secondary)' : '#fff', fontSize:12, fontWeight:600, cursor: saving ? 'default' : 'pointer' }),
    body:    { display:'flex', flex:1, overflow:'hidden' },
    sb:      { width:158, flexShrink:0, borderRight:'0.5px solid var(--color-border-tertiary)', display:'flex', flexDirection:'column' },
    sbHd:    { padding:'7px 10px 4px', fontSize:10, color:'var(--color-text-tertiary)', letterSpacing:'.06em' },
    sbList:  { flex:1, overflowY:'auto', padding:'3px 5px' },
    sbFt:    { padding:'7px 10px', borderTop:'0.5px solid var(--color-border-tertiary)', fontSize:11, color:'var(--color-text-secondary)' },
    sfRow:   { display:'flex', justifyContent:'space-between', marginBottom:3 },
    mapCol:  { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
    bulkBar: { padding:'4px 10px', borderBottom:'0.5px solid var(--color-border-tertiary)', display:'flex', gap:3, flexWrap:'wrap', alignItems:'center', flexShrink:0 },
    rb:      { fontSize:10, padding:'2px 8px', borderRadius:10, border:'0.5px solid var(--color-border-secondary)', background:'transparent', color:'var(--color-text-secondary)', cursor:'pointer' },
    cb:      { fontSize:10, padding:'2px 8px', borderRadius:10, border:'0.5px solid #fca5a5', background:'transparent', color:'#ef4444', cursor:'pointer', marginLeft:'auto' },
    mapWrap: { flex:1, position:'relative', overflow:'hidden', background:'var(--color-background-secondary)' },
    svg:     { width:'100%', height:'100%', display:'block' },
    tip:     (x,y) => ({ position:'absolute', left:x, top:y, background:'var(--color-background-primary)', border:'0.5px solid var(--color-border-secondary)', borderRadius:'var(--border-radius-md)', padding:'6px 10px', pointerEvents:'none', zIndex:50, fontSize:12, whiteSpace:'nowrap' }),
    stbar:   { padding:'4px 12px', borderTop:'0.5px solid var(--color-border-tertiary)', fontSize:11, display:'flex', alignItems:'center', gap:5, flexShrink:0, minHeight:24 },
  };

  return (
    <div style={S.root}>
      {/* ヘッダー */}
      <div style={S.hdr}>
        <div style={S.hdrTitle}>
          エリア担当マップ
          <span style={S.hdrSub}>都道府県をクリックして担当を割り当て</span>
        </div>
        {supabase && (
          <button onClick={save} disabled={saving} style={S.saveBtn(saving)}>
            {saving ? '保存中...' : '保存'}
          </button>
        )}
      </div>

      <div style={S.body}>
        {/* サイドバー */}
        <div style={S.sb}>
          <div style={S.sbHd}>担当者を選択</div>
          <div style={S.sbList}>
            {MEMBERS.map(m => {
              const cnt = Object.values(asgn).filter(a => a.n === m.n).length;
              const on = selMember?.n === m.n;
              return (
                <div key={m.n}
                  onClick={() => { setSelMember(m); setStatus({ msg: `「${m.n}」選択中 — クリックで割当`, c: m.c }); }}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 8px', borderRadius:7, cursor:'pointer', marginBottom:2,
                    border: on ? `1.5px solid ${m.c}` : '1.5px solid transparent',
                    background: on ? m.c + '14' : 'transparent', transition:'all .1s' }}
                >
                  <div style={{ width:9, height:9, borderRadius:'50%', background:m.c, flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:500, flex:1, color:'var(--color-text-primary)' }}>{m.n}</span>
                  <span style={{ fontSize:11, fontWeight:600, padding:'1px 5px', borderRadius:8, background:m.c+'18', color:m.c, minWidth:22, textAlign:'center' }}>{cnt}</span>
                </div>
              );
            })}
          </div>
          <div style={S.sbFt}>
            <div style={S.sfRow}><span>割当済み</span><b style={{ color:'var(--color-text-primary)', fontWeight:600 }}>{total} / 47</b></div>
            <div style={S.sfRow}><span>未割当</span><b style={{ color:'var(--color-text-primary)', fontWeight:600 }}>{47 - total}件</b></div>
          </div>
        </div>

        {/* 地図エリア */}
        <div style={S.mapCol}>
          {/* 一括バー */}
          <div style={S.bulkBar}>
            <span style={{ fontSize:10, color:'var(--color-text-tertiary)', marginRight:2 }}>一括:</span>
            {REGIONS.map(r => (
              <button key={r} onClick={() => bulk(r)} style={S.rb}>{r}</button>
            ))}
            <button onClick={clearAll} style={S.cb}>全クリア</button>
          </div>

          {/* SVGマップ */}
          <div ref={wrapRef} style={S.mapWrap}>
            {loading && !mapErr && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'var(--color-text-secondary)' }}>
                地図を読み込み中...
              </div>
            )}
            {mapErr && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'var(--color-text-secondary)' }}>
                地図データの読み込みに失敗しました
              </div>
            )}
            <svg ref={svgRef} viewBox="0 0 800 700" style={S.svg} />

            {/* ツールチップ */}
            {tooltip.visible && tooltip.prefId != null && (
              <div style={S.tip(tooltip.x, tooltip.y)}>
                <div style={{ fontWeight:600, marginBottom:3 }}>
                  {PREF_NAMES[tooltip.prefId]}
                  {PREF_REGION[tooltip.prefId] && (
                    <span style={{ fontWeight:400, fontSize:10, color:'var(--color-text-secondary)', marginLeft:5 }}>
                      {PREF_REGION[tooltip.prefId]}
                    </span>
                  )}
                </div>
                {tipAsgn
                  ? <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:tipAsgn.c }} />
                      <span style={{ color:tipAsgn.c, fontWeight:700 }}>{tipAsgn.n}</span>
                    </div>
                  : <div style={{ fontSize:11, color:'var(--color-text-secondary)' }}>未割当</div>
                }
              </div>
            )}
          </div>

          {/* ステータスバー */}
          <div style={{ ...S.stbar, color: status.c || 'var(--color-text-secondary)' }}>
            {status.c && <div style={{ width:5, height:5, borderRadius:'50%', background:status.c, flexShrink:0 }} />}
            {status.msg}
          </div>
        </div>
      </div>
    </div>
  );
}
