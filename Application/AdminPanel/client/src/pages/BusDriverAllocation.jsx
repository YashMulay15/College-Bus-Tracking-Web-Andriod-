import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function BusDriverAllocation(){
  const nav = useNavigate()
  const { api } = useAuth()
  const [form,setForm]=useState({
    bus_plate_number:'', bus_number:'', driver_name:'', driver_gender:'Male', driver_contact:'', driver_email:''
  })
  const plateRe = /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/
  const phoneRe = /^[0-9]{10}$/
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  const submit=async(e)=>{
    e.preventDefault();
    const p = { ...form, bus_plate_number: form.bus_plate_number.toUpperCase() }
    if (!plateRe.test(p.bus_plate_number)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Invalid plate. Use LLNNLLNNNN (e.g., MH12AB1234)' }}));
      return
    }
    if (!phoneRe.test(p.driver_contact)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Driver contact must be a 10-digit number' }}));
      return
    }
    if (!emailRe.test(p.driver_email)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Enter a valid driver email' }}));
      return
    }
    // Duplicate checks
    try{
      const [driversRes, busesRes] = await Promise.all([
        api.get('/bus-driver'),
        api.get('/bus-driver/buses')
      ])
      const drivers = driversRes.data || []
      const buses = busesRes.data || []
      if (buses.some(b=> (b.bus_plate_number||'').toUpperCase()===p.bus_plate_number)){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Bus plate number already exists' }}));
        return
      }
      if (buses.some(b=> b.bus_number===p.bus_number)){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Bus number already exists' }}));
        return
      }
      if (drivers.some(d=> (d.driver_name||'').trim().toLowerCase()===p.driver_name.trim().toLowerCase())){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Driver name already exists' }}));
        return
      }
      if (drivers.some(d=> String(d.driver_contact)===String(p.driver_contact))){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Driver contact already exists' }}));
        return
      }
      if (drivers.some(d=> (d.driver_email||'').trim().toLowerCase()===p.driver_email.trim().toLowerCase())){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Driver email already exists' }}));
        return
      }
    }catch(err){ /* if check fails, proceed; server will validate too */ }
    nav('/review', { state: p })
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Bus & Driver Allocation</h1>
      <form onSubmit={submit} className="bg-white p-4 rounded shadow grid gap-3 max-w-2xl">
        {[ 'bus_plate_number','bus_number','driver_name','driver_contact','driver_email' ].map(k=> (
          <div key={k}>
            <label className="block text-sm mb-1 capitalize">{k.replaceAll('_',' ')}</label>
            {k==='bus_plate_number' && (
              <input
                required
                className="w-full border rounded px-3 py-2"
                value={form.bus_plate_number}
                onChange={e=>setForm(f=>({ ...f, bus_plate_number: e.target.value.toUpperCase() }))}
                pattern="^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$"
                title="Format: LLNNLLNNNN (e.g., MH12AB1234)"
                maxLength={10}
              />
            )}
            {k==='driver_contact' && (
              <input
                required
                className="w-full border rounded px-3 py-2"
                value={form.driver_contact}
                onChange={e=>setForm(f=>({ ...f, driver_contact: e.target.value.replace(/\D/g,'').slice(0,10) }))}
                inputMode="numeric"
                pattern="^[0-9]{10}$"
                title="10 digit number"
                maxLength={10}
              />
            )}
            {k==='driver_email' && (
              <input
                required
                className="w-full border rounded px-3 py-2"
                value={form.driver_email}
                onChange={e=>setForm(f=>({ ...f, driver_email: e.target.value }))}
                type="email"
              />
            )}
            {k!=='bus_plate_number' && k!=='driver_contact' && k!=='driver_email' && (
              <input required className="w-full border rounded px-3 py-2" value={form[k]||''} onChange={e=>setForm(f=>({ ...f, [k]: e.target.value }))} />
            )}
          </div>
        ))}
        <div>
          <label className="block text-sm mb-1">Driver Gender</label>
          <select className="w-full border rounded px-3 py-2" value={form.driver_gender} onChange={e=>setForm(f=>({ ...f, driver_gender: e.target.value }))}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        <button className="bg-gray-900 text-white px-4 py-2 rounded">Review Allocation</button>
      </form>
    </div>
  )
}
