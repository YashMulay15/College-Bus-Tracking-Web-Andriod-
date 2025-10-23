import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { supabase } from '../config/supabaseClient.js';
import { provisionAuthAndCredentials, ensureUniqueUsername } from '../services/credentialService.js';
import { generateUsername, generatePassword } from '../services/credentialUtils.js';
import { sendCredentialsMail } from '../services/mailer.js';

const router = Router();

router.post('/', requireAdmin, async (req, res) => {
  try {
    const p = req.body || {};
    const reqd = ['bus_number','student_gender','semester','bus_pass_validity','student_email','student_contact','student_name','student_prn','student_department'];
    for (const k of reqd) if (!p[k]) return res.status(400).json({ message: `Missing ${k}` });
    
    // Guard: prevent duplicate PRN or email or contact
    {
      const { data: existing, error: exErr } = await supabase
        .from('students_admin')
        .select('id, student_name, bus_number')
        .or(`student_prn.eq.${p.student_prn},student_email.eq.${p.student_email},student_contact.eq.${p.student_contact}`)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) {
        return res.status(409).json({
          message: 'Student already exists',
          error: 'Duplicate PRN or Email or Contact',
          existing,
        });
      }
    }

    const { data: driver, error: busErr } = await supabase
      .from('drivers_admin')
      .select('driver_email, bus_number')
      .eq('bus_number', p.bus_number)
      .maybeSingle();
    if (busErr) throw busErr;
    if (!driver) return res.status(400).json({ message: 'Bus not found or no driver assigned' });

    const usernameBase = generateUsername(p.student_name, p.student_prn || p.student_contact);
    const username = await ensureUniqueUsername(usernameBase);
    const password = generatePassword(p.student_name);
    const authUserId = await provisionAuthAndCredentials(p.student_email, password, 'student', username);

    const { data: student, error: stErr } = await supabase
      .from('students_admin')
      .insert([{...p, auth_user_id: authUserId }])
      .select('*')
      .single();
    if (stErr) throw stErr;

    // Mapping view will reflect based on bus_number and drivers_admin; no direct insert needed

    try {
      await sendCredentialsMail(p.student_email, 'Your Student Account Credentials', {
        name: p.student_name,
        username,
        password,
      })
    } catch (mailErr) {
      console.error('Email send failed:', mailErr)
    }
    res.json({ ok: true, student });
  } catch (e) {
    res.status(500).json({ message: 'Failed to save', error: String(e.message || e) });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('students_admin').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: 'Failed', error: error.message });
  res.json(data);
});

// Students with driver info (join by bus_number)
router.get('/with-driver', requireAdmin, async (req, res) => {
  try {
    const [{ data: students, error: sErr }, { data: drivers, error: dErr }] = await Promise.all([
      supabase.from('students_admin').select('*'),
      supabase.from('drivers_admin').select('bus_number, driver_name, driver_email')
    ])
    if (sErr) throw sErr; if (dErr) throw dErr;
    const byBus = new Map(drivers.map(d=>[d.bus_number, d]))
    const enriched = students.map(s=> ({
      ...s,
      driver_name: byBus.get(s.bus_number)?.driver_name || null,
      driver_email: byBus.get(s.bus_number)?.driver_email || null,
    }))
    res.json(enriched)
  } catch (e) {
    res.status(500).json({ message: 'Failed', error: String(e.message || e) })
  }
})

router.get('/mapping', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('student_bus_mapping').select('*');
  if (error) return res.status(500).json({ message: 'Failed', error: error.message });
  res.json(data);
});

// Bulk-assign a bus to all unassigned students (bus_number NULL or 'NA')
router.post('/assign-bus-bulk', requireAdmin, async (req, res) => {
  try {
    const { bus_number } = req.body || {};
    if (!bus_number) return res.status(400).json({ message: 'Missing bus_number' });
    // Ensure bus exists
    const { data: bus, error: bErr } = await supabase
      .from('buses')
      .select('bus_number')
      .eq('bus_number', bus_number)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!bus) return res.status(400).json({ message: 'Bus not found' });

    // Update all unassigned students (NULL first, then 'NA')
    const updNull = await supabase
      .from('students_admin')
      .update({ bus_number })
      .is('bus_number', null)
      .select('id');
    if (updNull.error) throw updNull.error;
    const updNA = await supabase
      .from('students_admin')
      .update({ bus_number })
      .eq('bus_number', 'NA')
      .select('id');
    if (updNA.error) throw updNA.error;
    const total = (updNull.data?.length || 0) + (updNA.data?.length || 0);
    res.json({ ok: true, updated: total });
  } catch (e) {
    res.status(500).json({ message: 'Failed to assign bus', error: String(e.message || e) });
  }
});

// Grouped mapping: per bus show driver and allocated students
router.get('/mapping/grouped', requireAdmin, async (req, res) => {
  try {
    const [{ data: drivers, error: dErr }, { data: students, error: sErr }] = await Promise.all([
      supabase.from('drivers_admin').select('bus_number, driver_name, driver_email').order('bus_number'),
      supabase.from('students_admin').select('bus_number, student_name, student_email, student_contact, student_prn, student_department, semester, bus_pass_validity').order('bus_number')
    ]);
    if (dErr) throw dErr; if (sErr) throw sErr;
    const map = new Map();
    for (const d of drivers) {
      map.set(d.bus_number, { bus_number: d.bus_number, driver_name: d.driver_name, driver_email: d.driver_email, students: [] });
    }
    for (const st of students) {
      if (!map.has(st.bus_number)) map.set(st.bus_number, { bus_number: st.bus_number, driver_name: null, driver_email: null, students: [] });
      map.get(st.bus_number).students.push(st);
    }
    res.json(Array.from(map.values()));
  } catch (e) {
    res.status(500).json({ message: 'Failed', error: String(e.message || e) });
  }
});

// Update a student allocation
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const allowed = ['bus_number','student_gender','semester','bus_pass_validity','student_email','student_contact','student_name','student_prn','student_department'];
    const p = req.body || {};
    const updates = {};
    for (const k of allowed) if (p[k] !== undefined) updates[k] = p[k];
    // Load current student to compare
    const { data: current, error: curErr } = await supabase.from('students_admin').select('*').eq('id', id).maybeSingle();
    if (curErr) throw curErr;
    if (!current) return res.status(404).json({ message: 'Not found' });

    // If email changed, migrate via RPC (reassign references, remove old instance)
    if (updates.student_email && updates.student_email !== current.student_email) {
      const { data: repSt, error: repErr } = await supabase.rpc('admin_replace_student', {
        p_old_student_email: current.student_email,
        p_new_student_email: updates.student_email,
      });
      if (repErr) throw repErr;
    }

    // Apply remaining updates
    const finalUpdates = { ...updates };
    const { data, error } = await supabase
      .from('students_admin')
      .update(finalUpdates)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ message: 'Failed to update', error: String(e.message || e) });
  }
});

// Delete a student allocation (by id) using RPC cleanup
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const { data: current, error: curErr } = await supabase
      .from('students_admin')
      .select('student_email, auth_user_id')
      .eq('id', id)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current?.student_email) return res.status(404).json({ message: 'Student not found' });
    const { data, error } = await supabase.rpc('admin_delete_student', {
      p_student_email: current.student_email,
      p_delete_auth_user: false,
    });
    if (error) throw error;
    // Attempt to delete auth user via Admin API as well
    let adminWarning = null;
    try {
      let sid = current.auth_user_id || null;
      if (!sid) {
        const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) throw listErr;
        const found = list?.users?.find(u => (u.email||'').toLowerCase() === (current.student_email||'').toLowerCase());
        sid = found?.id || null;
      }
      if (sid) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(sid);
        if (delErr) adminWarning = `Auth delete failed: ${delErr.message || String(delErr)}`;
      }
    } catch (ae) {
      adminWarning = `Auth delete error: ${ae.message || String(ae)}`;
    }
    res.json({ ok: true, data, adminWarning });
  } catch (e) {
    res.status(500).json({ message: 'Failed to delete', error: String(e.message || e) });
  }
});

export default router;
