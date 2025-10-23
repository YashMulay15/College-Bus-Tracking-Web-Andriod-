import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const DEPTS = ['AIDS','CSE','CSBS','Mechanical','Civil','Civil Environmental','Electrical','ENTC','Biotech','MBA','MCA']

export default function StudentManagement(){
  const { api } = useAuth()
  const nav = useNavigate()
  const [buses,setBuses]=useState([])
  const [form,setForm]=useState({
    bus_number:'', student_gender:'Male', semester:'Sem 1', bus_pass_validity:'', student_email:'', student_contact:'', student_name:'', student_prn:'', student_department: DEPTS[0]
  })
  useEffect(()=>{(async()=>{ const res = await api.get('/bus-driver'); setBuses(res.data) })()},[])
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  const phoneRe = /^[0-9]{10}$/
  const prnRe = /^[0-9]{10}$/
  const submit = async (e)=>{
    e.preventDefault();
    const payload = { ...form, student_contact: form.student_contact.replace(/\D/g,'').slice(0,10), student_prn: form.student_prn.replace(/\D/g,'').slice(0,10) }
    if (!prnRe.test(payload.student_prn)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Student PRN Number must be 10 digits' }}));
      return
    }
    if (!emailRe.test(payload.student_email)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Enter a valid student email' }}));
      return
    }
    if (!phoneRe.test(payload.student_contact)) {
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Student contact must be a 10-digit number' }}));
      return
    }
    // Client-side duplicate preflight
    try{
      const existing = (await api.get('/students')).data || []
      if (existing.some(s=> String(s.student_prn)===String(payload.student_prn))){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Duplicate: Student PRN Number already exists' }}));
        setForm(f=>({ ...f, student_prn:'' }))
        return
      }
      if (existing.some(s=> (s.student_email||'').trim().toLowerCase()===(payload.student_email||'').trim().toLowerCase())){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Duplicate: Student email already exists' }}));
        setForm(f=>({ ...f, student_email:'' }))
        return
      }
      if (existing.some(s=> String(s.student_contact)===String(payload.student_contact))){
        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'Duplicate: Student contact already exists' }}));
        setForm(f=>({ ...f, student_contact:'' }))
        return
      }
    }catch(_){ /* if preflight fails, server guard will still 409 with message */ }
    nav('/students/review', { state: payload })
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Student Management</h1>
      <form onSubmit={submit} className="bg-white p-4 rounded shadow grid gap-3 max-w-2xl">
        <div>
          <label className="block text-sm mb-1">Bus Number allocated</label>
          <select required className="w-full border rounded px-3 py-2" value={form.bus_number} onChange={e=>setForm(f=>({ ...f, bus_number: e.target.value }))}>
            <option value="">Select Bus</option>
            {buses.map(b=> <option key={b.id} value={b.bus_number}>{b.bus_number} - {b.driver_name}</option>)}
          </select>
        </div>
        {['student_name','student_prn','student_email','student_contact'].map(k=> (
          <div key={k}>
            <label className="block text-sm mb-1 capitalize">{k==='student_prn' ? 'Student PRN Number' : k.replaceAll('_',' ')}</label>
            {k==='student_prn' && (
              <input required className="w-full border rounded px-3 py-2" value={form.student_prn}
                onChange={e=>setForm(f=>({ ...f, student_prn: e.target.value.replace(/\D/g,'').slice(0,10) }))}
                inputMode="numeric" pattern="^[0-9]{10}$" title="10 digit PRN" maxLength={10} />
            )}
            {k==='student_email' && (
              <input required className="w-full border rounded px-3 py-2" value={form.student_email}
                onChange={e=>setForm(f=>({ ...f, student_email: e.target.value }))} type="email" />
            )}
            {k==='student_contact' && (
              <input required className="w-full border rounded px-3 py-2" value={form.student_contact}
                onChange={e=>setForm(f=>({ ...f, student_contact: e.target.value.replace(/\D/g,'').slice(0,10) }))}
                inputMode="numeric" pattern="^[0-9]{10}$" title="10 digit number" maxLength={10} />
            )}
            {k!=='student_prn' && k!=='student_email' && k!=='student_contact' && (
              <input required className="w-full border rounded px-3 py-2" value={form[k]||''} onChange={e=>setForm(f=>({ ...f, [k]: e.target.value }))} />
            )}
          </div>
        ))}
        <div>
          <label className="block text-sm mb-1">Student Gender</label>
          <select className="w-full border rounded px-3 py-2" value={form.student_gender} onChange={e=>setForm(f=>({ ...f, student_gender: e.target.value }))}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Current Semester</label>
          <select className="w-full border rounded px-3 py-2" value={form.semester} onChange={e=>setForm(f=>({ ...f, semester: e.target.value }))}>
            {Array.from({length:8},(_,i)=>`Sem ${i+1}`).map(s=> <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Bus pass validity (Date)</label>
          <input type="date" className="w-full border rounded px-3 py-2" value={form.bus_pass_validity} onChange={e=>setForm(f=>({ ...f, bus_pass_validity: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm mb-1">Student Department</label>
          <select className="w-full border rounded px-3 py-2" value={form.student_department} onChange={e=>setForm(f=>({ ...f, student_department: e.target.value }))}>
            {DEPTS.map(d=> <option key={d}>{d}</option>)}
          </select>
        </div>
        <button className="bg-gray-900 text-white px-4 py-2 rounded">Save Student & Map</button>
      </form>
    </div>
  )
}
