import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function Dashboard(){
  const { api } = useAuth()
  const DEPTS = ['AIDS','CSE','CSBS','Mechanical','Civil','Civil Environmental','Electrical','ENTC','Biotech','MBA','MCA']
  const [stats,setStats]=useState({ drivers:0, students:0 })
  const [drivers,setDrivers]=useState([])
  const [students,setStudents]=useState([])
  const [showDrivers,setShowDrivers]=useState(false)
  const [showStudents,setShowStudents]=useState(false)
  const [editDriverId,setEditDriverId]=useState(null)
  const [editStudentId,setEditStudentId]=useState(null)
  const [editDriver,setEditDriver]=useState({})
  const [editStudent,setEditStudent]=useState({})
  const refetch = async ()=>{
    const [driversRes, studentsRes] = await Promise.all([
      api.get('/bus-driver'), api.get('/students')
    ])
    setDrivers(driversRes.data)
    setStudents(studentsRes.data)
    setStats({ drivers: driversRes.data.length, students: studentsRes.data.length })
  }
  useEffect(()=>{(async()=>{ await refetch() })()},[])

  const startEditDriver=async(d)=>{
    setEditDriverId(d.id)
    try{
      const res = await api.get(`/bus-driver/${d.id}`)
      setEditDriver({ ...res.data })
    }catch{
      setEditDriver({ ...d, bus_plate_number: '' })
    }
  }
  const cancelEditDriver=()=>{ setEditDriverId(null); setEditDriver({}) }
  const saveDriver=async(e)=>{
    e.preventDefault();
    try{
      await api.put(`/bus-driver/${editDriverId}`, editDriver);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:'Driver updated successfully' }}));
      cancelEditDriver();
      await refetch();
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to update driver';
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }
  }
  const deleteDriver=async(id)=>{
    const ok = window.confirm('Delete this driver and related linkages?');
    if (!ok) return;
    try{
      await api.delete(`/bus-driver/${id}`);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:'Driver deleted successfully' }}));
      await refetch();
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to delete driver';
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }
  }

  const startEditStudent=(s)=>{ setEditStudentId(s.id); setEditStudent({ ...s }) }
  const cancelEditStudent=()=>{ setEditStudentId(null); setEditStudent({}) }
  const saveStudent=async(e)=>{
    e.preventDefault();
    try{
      await api.put(`/students/${editStudentId}`, editStudent);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:'Student updated successfully' }}));
      cancelEditStudent();
      await refetch();
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to update student';
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }
  }
  const deleteStudent=async(id)=>{
    const ok = window.confirm('Delete this student and related linkages?');
    if (!ok) return;
    try{
      await api.delete(`/students/${id}`);
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:'Student deleted successfully' }}));
      await refetch();
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to delete student';
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={()=>setShowDrivers(v=>!v)} className="text-left bg-white shadow rounded p-4 hover:shadow-md">
          <div className="text-gray-500">Total Drivers</div>
          <div className="text-3xl font-bold">{stats.drivers}</div>
          <div className="text-sm text-gray-500 mt-1">{showDrivers?'Hide':'Show'} details</div>
        </button>
        <button onClick={()=>setShowStudents(v=>!v)} className="text-left bg-white shadow rounded p-4 hover:shadow-md">
          <div className="text-gray-500">Total Students</div>
          <div className="text-3xl font-bold">{stats.students}</div>
          <div className="text-sm text-gray-500 mt-1">{showStudents?'Hide':'Show'} details</div>
        </button>
      </div>
      {showDrivers && (
        <div className="mt-6 bg-white rounded shadow overflow-x-auto">
          <div className="px-4 py-2 font-medium border-b">Drivers</div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Bus Number</th>
                <th className="text-left px-3 py-2">Driver Name</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Contact</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d=> (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2">{d.bus_number}</td>
                  <td className="px-3 py-2">{d.driver_name}</td>
                  <td className="px-3 py-2">{d.driver_email}</td>
                  <td className="px-3 py-2">{d.driver_contact}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button onClick={()=>startEditDriver(d)} className="px-3 py-1 border rounded">Edit</button>
                    <button onClick={()=>deleteDriver(d.id)} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showStudents && (
        <div className="mt-6 bg-white rounded shadow overflow-x-auto">
          <div className="px-4 py-2 font-medium border-b">Students</div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Contact</th>
                <th className="text-left px-3 py-2">PRN</th>
                <th className="text-left px-3 py-2">Department</th>
                <th className="text-left px-3 py-2">Bus Number</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s=> (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2">{s.student_name}</td>
                  <td className="px-3 py-2">{s.student_email}</td>
                  <td className="px-3 py-2">{s.student_contact}</td>
                  <td className="px-3 py-2">{s.student_prn}</td>
                  <td className="px-3 py-2">{s.student_department}</td>
                  <td className="px-3 py-2">{s.bus_number}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button onClick={()=>startEditStudent(s)} className="px-3 py-1 border rounded">Edit</button>
                    <button onClick={()=>deleteStudent(s.id)} className="px-3 py-1 bg-red-600 text-white rounded">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Driver Edit Modal */}
      {editDriverId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded shadow-lg">
            <div className="px-4 py-3 border-b font-medium">Edit Driver Allocation</div>
            <form onSubmit={saveDriver} className="p-4 grid gap-3">
              <div>
                <label className="block text-sm mb-1">Bus Number</label>
                <input className="w-full border rounded px-3 py-2" value={editDriver.bus_number||''} onChange={e=>setEditDriver(v=>({...v, bus_number:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Bus Plate Number</label>
                <input className="w-full border rounded px-3 py-2" value={editDriver.bus_plate_number||''} onChange={e=>setEditDriver(v=>({...v, bus_plate_number:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Driver Name</label>
                <input className="w-full border rounded px-3 py-2" value={editDriver.driver_name||''} onChange={e=>setEditDriver(v=>({...v, driver_name:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Driver Email</label>
                <input className="w-full border rounded px-3 py-2" value={editDriver.driver_email||''} onChange={e=>setEditDriver(v=>({...v, driver_email:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Driver Contact</label>
                <input className="w-full border rounded px-3 py-2" value={editDriver.driver_contact||''} onChange={e=>setEditDriver(v=>({...v, driver_contact:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Driver Gender</label>
                <select className="w-full border rounded px-3 py-2" value={editDriver.driver_gender||'Male'} onChange={e=>setEditDriver(v=>({...v, driver_gender:e.target.value}))}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={cancelEditDriver} className="px-3 py-2 border rounded">Cancel</button>
                <button type="submit" className="px-3 py-2 bg-gray-900 text-white rounded">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Edit Modal */}
      {editStudentId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded shadow-lg">
            <div className="px-4 py-3 border-b font-medium">Edit Student Allocation</div>
            <form onSubmit={saveStudent} className="p-4 grid gap-3">
              <div>
                <label className="block text-sm mb-1">Student Name</label>
                <input className="w-full border rounded px-3 py-2" value={editStudent.student_name||''} onChange={e=>setEditStudent(v=>({...v, student_name:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Student Email</label>
                <input className="w-full border rounded px-3 py-2" value={editStudent.student_email||''} onChange={e=>setEditStudent(v=>({...v, student_email:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Student Contact</label>
                <input className="w-full border rounded px-3 py-2" value={editStudent.student_contact||''} onChange={e=>setEditStudent(v=>({...v, student_contact:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">PRN</label>
                <input className="w-full border rounded px-3 py-2" value={editStudent.student_prn||''} onChange={e=>setEditStudent(v=>({...v, student_prn:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Department</label>
                <select className="w-full border rounded px-3 py-2" value={editStudent.student_department||DEPTS[0]} onChange={e=>setEditStudent(v=>({...v, student_department:e.target.value}))}>
                  {DEPTS.map(d=> <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Bus Number</label>
                <input className="w-full border rounded px-3 py-2" value={editStudent.bus_number||''} onChange={e=>setEditStudent(v=>({...v, bus_number:e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm mb-1">Student Gender</label>
                <select className="w-full border rounded px-3 py-2" value={editStudent.student_gender||'Male'} onChange={e=>setEditStudent(v=>({...v, student_gender:e.target.value}))}>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Current Semester</label>
                <select className="w-full border rounded px-3 py-2" value={editStudent.semester||'Sem 1'} onChange={e=>setEditStudent(v=>({...v, semester:e.target.value}))}>
                  {Array.from({length:8},(_,i)=>`Sem ${i+1}`).map(s=> <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Bus pass validity (Date)</label>
                <input type="date" className="w-full border rounded px-3 py-2" value={editStudent.bus_pass_validity||''} onChange={e=>setEditStudent(v=>({...v, bus_pass_validity:e.target.value}))} />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={cancelEditStudent} className="px-3 py-2 border rounded">Cancel</button>
                <button type="submit" className="px-3 py-2 bg-gray-900 text-white rounded">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
