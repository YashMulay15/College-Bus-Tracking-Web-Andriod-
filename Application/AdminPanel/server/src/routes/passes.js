import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { supabase } from '../config/supabaseClient.js'
import { sendPassReminderMail } from '../services/mailer.js'

const router = Router()

function ymd(d){
  const dt = d instanceof Date ? d : new Date(d)
  const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const da = String(dt.getDate()).padStart(2,'0')
  return `${y}-${m}-${da}`
}
function addDays(base, days){ const d = new Date(base); d.setDate(d.getDate()+days); return d }

async function listByStatus(status){
  const today = ymd(new Date())
  let query = supabase.from('students_admin').select('*')
  if (status === 'expired'){
    query = query.lte('bus_pass_validity', today)
  } else if (status === 'expiring'){
    const in7 = ymd(addDays(today, 7))
    query = query.gt('bus_pass_validity', today).lte('bus_pass_validity', in7)
  } else if (status === 'active'){
    const in7 = ymd(addDays(today, 7))
    query = query.gt('bus_pass_validity', in7)
  }
  const { data, error } = await query
  if (error) throw error
  return data || []
}

router.get('/summary', requireAdmin, async (req, res) => {
  try{
    const [active, expiring, expired] = await Promise.all([
      listByStatus('active'),
      listByStatus('expiring'),
      listByStatus('expired'),
    ])
    res.json({ active: active.length, expiring: expiring.length, expired: expired.length })
  }catch(e){ res.status(500).json({ message: 'Failed', error: String(e.message||e) }) }
})

router.get('/list', requireAdmin, async (req, res) => {
  try{
    const status = (req.query.status||'').toString()
    if (!['active','expiring','expired'].includes(status)) return res.status(400).json({ message: 'Invalid status' })
    const data = await listByStatus(status)
    res.json(data)
  }catch(e){ res.status(500).json({ message: 'Failed', error: String(e.message||e) }) }
})

router.post('/reminders/run', requireAdmin, async (req, res) => {
  try{
    const type = (req.query.type||'').toString().toLowerCase() // 'first' | 'final' | 'expired' | '' (both first+final)
    const today = ymd(new Date())
    const firstDay = ymd(addDays(today, 7))
    const firstNext = ymd(addDays(firstDay, 1))
    const oneDay = ymd(addDays(today, 1))
    const finalDay = ymd(addDays(today, 1))
    const finalNext = ymd(addDays(finalDay, 1))

    let sent = 0, failed = 0
    let firstList = [], finalList = [], expiredList = []

    if (!type || type === 'first'){
      // Expiring within 1..7 days (inclusive of tomorrow and day after tomorrow)
      const { data, error } = await supabase
        .from('students_admin')
        .select('student_name, student_email, bus_pass_validity')
        .gte('bus_pass_validity', oneDay)
        .lt('bus_pass_validity', firstNext)
      if (error) throw error
      firstList = data || []
    }

    if (!type || type === 'final'){
      const { data, error } = await supabase
        .from('students_admin')
        .select('student_name, student_email, bus_pass_validity')
        .gte('bus_pass_validity', finalDay)
        .lt('bus_pass_validity', finalNext)
      if (error) throw error
      finalList = data || []
    }

    if (type === 'expired'){
      const { data, error } = await supabase
        .from('students_admin')
        .select('student_name, student_email, bus_pass_validity')
        .lte('bus_pass_validity', today)
      if (error) throw error
      expiredList = data || []
    }

    const tasks = []
    for (const s of firstList){
      tasks.push(sendPassReminderMail(s.student_email, { studentName: s.student_name, expiryDate: s.bus_pass_validity, type: 'first' })
        .then(()=>{ sent++ }).catch(()=>{ failed++ }))
    }
    for (const s of finalList){
      tasks.push(sendPassReminderMail(s.student_email, { studentName: s.student_name, expiryDate: s.bus_pass_validity, type: 'final' })
        .then(()=>{ sent++ }).catch(()=>{ failed++ }))
    }
    for (const s of expiredList){
      tasks.push(sendPassReminderMail(s.student_email, { studentName: s.student_name, expiryDate: s.bus_pass_validity, type: 'expired' })
        .then(()=>{ sent++ }).catch(()=>{ failed++ }))
    }
    await Promise.all(tasks)
    res.json({ ok: true, date: today, firstCount: firstList.length, finalCount: finalList.length, expiredCount: expiredList.length, sent, failed, mode: type || 'both' })
  }catch(e){ res.status(500).json({ message: 'Failed to send reminders', error: String(e.message||e) }) }
})

export default router
