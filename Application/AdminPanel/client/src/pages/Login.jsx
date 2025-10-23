import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login(){
  const { login } = useAuth()
  const nav = useNavigate()
  const [email,setEmail]=useState('admin@example.com')
  const [password,setPassword]=useState('Admin@123')
  const [err,setErr]=useState('')
  const [loading,setLoading]=useState(false)
  const submit = async (e)=>{
    e.preventDefault(); setErr(''); setLoading(true)
    try{
      await login(email,password);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Welcome back!' } }))
      nav('/')
    }catch(e){
      setErr('Invalid credentials')
      window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'error', message: 'Invalid credentials' } }))
    }finally{ setLoading(false) }
  }
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
        </div>
        <div className="text-center text-[12px] opacity-80 pb-2">Bus Management System</div>
      </div>

      {/* Watermark */}
      <div className="pointer-events-none select-none fixed inset-0 bg-[url('/logo.png')] bg-center bg-no-repeat opacity-[0.05]"></div>

      {/* Content */}
      <div className="flex-1 grid place-items-center px-4 py-10">
        <form onSubmit={submit} className="w-full max-w-md bg-white/90 backdrop-blur p-6 rounded-xl shadow-lg border border-slate-200">
          <h1 className="text-xl font-semibold mb-4 text-slate-800">Admin Login</h1>
          {err && <div className="text-red-600 text-sm mb-3">{err}</div>}
          <label className="block text-sm mb-1">Email</label>
          <input className="w-full border rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-slate-300" value={email} onChange={e=>setEmail(e.target.value)} />
          <label className="block text-sm mb-1">Password</label>
          <input type="password" className="w-full border rounded px-3 py-2 mb-5 focus:outline-none focus:ring-2 focus:ring-slate-300" value={password} onChange={e=>setPassword(e.target.value)} />
          <button disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white py-2.5 rounded transition">{loading?'Signing in...':'Login'}</button>
        </form>
      </div>

      {/* Footer */}
      <footer className="bg-[#18397A] text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 text-center text-[12px] opacity-90">
          Made with <span className="text-pink-300">♥</span> by <span className="font-medium">Vaishnavi Hajare</span> · <span className="font-medium">Tanvi Patil</span> · <span className="font-medium">Atharva Pawar</span> · <span className="font-medium">Yash Mulay</span>
          <div className="opacity-80">All Rights Reserved © 2025</div>
        </div>
      </footer>
    </div>
  )
}
