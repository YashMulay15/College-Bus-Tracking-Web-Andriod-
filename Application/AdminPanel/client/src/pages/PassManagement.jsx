import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

function parseDate(d){
  if (!d) return null
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}
function daysUntil(date){
  const now = new Date(); now.setHours(0,0,0,0)
  const dt = parseDate(date); if (!dt) return null
  const t = new Date(dt); t.setHours(0,0,0,0)
  return Math.ceil((t - now) / (1000*60*60*24))
}
function statusOf(passDate){
  const du = daysUntil(passDate)
  if (du===null) return { key:'unknown', label:'Unknown', color:'bg-gray-400' }
  if (du < 0) return { key:'expired', label:'Expired', color:'bg-red-600' }
  if (du <= 7) return { key:'expiring', label:'Expiring Soon', color:'bg-yellow-500' }
  return { key:'active', label:'Active', color:'bg-emerald-600' }
}

export default function PassManagement(){
  const { api } = useAuth()
  const [students,setStudents]=useState([])
  const [loading,setLoading]=useState(false)
  const [running,setRunning]=useState(false)
  const [tab,setTab]=useState('active') // 'active' | 'expiring' | 'expired'
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(10)
  const [sortKey,setSortKey]=useState('student_name')
  const [sortDir,setSortDir]=useState('asc')

  const fetchStudents = async()=>{
    setLoading(true)
    try{
      const res = await api.get('/students')
      setStudents(Array.isArray(res.data)? res.data : [])
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to load students'
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }finally{ setLoading(false) }
  }
  useEffect(()=>{ fetchStudents() },[])

  const enriched = useMemo(()=> students.map(s=> ({ ...s, _status: statusOf(s.bus_pass_validity) })),[students])
  const counts = useMemo(()=>{
    const c = { active:0, expiring:0, expired:0 }
    for (const s of enriched){ if (s._status.key in c) c[s._status.key]++ }
    return c
  },[enriched])

  const filtered = useMemo(()=> enriched.filter(s=> s._status.key===tab),[enriched, tab])
  const sorted = useMemo(()=>{
    const data = [...filtered]
    data.sort((a,b)=>{
      const av = a?.[sortKey]; const bv = b?.[sortKey]
      const ax = typeof av==='string'? av.toLowerCase(): av
      const bx = typeof bv==='string'? bv.toLowerCase(): bv
      if (ax==null && bx==null) return 0
      if (ax==null) return sortDir==='asc'?-1:1
      if (bx==null) return sortDir==='asc'?1:-1
      if (ax<bx) return sortDir==='asc'?-1:1
      if (ax>bx) return sortDir==='asc'?1:-1
      return 0
    })
    return data
  },[filtered, sortKey, sortDir])
  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total/pageSize))
  const pageData = useMemo(()=> sorted.slice((page-1)*pageSize, (page-1)*pageSize + pageSize), [sorted, page, pageSize])
  useEffect(()=>{ setPage(1) },[tab, pageSize, total])

  const onSort=(key)=>{ setPage(1); if (sortKey===key) setSortDir(d=> d==='asc'?'desc':'asc'); else { setSortKey(key); setSortDir('asc') } }

  const removeUser = async (id)=>{
    const ok = window.confirm('Remove this expired student? This will delete their account and mappings.')
    if (!ok) return
    try{
      await api.delete(`/students/${id}`)
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:'Student removed successfully' }}));
      await fetchStudents()
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to remove student'
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }
  }

  const removeAllExpired = async ()=>{
    if (tab !== 'expired') return
    const toDelete = filtered
    if (!toDelete.length){
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message:'No expired students to remove' }}));
      return
    }
    const ok = window.confirm(`Remove ALL expired students? This will delete ${toDelete.length} accounts and their mappings.`)
    if (!ok) return
    setRunning(true)
    try{
      const results = await Promise.allSettled(toDelete.map(s=> api.delete(`/students/${s.id}`)))
      const fulfilled = results.filter(r=> r.status==='fulfilled').length
      const rejected = results.length - fulfilled
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:`Removed ${fulfilled} students. Failed: ${rejected}` }}));
      await fetchStudents()
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to remove all expired'
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }finally{ setRunning(false) }
  }

  const sendRemindersNow = async ()=>{
    setRunning(true)
    try{
      const type = tab==='expiring' ? 'first' : (tab==='expired' ? 'expired' : '')
      const res = await api.post(`/passes/reminders/run${type?`?type=${type}`:''}`)
      const r = res.data || {}
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:`Reminders sent. First: ${r.firstCount||0}, Final: ${r.finalCount||0}, Sent: ${r.sent||0}, Failed: ${r.failed||0}` }}));
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to send reminders'
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }finally{ setRunning(false) }
  }

  const Card = ({title,count,color,onClick})=> (
    <button onClick={onClick} className="flex-1 min-w-[200px] bg-white rounded shadow p-4 text-left border hover:shadow-md transition">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full ${color}`}></span>
        <div className="text-2xl font-semibold">{count}</div>
      </div>
    </button>
  )

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Bus Pass Management</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card title="Active Passes" count={counts.active} color="bg-emerald-600" onClick={()=>setTab('active')} />
        <Card title="Expiring in 7 Days" count={counts.expiring} color="bg-yellow-500" onClick={()=>setTab('expiring')} />
        <Card title="Expired Passes" count={counts.expired} color="bg-red-600" onClick={()=>setTab('expired')} />
      </div>

      <div className="flex items-center justify-end gap-2">
        {tab!=='active' && (
          <button onClick={sendRemindersNow} disabled={running} className="px-3 py-2 bg-emerald-600 text-white rounded disabled:opacity-50">Send Reminder</button>
        )}
        {tab==='expired' && (
          <button onClick={removeAllExpired} disabled={running || !filtered.length} className="px-3 py-2 bg-red-600 text-white rounded disabled:opacity-50">Remove All</button>
        )}
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <div className="px-4 py-2 border-b flex items-center justify-between">
          <div className="font-medium">{tab==='active'?'Active Passes': tab==='expiring'?'Expiring Soon':'Expired Passes'}</div>
          <div className="text-sm text-gray-500">{total} records</div>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_name')}>Name</th>
              <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_prn')}>PRN</th>
              <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_department')}>Department</th>
              <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_contact')}>Contact Number</th>
              <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('bus_number')}>Bus Number</th>
              <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('bus_pass_validity')}>Pass Validity Date</th>
              <th className="text-left px-3 py-2">Pass Status</th>
              {tab==='expired' && <th className="text-left px-3 py-2">Action</th>}
            </tr>
          </thead>
          <tbody>
            {pageData.map((s,i)=> (
              <tr key={s.id||i} className="border-t">
                <td className="px-3 py-2">{s.student_name}</td>
                <td className="px-3 py-2">{s.student_prn}</td>
                <td className="px-3 py-2">{s.student_department}</td>
                <td className="px-3 py-2">{s.student_contact}</td>
                <td className="px-3 py-2">{s.bus_number}</td>
                <td className="px-3 py-2">{s.bus_pass_validity || '-'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-2 px-2 py-1 rounded text-white ${s._status.color}`}>
                    <span className="w-2 h-2 rounded-full bg-white/80"></span>
                    {s._status.label}
                  </span>
                </td>
                {tab==='expired' && (
                  <td className="px-3 py-2">
                    <button onClick={()=>removeUser(s.id)} className="px-3 py-1.5 bg-red-600 text-white rounded">Remove User</button>
                  </td>
                )}
              </tr>
            ))}
            {!pageData.length && (
              <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={8}>{loading?'Loading...':'No records'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">Page {page} of {totalPages}</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>Prev</button>
          <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}>Next</button>
          <select className="px-2 py-1 border rounded" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
            {[10,20,50,100].map(n=> <option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
