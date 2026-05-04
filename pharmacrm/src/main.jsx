import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import App   from './pages/App'

function Root() {
  const [session, setSession] = useState(undefined)  // undefined=loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ minHeight:'100vh', background:'#080e1a', display:'flex', alignItems:'center', justifyContent:'center', color:'#3b5280', fontSize:14, fontFamily:"'Noto Sans JP',sans-serif" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:12 }}>💊</div>
        読み込み中...
      </div>
    </div>
  )

  return session ? <App user={session.user}/> : <Login/>
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Root/></StrictMode>
)
