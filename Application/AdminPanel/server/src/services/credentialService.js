import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabaseClient.js';

async function createOrUpdateAuthUser(email, rawPassword) {
  // Try to create first
  const createRes = await supabase.auth.admin.createUser({ email, password: rawPassword, email_confirm: true });
  if (!createRes.error && createRes.data?.user?.id) {
    return createRes.data.user.id;
  }
  // If exists, find user by listing and update password
  let userId = null;
  for (let page = 1; page <= 5 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const found = data?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found) userId = found.id;
    if (!data?.users?.length) break;
  }
  if (!userId) throw new Error('Auth user not found and createUser failed');
  const upd = await supabase.auth.admin.updateUserById(userId, { password: rawPassword, email_confirm: true });
  if (upd.error) throw upd.error;
  return userId;
}

export async function provisionAuthAndCredentials(email, rawPassword, role, username) {
  const userId = await createOrUpdateAuthUser(email, rawPassword);
  const password_hash = await bcrypt.hash(rawPassword, 10);
  // Upsert into credentials with full metadata
  const { data: existing, error: selErr } = await supabase
    .from('credentials')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error } = await supabase
      .from('credentials')
      .update({ password_hash, role, username, user_id: userId, must_change_password: true, status: 'active' })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('credentials')
      .insert([{ email, password_hash, role, username, user_id: userId, must_change_password: true, status: 'active' }]);
    if (error) throw error;
  }
  return userId;
}

export async function ensureUniqueUsername(base) {
  const clean = (base || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user'
  let candidate = clean
  for (let i = 0; i < 6; i++) {
    const { data, error } = await supabase
      .from('credentials')
      .select('id')
      .eq('username', candidate)
      .maybeSingle()
    if (error) throw error
    if (!data) return candidate
    candidate = `${clean}${Math.floor(100 + Math.random() * 900)}`
  }
  return `${clean}${Date.now().toString().slice(-4)}`
}
