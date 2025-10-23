import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ReviewStudentAllocation(){
  const { state } = useLocation()
  const nav = useNavigate()
  const { api } = useAuth()
  if(!state){ return <div>No data. Go back.</div> }
  const confirm = async ()=>{
    try{
      await api.post('/students', state)
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:'Student allocated successfully' }}));
      nav('/students');
    }catch(err){
      const status = err?.response?.status
      const server = err?.response?.data
      let msg = 'Failed to save'
      if (status === 409) msg = 'Student with this PRN/Email/Contact already exists'
      else if (server?.message || server?.error) msg = server.message || server.error
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Review Student Allocation</h1>
      <div className="bg-white p-4 rounded shadow max-w-xl">
        {Object.entries(state).map(([k,v])=> (
          <div key={k} className="flex justify-between py-1 border-b last:border-0"><div className="text-gray-600 capitalize">{k.replaceAll('_',' ')}</div><div className="font-medium">{String(v)}</div></div>
        ))}
        <div className="flex gap-2 mt-4">
          <button onClick={()=>nav(-1)} className="px-4 py-2 border rounded">Back</button>
          <button onClick={confirm} className="px-4 py-2 bg-green-600 text-white rounded">Confirm & Save</button>
        </div>
      </div>
    </div>
  )
}
