import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('⚠️ Supabase環境変数が未設定です。.env ファイルを確認してください。')
}

export const supabase = createClient(url || '', key || '')
