import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

function formatDateYYYYMMDD(d){
  const dt = new Date(d || Date.now());
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const da = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

function downloadCsv(rows, filename){
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv = [cols.join(',')].concat(rows.map(r=> cols.map(c=>esc(r[c])).join(','))).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function UserManagement(){
  const { api } = useAuth()
  const [tab,setTab] = useState('students') // 'students' | 'drivers'
  const [students,setStudents]=useState([])
  const [drivers,setDrivers]=useState([])
  const [buses,setBuses]=useState([])
  const [loading,setLoading]=useState(false)
  const [page,setPage]=useState(1)
  const [pageSize,setPageSize]=useState(10)
  const [sortKey,setSortKey]=useState('')
  const [sortDir,setSortDir]=useState('asc')

  const refetch = async()=>{
    setLoading(true)
    try{
      // Fetch both lists so we can compute driver->students count reliably
      const [stRes, drRes, buRes] = await Promise.all([
        api.get('/students'),
        api.get('/bus-driver'),
        api.get('/bus-driver/buses')
      ])
      setStudents(stRes.data||[])
      setDrivers(drRes.data||[])
      setBuses(buRes.data||[])
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to load data'
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }finally{ setLoading(false) }
  }
  useEffect(()=>{ refetch() },[tab])

  // Enrich drivers with Students Allocated count by bus_number
  const driverWithCounts = useMemo(()=>{
    const byBus = new Map()
    for (const s of students){
      const k = s.bus_number || ''
      byBus.set(k, (byBus.get(k)||0)+1)
    }
    const plateByBus = new Map()
    for (const b of buses){ plateByBus.set(b.bus_number, b.bus_plate_number) }
    return drivers.map(d=> ({
      ...d,
      bus_plate_number: d.bus_plate_number || plateByBus.get(d.bus_number||'') || '',
      _students_allocated: byBus.get(d.bus_number||'')||0,
    }))
  },[drivers, students, buses])

  const data = tab==='students' ? students : driverWithCounts
  const total = data.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const sortedData = useMemo(()=>{
    if (!sortKey) return data
    const copy = [...data]
    copy.sort((a,b)=>{
      const av = a?.[sortKey]
      const bv = b?.[sortKey]
      const ax = typeof av === 'string' ? av.toLowerCase() : av
      const bx = typeof bv === 'string' ? bv.toLowerCase() : bv
      if (ax==null && bx==null) return 0
      if (ax==null) return sortDir==='asc'? -1: 1
      if (bx==null) return sortDir==='asc'? 1: -1
      if (ax < bx) return sortDir==='asc'? -1: 1
      if (ax > bx) return sortDir==='asc'? 1: -1
      return 0
    })
    return copy
  },[data, sortKey, sortDir])

  const pageData = useMemo(()=>{
    const start = (page-1)*pageSize
    return sortedData.slice(start, start+pageSize)
  },[sortedData,page,pageSize])
  useEffect(()=>{ setPage(1) },[tab, pageSize, total])

  const exportExcel = async ()=>{
    const today = formatDateYYYYMMDD(new Date())
    const rows = tab==='students'
      ? students.map(s=>({
          Name: s.student_name,
          PRN: s.student_prn,
          'Contact Number': s.student_contact,
          'Email ID': s.student_email,
          Gender: s.student_gender,
          'Current Semester': s.semester,
          Department: s.student_department,
          'Bus Number Allocated': s.bus_number,
          'Bus Pass Validity': s.bus_pass_validity || '',
        }))
      : driverWithCounts.map(d=>({
          Name: d.driver_name,
          'Contact Number': d.driver_contact,
          'Email ID': d.driver_email,
          Gender: d.driver_gender,
          'Bus Number': d.bus_number,
          'Bus Plate Number': d.bus_plate_number,
          'Students Allocated': d._students_allocated,
        }))

    // Create true .xlsx via SheetJS CDN (no local dependency)
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tab==='students'?'Students':'Drivers')
    const fname = tab==='students' ? `student_details_${today}.xlsx` : `driver_details_${today}.xlsx`
    XLSX.writeFile(wb, fname)
  }

  const onSort = (key)=>{
    setPage(1)
    if (sortKey===key){ setSortDir(d=> d==='asc'?'desc':'asc') }
    else { setSortKey(key); setSortDir('asc') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex bg-white rounded shadow overflow-hidden">
          <button onClick={()=>setTab('students')} className={`px-4 py-2 ${tab==='students'?'bg-gray-900 text-white':'bg-white'}`}>Students</button>
          <button onClick={()=>setTab('drivers')} className={`px-4 py-2 ${tab==='drivers'?'bg-gray-900 text-white':'bg-white'}`}>Drivers</button>
        </div>
        <button onClick={exportExcel} className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50" disabled={loading || !data.length}>
          Export to Excel
        </button>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <div className="px-4 py-2 border-b flex items-center justify-between">
          <div className="font-medium">{tab==='students' ? 'Students' : 'Drivers'}</div>
          <div className="text-sm text-gray-500">{total} records</div>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            {tab==='students' ? (
              <tr>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_name')}>Name</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_prn')}>PRN</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_contact')}>Contact Number</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_email')}>Email ID</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_gender')}>Gender</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('semester')}>Current Semester</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('student_department')}>Department</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('bus_number')}>Bus Number Allocated</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('bus_pass_validity')}>Bus Pass Validity</th>
              </tr>
            ) : (
              <tr>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('driver_name')}>Name</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('driver_contact')}>Contact Number</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('driver_email')}>Email ID</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('driver_gender')}>Gender</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('bus_number')}>Bus Number</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('bus_plate_number')}>Bus Plate Number</th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={()=>onSort('_students_allocated')}>Students Allocated</th>
              </tr>
            )}
          </thead>
          <tbody>
            {pageData.map((r,i)=> tab==='students' ? (
              <tr key={r.id||i} className="border-t">
                <td className="px-3 py-2">{r.student_name}</td>
                <td className="px-3 py-2">{r.student_prn}</td>
                <td className="px-3 py-2">{r.student_contact}</td>
                <td className="px-3 py-2">{r.student_email}</td>
                <td className="px-3 py-2">{r.student_gender}</td>
                <td className="px-3 py-2">{r.semester}</td>
                <td className="px-3 py-2">{r.student_department}</td>
                <td className="px-3 py-2">{r.bus_number}</td>
                <td className="px-3 py-2">{r.bus_pass_validity || ''}</td>
              </tr>
            ) : (
              <tr key={r.id||i} className="border-t">
                <td className="px-3 py-2">{r.driver_name}</td>
                <td className="px-3 py-2">{r.driver_contact}</td>
                <td className="px-3 py-2">{r.driver_email}</td>
                <td className="px-3 py-2">{r.driver_gender}</td>
                <td className="px-3 py-2">{r.bus_number}</td>
                <td className="px-3 py-2">{r.bus_plate_number}</td>
                <td className="px-3 py-2">{r._students_allocated}</td>
              </tr>
            ))}
            {!pageData.length && (
              <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={7}>{loading?'Loading...':'No records'}</td></tr>
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
