import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ReviewAllocation(){
  const { state } = useLocation()
  const nav = useNavigate()
  const { api } = useAuth()
  if(!state){ return <div>No data. Go back.</div> }
  const confirm = async ()=>{
    try{
      await api.post('/bus-driver', state)
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'success', message:'Driver allocated to bus successfully' }}));
      nav('/');
    }catch(err){
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to allocate driver';
      window.dispatchEvent(new CustomEvent('toast', { detail: { type:'error', message: msg }}));
    }
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Review Allocation</h1>
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
