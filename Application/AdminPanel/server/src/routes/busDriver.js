import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { supabase } from '../config/supabaseClient.js';
import { provisionAuthAndCredentials } from '../services/credentialService.js';
import { generateUsername, generatePassword } from '../services/credentialUtils.js';
import { sendCredentialsMail } from '../services/mailer.js';

const router = Router();

router.post('/', requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const required = ['bus_plate_number','bus_number','driver_name','driver_gender','driver_contact','driver_email'];
    for (const k of required) if (!payload[k]) return res.status(400).json({ message: `Missing ${k}` });

    const username = generateUsername(payload.driver_name, payload.driver_contact);
    const mobilePassword = generatePassword(payload.driver_name);
    const authUserId = await provisionAuthAndCredentials(payload.driver_email, mobilePassword, 'driver', username);

    // Upsert bus
    {
      const { error: busErr } = await supabase
        .from('buses')
        .upsert([
          { bus_number: payload.bus_number, bus_plate_number: payload.bus_plate_number }
        ], { onConflict: 'bus_number' })
      if (busErr) throw busErr
    }

    // Upsert driver admin record
    const { data, error } = await supabase
      .from('drivers_admin')
      .upsert([{ 
        auth_user_id: authUserId,
        bus_number: payload.bus_number,
        driver_name: payload.driver_name,
        driver_gender: payload.driver_gender,
        driver_contact: payload.driver_contact,
        driver_email: payload.driver_email
      }], { onConflict: 'driver_email' })
      .select('*')
      .single();
    if (error) throw error;
    // Send email with credentials (non-blocking awaited for reliability)
    try {
      await sendCredentialsMail(payload.driver_email, 'Your Bus Driver Account Credentials', {
        name: payload.driver_name,
        username,
        password: mobilePassword,
      })
    } catch (mailErr) {
      // don't fail the request due to mail issues
      console.error('Email send failed:', mailErr)
    }
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ message: 'Failed to save', error: String(e.message || e) });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('drivers_admin').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: 'Failed', error: error.message });
  res.json(data);
});

// List buses (for validation and UI usage)
router.get('/buses', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('buses').select('bus_number, bus_plate_number').order('bus_number');
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: 'Failed', error: String(e.message || e) });
  }
});

// Fetch a single driver with bus plate number
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const { data: driver, error: dErr } = await supabase.from('drivers_admin').select('*').eq('id', id).maybeSingle();
    if (dErr) throw dErr;
    if (!driver) return res.status(404).json({ message: 'Not found' });
    let bus_plate_number = null;
    if (driver.bus_number) {
      const { data: bus, error: bErr } = await supabase.from('buses').select('bus_plate_number').eq('bus_number', driver.bus_number).maybeSingle();
      if (bErr) throw bErr;
      bus_plate_number = bus?.bus_plate_number ?? null;
    }
    res.json({ ...driver, bus_plate_number });
  } catch (e) {
    res.status(500).json({ message: 'Failed', error: String(e.message || e) });
  }
});

// Update a driver allocation
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    const p = req.body || {};
    // Load current driver to compare and to know current bus_number
    const { data: current, error: curErr } = await supabase.from('drivers_admin').select('*').eq('id', id).maybeSingle();
    if (curErr) throw curErr;
    if (!current) return res.status(404).json({ message: 'Not found' });
    const allowed = ['bus_number','driver_name','driver_gender','driver_contact','driver_email','bus_plate_number'];
    const updates = {};
    for (const k of allowed) if (p[k] !== undefined) updates[k] = p[k];

    // 1) If bus_number changes, migrate via RPC (will reassign references and delete old bus)
    if (updates.bus_number && updates.bus_number !== current.bus_number) {
      const plate = updates.bus_plate_number || null;
      // Require plate when creating a new bus_number that doesn't exist will be handled by RPC
      const { data: repBus, error: repErr } = await supabase.rpc('admin_replace_bus', {
        old_bus_number: current.bus_number,
        new_bus_number: updates.bus_number,
        new_bus_plate_number: plate,
      });
      if (repErr) throw repErr;
      // Remove plate from further updates; bus already handled
      delete updates.bus_plate_number;
    } else if (
      updates.bus_plate_number && (
        !("bus_number" in updates) || updates.bus_number === current.bus_number
      )
    ) {
      // Only plate change for existing bus_number
      const { error: busErr } = await supabase
        .from('buses')
        .upsert([{ bus_number: current.bus_number, bus_plate_number: updates.bus_plate_number }], { onConflict: 'bus_number' });
      if (busErr) throw busErr;
      delete updates.bus_plate_number;
    }

    // 2) If driver_email changes, migrate via RPC (reassign references, remove old rows)
    if (updates.driver_email && updates.driver_email !== current.driver_email) {
      const { data: repDrv, error: repDErr } = await supabase.rpc('admin_replace_driver', {
        old_driver_email: current.driver_email,
        new_driver_email: updates.driver_email,
      });
      if (repDErr) throw repDErr;
    }

    // 3) Apply remaining field updates (name/gender/contact, possibly bus_number already migrated)
    const driverUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => k !== 'bus_number' && k !== 'bus_plate_number')
    );
    let data = null;
    if (Object.keys(driverUpdates).length > 0) {
      const resp = await supabase
        .from('drivers_admin')
        .update(driverUpdates)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (resp.error) throw resp.error;
      data = resp.data;
    } else {
      const resp = await supabase.from('drivers_admin').select('*').eq('id', id).maybeSingle();
      if (resp.error) throw resp.error;
      data = resp.data;
    }

    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ message: 'Failed to update', error: String(e.message || e) });
  }
});

// Delete a driver allocation (by id) using RPC cleanup
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid id' });
    // Resolve driver email from id
    const { data: current, error: curErr } = await supabase
      .from('drivers_admin')
      .select('driver_email, auth_user_id, bus_number')
      .eq('id', id)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current?.driver_email) return res.status(404).json({ message: 'Driver not found' });
    const { data, error } = await supabase.rpc('admin_delete_driver', {
      p_driver_email: current.driver_email,
      p_delete_auth_user: false,
    });
    if (error) throw error;
    // Also delete the bus associated to this driver to free bus_number
    if (current.bus_number) {
      try {
        const { error: busDelErr } = await supabase.rpc('admin_delete_bus', { p_bus_number: current.bus_number });
        if (busDelErr) console.warn('Bus delete failed:', busDelErr.message || busDelErr);
      } catch (e) {
        console.warn('Bus delete error:', e);
      }
    }
    // Attempt to delete auth user via Admin API
    let adminWarning = null;
    try {
      let did = current.auth_user_id || null;
      if (!did) {
        const { data: got, error: gidErr } = await supabase.rpc('admin_auth_user_id_by_email', { p_email: current.driver_email });
        if (gidErr) throw gidErr;
        did = got || null;
      }
      if (did) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(did);
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

// Delete a driver by email via RPC
router.delete('/driver/by-email', requireAdmin, async (req, res) => {
  try {
    const { driver_email, delete_auth_user } = req.body || req.query || {};
    if (!driver_email) return res.status(400).json({ message: 'Missing driver_email' });
    // Lookup bus_number before deletion
    let bus_number = null;
    try {
      const { data: drv, error: dErr } = await supabase
        .from('drivers_admin')
        .select('bus_number')
        .eq('driver_email', driver_email)
        .maybeSingle();
      if (dErr) throw dErr;
      bus_number = drv?.bus_number || null;
    } catch {}
    const { data, error } = await supabase.rpc('admin_delete_driver', {
      p_driver_email: driver_email,
      p_delete_auth_user: Boolean(delete_auth_user) || false,
    });
    if (error) throw error;
    // Also delete the bus associated to this driver
    if (bus_number) {
      try {
        const { error: busDelErr } = await supabase.rpc('admin_delete_bus', { p_bus_number: bus_number });
        if (busDelErr) console.warn('Bus delete failed:', busDelErr.message || busDelErr);
      } catch (e) {
        console.warn('Bus delete error:', e);
      }
    }
    // Attempt to delete auth user via Admin API (if requested or always)
    let adminWarning = null;
    try {
      let did = null;
      const { data: got, error: gidErr } = await supabase.rpc('admin_auth_user_id_by_email', { p_email: driver_email });
      if (gidErr) throw gidErr;
      did = got || null;
      if (did) {
        const { error: delErr } = await supabase.auth.admin.deleteUser(did);
        if (delErr) adminWarning = `Auth delete failed: ${delErr.message || String(delErr)}`;
      }
    } catch (ae) {
      adminWarning = `Auth delete error: ${ae.message || String(ae)}`;
    }
    res.json({ ok: true, data, adminWarning });
  } catch (e) {
    res.status(500).json({ message: 'Failed to delete driver', error: String(e.message || e) });
  }
});

// Replace/migrate a bus and reassign references, then delete old bus
router.put('/replace/bus', requireAdmin, async (req, res) => {
  try {
    const { old_bus_number, new_bus_number, new_bus_plate_number } = req.body || {};
    if (!old_bus_number || !new_bus_number) return res.status(400).json({ message: 'Missing old_bus_number or new_bus_number' });
    const { data, error } = await supabase.rpc('admin_replace_bus', {
      old_bus_number,
      new_bus_number,
      new_bus_plate_number: new_bus_plate_number || null,
    });
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ message: 'Failed to replace bus', error: String(e.message || e) });
  }
});

// Replace/migrate a driver and reassign references, then remove old driver rows
router.put('/replace/driver', requireAdmin, async (req, res) => {
  try {
    const { old_driver_email, new_driver_email } = req.body || {};
    if (!old_driver_email || !new_driver_email) return res.status(400).json({ message: 'Missing old_driver_email or new_driver_email' });
    const { data, error } = await supabase.rpc('admin_replace_driver', {
      old_driver_email,
      new_driver_email,
    });
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ message: 'Failed to replace driver', error: String(e.message || e) });
  }
});

// Delete a bus and all linkages via RPC
router.delete('/bus/:bus_number', requireAdmin, async (req, res) => {
  try {
    const { bus_number } = req.params;
    if (!bus_number) return res.status(400).json({ message: 'Missing bus_number' });
    const { data, error } = await supabase.rpc('admin_delete_bus', { p_bus_number: bus_number });
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ message: 'Failed to delete bus', error: String(e.message || e) });
  }
});

export default router;
