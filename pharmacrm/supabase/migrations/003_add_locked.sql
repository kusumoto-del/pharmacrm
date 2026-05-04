-- call_recordsテーブルにロック列を追加
-- Supabase SQL Editor に貼り付けて実行してください

ALTER TABLE call_records ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;
