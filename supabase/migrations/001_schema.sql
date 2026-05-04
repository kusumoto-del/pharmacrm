-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PharmaCRM Supabase スキーマ
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 薬局マスタ
CREATE TABLE IF NOT EXISTS pharmacies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  pref        TEXT,
  city        TEXT,
  addr        TEXT,
  phone       TEXT,
  fax         TEXT,
  zip         TEXT,
  chain       TEXT,
  open_time   TEXT,
  close_time  TEXT,
  holiday     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 架電データ（チーム共有）
CREATE TABLE IF NOT EXISTS call_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT '未着手'
                CHECK (status IN ('未着手','架電済','折り返し待ち','商談中','NG','成約')),
  assignee    TEXT NOT NULL DEFAULT '未割当',
  memo        TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  last_call   DATE,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES auth.users(id),
  UNIQUE (pharmacy_id)
);

-- 架電履歴ログ
CREATE TABLE IF NOT EXISTS call_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  assignee    TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- RLS (Row Level Security) ポリシー
-- 認証済みユーザーのみ読み書き可能
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE pharmacies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

-- 薬局マスタ：認証済みなら読み取り・書き込み可
CREATE POLICY "auth_read_pharmacies"  ON pharmacies   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_pharmacies" ON pharmacies  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_pharmacies" ON pharmacies  FOR UPDATE USING (auth.role() = 'authenticated');

-- 架電データ：認証済みなら全操作可
CREATE POLICY "auth_all_call_records" ON call_records FOR ALL USING (auth.role() = 'authenticated');

-- 架電履歴：認証済みなら読み取り・追記可
CREATE POLICY "auth_read_history"   ON call_history FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_history" ON call_history FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- updated_at 自動更新トリガー
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_call_records_updated
  BEFORE UPDATE ON call_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- インデックス（大量データ対応）
CREATE INDEX IF NOT EXISTS idx_pharmacies_pref  ON pharmacies (pref);
CREATE INDEX IF NOT EXISTS idx_pharmacies_city  ON pharmacies (city);
CREATE INDEX IF NOT EXISTS idx_call_records_status   ON call_records (status);
CREATE INDEX IF NOT EXISTS idx_call_records_assignee ON call_records (assignee);
CREATE INDEX IF NOT EXISTS idx_call_history_pharmacy ON call_history (pharmacy_id);
