import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function MappingOverview(){
  const { api } = useAuth()
  const [groups,setGroups]=useState([])
  const [buses,setBuses]=useState([])
  const [assignSel,setAssignSel]=useState({}) // key: group key (e.g., 'NA'), value: bus_number

  const refetch = async ()=>{
    const [g,b] = await Promise.all([
      api.get('/students/mapping/grouped'),
      api.get('/bus-driver/buses')
    ])
    setGroups(g.data||[])
    setBuses(b.data||[])
  }
  useEffect(()=>{ refetch() },[])
  const flatRows = useMemo(()=>{
    const rows = []
    for (const g of groups){
      for (const s of (g.students||[])){
        rows.push({
          Bus: g.bus_number,
          Driver: g.driver_name || 'Unassigned',
          'Driver Email': g.driver_email || 'N/A',
          'Student Name': s.student_name,
          Email: s.student_email,
          PRN: s.student_prn,
          Department: s.student_department,
          Semester: s.semester,
          'Pass Validity': s.bus_pass_validity || '',
        })
      }
      if (!g.students || g.students.length===0){
        rows.push({
          Bus: g.bus_number,
          Driver: g.driver_name || 'Unassigned',
          'Driver Email': g.driver_email || 'N/A',
          'Student Name': '-', Email: '-', PRN: '-', Department: '-', Semester: '-', 'Pass Validity': '-',
        })
      }
    }
    return rows
  },[groups])

  const exportExcel = async ()=>{
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs')
    const ws = XLSX.utils.json_to_sheet(flatRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mapping')
    const ymd = new Date().toISOString().slice(0,10)
    XLSX.writeFile(wb, `mapping_overview_${ymd}.xlsx`)
  }

  const exportPDF = async ()=>{
    const loadScript = (src)=> new Promise((resolve, reject)=>{
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = resolve
      s.onerror = reject
      document.body.appendChild(s)
    })
    // Load UMD bundles to avoid ESM resolver issues
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js')
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js')
    const { jsPDF } = window.jspdf
    const doc = new jsPDF('l','pt','a4')
    const ymd = new Date().toISOString().slice(0,10)
    doc.setFontSize(14)
    doc.text(`Mapping Overview - ${ymd}`, 40, 40)
    const columns = ['Bus','Driver','Driver Email','Student Name','Email','PRN','Department','Semester','Pass Validity']
    const body = flatRows.map(r=> columns.map(c=> r[c]))
    doc.autoTable({
      startY: 60,
      head: [columns],
      body,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [24,57,122] },
      didDrawPage: (data)=>{
        doc.setFontSize(10)
        doc.text(`Page ${doc.internal.getNumberOfPages()}`, doc.internal.pageSize.getWidth()-80, doc.internal.pageSize.getHeight()-20)
      }
    })
    doc.save(`mapping_overview_${ymd}.pdf`)
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Mapping Overview</h1>
      <div className="flex items-center justify-end gap-2 mb-4">
        <button onClick={exportExcel} className="px-3 py-2 bg-emerald-600 text-white rounded">Export to Excel</button>
        <button onClick={exportPDF} className="px-3 py-2 bg-slate-700 text-white rounded">Export to PDF</button>
      </div>
      {groups.map(g=> (
        <div key={g.bus_number} className="mb-6 bg-white rounded shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-medium">Bus: {g.bus_number}</div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600">Driver: {g.driver_name || 'Unassigned'} ({g.driver_email || 'N/A'})</div>
              {(g.bus_number===null || g.bus_number==='NA') && (
                <div className="flex items-center gap-2">
                  <select
                    className="px-2 py-1 border rounded"
                    value={assignSel['NA']||''}
                    onChange={e=> setAssignSel(s=>({...s, ['NA']: e.target.value}))}
                  >
                    <option value="">Select Bus</option>
                    {buses.map(b=> (
                      <option key={b.bus_number} value={b.bus_number}>{b.bus_number} · {b.bus_plate_number}</option>
                    ))}
                  </select>
                  <button
                    className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
                    disabled={!assignSel['NA']}
                    onClick={async()=>{
                      const bn = assignSel['NA']
                      if (!bn) return
                      const ok = window.confirm(`Assign bus ${bn} to all unassigned students (NA)?`)
                      if (!ok) return
                      try{
                        const res = await api.post('/students/assign-bus-bulk', { bus_number: bn })
                        const updated = res.data?.updated||0
                        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message: `Bus successfully assigned to ${updated} students` }}));
                        await refetch()
                      }catch(err){
                        const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to assign bus'
                        window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
                      }
                    }}
                  >Assign</button>
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Student Name</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">PRN</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-left px-3 py-2">Semester</th>
                  <th className="text-left px-3 py-2">Pass Validity</th>
                </tr>
              </thead>
              <tbody>
                {(g.students||[]).map(s=> (
                  <tr key={s.student_email} className="border-t">
                    <td className="px-3 py-2">{s.student_name}</td>
                    <td className="px-3 py-2">{s.student_email}</td>
                    <td className="px-3 py-2">{s.student_prn}</td>
                    <td className="px-3 py-2">{s.student_department}</td>
                    <td className="px-3 py-2">{s.semester}</td>
                    <td className="px-3 py-2">{s.bus_pass_validity}</td>
                  </tr>
                ))}
                {(!g.students || g.students.length===0) && (
                  <tr className="border-t"><td className="px-3 py-3 text-gray-500" colSpan={6}>No students allocated.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
