import { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'

const AuthCtx = createContext(null)

export function AuthProvider({ children }){
  const [token, setToken] = useState(localStorage.getItem('adm_token')||'')
  const api = axios.create({ baseURL: import.meta.env.VITE_API_URL + '/api' })
  useEffect(()=>{ if(token){ localStorage.setItem('adm_token', token) } else { localStorage.removeItem('adm_token') } },[token])
  api.interceptors.request.use(cfg=>{ if(token){ cfg.headers.Authorization = `Bearer ${token}` } return cfg })
  const login = async (email, password)=>{
    const res = await api.post('/auth/login', { email, password })
    setToken(res.data.token)
  }
  const logout = ()=> setToken('')
  const value = { token, login, logout, api }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(){ return useContext(AuthCtx) }
