export const STATUSES = {
  未着手:       { color: '#64748b', bright: '#94a3b8', bg: 'rgba(100,116,139,0.12)' },
  架電済:       { color: '#3b82f6', bright: '#60a5fa', bg: 'rgba(59,130,246,0.12)'  },
  折り返し待ち: { color: '#f59e0b', bright: '#fbbf24', bg: 'rgba(245,158,11,0.12)'  },
  売手:         { color: '#f97316', bright: '#fb923c', bg: 'rgba(249,115,22,0.12)'  },
  買手:         { color: '#06b6d4', bright: '#22d3ee', bg: 'rgba(6,182,212,0.12)'   },
  商談中:       { color: '#10b981', bright: '#34d399', bg: 'rgba(16,185,129,0.12)'  },
  架電NG:       { color: '#ef4444', bright: '#f87171', bg: 'rgba(239,68,68,0.12)'   },
  NG:           { color: '#6b7280', bright: '#9ca3af', bg: 'rgba(107,114,128,0.12)' },
  成約:         { color: '#a855f7', bright: '#c084fc', bg: 'rgba(168,85,247,0.12)'  },
}

export const STATUS_ICONS = {
  未着手: '◯', 架電済: '📞', 折り返し待ち: '⏳', 売手: '🏷', 買手: '🛒', 商談中: '💬', 架電NG: '🚫', NG: '✕', 成約: '★',
}

// 担当者はlocalStorageで上書き可能
export const DEFAULT_MEMBERS = ['未割当','田中','鈴木','佐藤','山田','伊藤','渡辺']

export function getMembers() {
  try {
    const saved = localStorage.getItem('pharmacrm_members')
    return saved ? JSON.parse(saved) : DEFAULT_MEMBERS
  } catch { return DEFAULT_MEMBERS }
}

export function saveMembers(members) {
  localStorage.setItem('pharmacrm_members', JSON.stringify(members))
}

export const MHLW_URL = 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/newpage_43373.html'

export const SAMPLE_PHARMACIES = [
  {id:'S01',name:'ナビイ薬局 新宿店',        pref:'東京都',  city:'新宿区',       addr:'東京都新宿区西新宿1-1-1',           phone:'03-1234-5678',zip:'160-0023',chain:'ナビイHD'},
  {id:'S02',name:'さくら調剤 渋谷店',        pref:'東京都',  city:'渋谷区',       addr:'東京都渋谷区道玄坂2-5-3',           phone:'03-2345-6789',zip:'150-0043',chain:'さくら調剤'},
  {id:'S03',name:'メディカル薬局 池袋',       pref:'東京都',  city:'豊島区',       addr:'東京都豊島区東池袋1-20-5',           phone:'03-3456-7890',zip:'170-0013',chain:'メディカルHD'},
  {id:'S04',name:'グリーン調剤 横浜西口',     pref:'神奈川県',city:'横浜市西区',   addr:'神奈川県横浜市西区高島2-1-1',       phone:'045-111-2222',zip:'220-0011',chain:'グリーン調剤'},
  {id:'S05',name:'大阪中央薬局',             pref:'大阪府',  city:'大阪市中央区', addr:'大阪府大阪市中央区本町2-3-4',       phone:'06-1234-5678', zip:'541-0053',chain:'大阪中央'},
  {id:'S06',name:'なにわ調剤 難波',          pref:'大阪府',  city:'大阪市浪速区', addr:'大阪府大阪市浪速区難波中1-5-2',     phone:'06-2345-6789', zip:'556-0011',chain:'なにわ調剤'},
  {id:'S07',name:'北海道調剤 札幌駅前',       pref:'北海道',  city:'札幌市北区',   addr:'北海道札幌市北区北6条西4丁目1',     phone:'011-123-4567', zip:'060-0806',chain:'北海道調剤'},
  {id:'S08',name:'愛知調剤 名古屋駅前',       pref:'愛知県',  city:'名古屋市中村区',addr:'愛知県名古屋市中村区名駅1-1-1',   phone:'052-111-2222', zip:'450-0002',chain:'愛知調剤'},
  {id:'S09',name:'九州調剤 博多',            pref:'福岡県',  city:'福岡市博多区', addr:'福岡県福岡市博多区博多駅前2-1-1',   phone:'092-111-2222', zip:'812-0011',chain:'九州調剤'},
  {id:'S10',name:'仙台メディカル薬局',        pref:'宮城県',  city:'仙台市青葉区', addr:'宮城県仙台市青葉区中央1-2-3',       phone:'022-111-2222', zip:'980-0021',chain:'仙台メディカル'},
]
