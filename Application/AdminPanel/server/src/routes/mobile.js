import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { supabase } from '../config/supabaseClient.js'
import { requireDriver, requireStudent, requireRole } from '../middleware/auth.js'

const router = Router()

// Mobile Login (drivers/students)
router.post('/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body || {}
    const userId = identifier || email
    if (!userId || !password) return res.status(400).json({ message: 'Invalid' })
    const { data: cred, error } = await supabase
      .from('credentials')
      .select('id, email, username, password_hash, role')
      .or(`email.eq.${userId},username.eq.${userId}`)
      .maybeSingle()
    if (error) throw error
    if (!cred) return res.status(401).json({ message: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, cred.password_hash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    const token = jwt.sign({ role: cred.role, email: cred.email }, process.env.JWT_SECRET, { expiresIn: '12h' })
    res.json({ token, role: cred.role })
  } catch (e) {
    res.status(500).json({ message: 'Login failed', error: String(e.message || e) })
  }
})

// Profile for current mobile user
router.get('/profile', requireRole(['driver','student']), async (req, res) => {
  try {
    const { role, email } = req.user
    if (role === 'driver') {
      const { data: drv, error } = await supabase
        .from('bus_driver')
        .select('*')
        .eq('driver_email', email)
        .maybeSingle()
      if (error) throw error
      let bus_plate_number = null
      let student_count = 0
      if (drv?.bus_number){
        const [{ data: bus, error: bErr }, { data: cnt, error: cErr }] = await Promise.all([
          supabase.from('buses').select('bus_plate_number').eq('bus_number', drv.bus_number).maybeSingle(),
          supabase.from('students').select('id', { count: 'exact', head: true }).eq('bus_number', drv.bus_number)
        ])
        if (bErr) throw bErr
        if (cErr) throw cErr
        bus_plate_number = bus?.bus_plate_number || null
        student_count = cnt || 0
      }
      return res.json({ role, profile: { ...drv, bus_plate_number, student_count } })
    }
    if (role === 'student') {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('student_email', email)
        .maybeSingle()
      if (error) throw error
      return res.json({ role, profile: data })
    }
    return res.status(400).json({ message: 'Unknown role' })
  } catch (e) {
    res.status(500).json({ message: 'Failed', error: String(e.message || e) })
  }
})

// Assignments: for driver → list students; for student → show their mapping
router.get('/assignments', requireRole(['driver','student']), async (req, res) => {
  try {
    const { role, email } = req.user
    if (role === 'driver') {
      // Find driver's bus
      const { data: bus, error: busErr } = await supabase
        .from('bus_driver')
        .select('bus_number')
        .eq('driver_email', email)
        .maybeSingle()
      if (busErr) throw busErr
      if (!bus) return res.json({ students: [] })
      const { data: students, error: stErr } = await supabase
        .from('students')
        .select('student_name, student_email, student_contact, student_prn, student_department, semester, bus_number, bus_pass_validity')
        .eq('bus_number', bus.bus_number)
      if (stErr) throw stErr
      return res.json({ bus_number: bus.bus_number, students })
    }
    if (role === 'student') {
      const { data: mapping, error: mapErr } = await supabase
        .from('student_bus_mapping')
        .select('bus_number, driver_email')
        .eq('student_email', email)
        .maybeSingle()
      if (mapErr) throw mapErr
      return res.json({ mapping: mapping || null })
    }
    return res.status(400).json({ message: 'Unknown role' })
  } catch (e) {
    res.status(500).json({ message: 'Failed', error: String(e.message || e) })
  }
})

export default router

// ===== Driver Location Sharing with 3-hour expiry =====
// Schema expected: driver_locations(driver_email text primary key, lat double precision, lng double precision, shared_at timestamptz)

// Driver shares/updates current location
router.post('/location/share', requireDriver, async (req, res) => {
  try{
    const { email } = req.user
    const { lat, lng } = req.body || {}
    if (lat===undefined || lng===undefined) return res.status(400).json({ message: 'lat and lng are required' })
    const shared_at = new Date().toISOString()
    const { error } = await supabase
      .from('driver_locations')
      .upsert([{ driver_email: email, lat: Number(lat), lng: Number(lng), shared_at }], { onConflict: 'driver_email' })
    if (error) throw error
    res.json({ ok: true, shared_at })
  }catch(e){
    res.status(500).json({ message: 'Failed to share location', error: String(e.message||e) })
  }
})

// Get current valid location for the requesting user (student sees their driver; driver sees own)
router.get('/location', requireRole(['driver','student']), async (req, res) => {
  try{
    const { role, email } = req.user
    let driverEmail = null
    if (role === 'driver'){
      driverEmail = email
    } else {
      // student → find their mapping to get driver_email
      const { data: mapping, error: mapErr } = await supabase
        .from('student_bus_mapping')
        .select('driver_email')
        .eq('student_email', email)
        .maybeSingle()
      if (mapErr) throw mapErr
      driverEmail = mapping?.driver_email || null
    }
    if (!driverEmail) return res.json({ location: null })

    const threshold = new Date(Date.now() - 3*60*60*1000).toISOString() // 3 hours ago
    const { data: loc, error: lErr } = await supabase
      .from('driver_locations')
      .select('lat,lng,shared_at')
      .eq('driver_email', driverEmail)
      .gte('shared_at', threshold)
      .maybeSingle()
    if (lErr) throw lErr
    if (!loc) return res.json({ location: null })
    res.json({ location: loc })
  }catch(e){
    res.status(500).json({ message: 'Failed to get location', error: String(e.message||e) })
  }
})
