// ステータス定義（新体系）
export const STATUSES = {
  // 区分
  '売手':     { color:'#f97316', bright:'#fb923c', bg:'rgba(249,115,22,0.12)', group:'区分' },
  '買手':     { color:'#06b6d4', bright:'#22d3ee', bg:'rgba(6,182,212,0.12)',  group:'区分' },
  'M&A済み':  { color:'#a855f7', bright:'#c084fc', bg:'rgba(168,85,247,0.12)', group:'区分' },
  // 架電ステータス
  '未着手':   { color:'#64748b', bright:'#94a3b8', bg:'rgba(100,116,139,0.12)', group:'ステータス' },
  // 架電済 - 受付系
  '不在':              { color:'#3b82f6', bright:'#60a5fa', bg:'rgba(59,130,246,0.10)', group:'受付' },
  '着信拒否':          { color:'#3b82f6', bright:'#60a5fa', bg:'rgba(59,130,246,0.10)', group:'受付' },
  '受付ブロック':      { color:'#3b82f6', bright:'#60a5fa', bg:'rgba(59,130,246,0.10)', group:'受付' },
  '折返し待ち':        { color:'#f59e0b', bright:'#fbbf24', bg:'rgba(245,158,11,0.12)',  group:'受付' },
  // 架電済 - 社長接続系
  '多忙':              { color:'#10b981', bright:'#34d399', bg:'rgba(16,185,129,0.10)', group:'社長' },
  '関心無し':          { color:'#10b981', bright:'#34d399', bg:'rgba(16,185,129,0.10)', group:'社長' },
  '関心有り':          { color:'#10b981', bright:'#34d399', bg:'rgba(16,185,129,0.12)', group:'社長' },
  'アポ取得':          { color:'#22c55e', bright:'#4ade80', bg:'rgba(34,197,94,0.15)',  group:'社長' },
  // 架電NG系
  '進行中':            { color:'#ef4444', bright:'#f87171', bg:'rgba(239,68,68,0.10)', group:'NG' },
  'クレーム有':        { color:'#ef4444', bright:'#f87171', bg:'rgba(239,68,68,0.10)', group:'NG' },
  '要注意':            { color:'#ef4444', bright:'#f87171', bg:'rgba(239,68,68,0.10)', group:'NG' },
}

export const STATUS_ICONS = {
  '売手':'🏷', '買手':'🛒', 'M&A済み':'✅',
  '未着手':'◯',
  '不在':'📵', '着信拒否':'🚫', '受付ブロック':'🔒', '折返し待ち':'⏳',
  '多忙':'😓', '関心無し':'😐', '関心有り':'😊', 'アポ取得':'📅',
  '進行中':'⚡', 'クレーム有':'⚠️', '要注意':'🔴',
}

export const STATUS_GROUPS = {
  '区分':     ['売手','買手','M&A済み'],
  'ステータス':['未着手'],
  '受付':     ['不在','着信拒否','受付ブロック','折返し待ち'],
  '社長接続': ['多忙','関心無し','関心有り','アポ取得'],
  '架電NG':   ['進行中','クレーム有','要注意'],
}

export const DEFAULT_MEMBERS = ['未割当','駒井','佐々木','谷畑','西尾','御手洗','楠本','田中','佐藤']

export function getMembers() {
  try {
    const saved = localStorage.getItem('pharmacrm_members')
    return saved ? JSON.parse(saved) : DEFAULT_MEMBERS
  } catch { return DEFAULT_MEMBERS }
}

export function saveMembers(members) {
  localStorage.setItem('pharmacrm_members', JSON.stringify(members))
}

export const SAMPLE_PHARMACIES = [
  {id:'S01',name:'サンプル薬局',pref:'東京都',city:'新宿区',addr:'東京都新宿区西新宿1-1-1',phone:'03-1234-5678',zip:'160-0023',chain:'サンプル株式会社',rep:'山田太郎'},
]
