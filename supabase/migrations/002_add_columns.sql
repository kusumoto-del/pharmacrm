-- pharmaciesテーブルに列を追加
-- Supabase SQL Editor に貼り付けて実行してください

ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS rep           TEXT;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS rx_count      TEXT;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS concentration TEXT;  -- 集中率
