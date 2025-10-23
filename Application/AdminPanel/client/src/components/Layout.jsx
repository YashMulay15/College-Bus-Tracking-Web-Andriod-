import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useEffect, useState } from 'react'

export default function Layout() {
  const { logout } = useAuth()
  const [toasts, setToasts] = useState([])

  useEffect(()=>{
    const onToast = (e)=>{
      const id = Math.random().toString(36).slice(2)
      const t = { id, message: e.detail?.message || 'Done', type: e.detail?.type || 'success' }
      setToasts(prev=>[...prev, t])
      setTimeout(()=> setToasts(prev=>prev.filter(x=>x.id!==id)), e.detail?.duration || 3000)
    }
    window.addEventListener('toast', onToast)
    return ()=> window.removeEventListener('toast', onToast)
  },[])

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top App Bar */}
      <div className="bg-[#18397A] text-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain" />
            <div>
              <div className="text-sm tracking-wide opacity-90">KOLHAPUR INSTITUTE OF TECHNOLOGY'S</div>
              <div className="font-semibold text-lg leading-5">COLLEGE OF ENGINEERING KOLHAPUR</div>
              <div className="text-[11px] opacity-80">(EMPOWERED AUTONOMOUS)</div>
            </div>
          </div>
          <button onClick={logout} className="text-sm px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded transition">Logout</button>
        </div>
        <div className="text-center text-[12px] opacity-80 pb-2">Bus Management System</div>
      </div>

      <div className="relative flex-1 flex max-w-7xl mx-auto w-full gap-6 px-4 py-6">
        {/* Watermark */}
        <div className="pointer-events-none select-none fixed inset-0 bg-[url('/logo.png')] bg-center bg-no-repeat opacity-[0.05]"></div>
        {/* Sidebar */}
        <aside className="w-64 bg-white rounded-lg shadow-sm border border-slate-200 h-fit sticky top-4 self-start">
          <nav className="p-2 space-y-1">
            <NavLink to="/" end className={({isActive})=>`block px-3 py-2 rounded transition ${isActive?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>Dashboard</NavLink>
            <NavLink to="/allocation" className={({isActive})=>`block px-3 py-2 rounded transition ${isActive?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>Bus & Driver Allocation</NavLink>
            <NavLink to="/students" className={({isActive})=>`block px-3 py-2 rounded transition ${isActive?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>Student Management</NavLink>
            <NavLink to="/mapping" className={({isActive})=>`block px-3 py-2 rounded transition ${isActive?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>Mapping Overview</NavLink>
            <NavLink to="/users" className={({isActive})=>`block px-3 py-2 rounded transition ${isActive?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>User Management</NavLink>
            <NavLink to="/passes" className={({isActive})=>`block px-3 py-2 rounded transition ${isActive?'bg-slate-900 text-white':'hover:bg-slate-100'}`}>Bus Pass Management</NavLink>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-[60] space-y-2">
        {toasts.map(t=> (
          <div key={t.id} className={`px-4 py-3 rounded shadow text-white ${t.type==='error'?'bg-red-600':'bg-emerald-600'} animate-[fadeIn_0.2s_ease-in]`}>{t.message}</div>
        ))}
      </div>

      {/* Footer */}
      <footer className="bg-[#18397A] text-white mt-6">
        <div className="max-w-7xl mx-auto px-4 py-3 text-center text-[12px] opacity-90">
          Made with <span className="text-pink-300">♥</span> by <span className="font-medium">Vaishnavi Hajare</span> · <span className="font-medium">Tanvi Patil</span> · <span className="font-medium">Atharva Pawar</span> · <span className="font-medium">Yash Mulay</span>
          <div className="opacity-80">All Rights Reserved © 2025</div>
        </div>
      </footer>
    </div>
  )
}
