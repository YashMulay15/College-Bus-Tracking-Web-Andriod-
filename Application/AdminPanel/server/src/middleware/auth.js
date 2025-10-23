import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabaseClient.js';

async function verifyAny(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Unauthorized' };

  // 1) Try server-issued JWT
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return { payload };
  } catch {}

  // 2) Try Supabase access token: get user, then resolve role from credentials table
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    const email = data?.user?.email;
    if (!email) return { error: 'Unauthorized' };
    const { data: cred, error: cErr } = await supabase
      .from('credentials')
      .select('role')
      .eq('email', email)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!cred?.role) return { error: 'Forbidden' };
    return { payload: { email, role: cred.role } };
  } catch (e) {
    return { error: 'Unauthorized' };
  }
}

export function requireAdmin(req, res, next) {
  (async ()=>{
    const { payload, error } = await verifyAny(req);
    if (error) return res.status(401).json({ message: error });
    if (payload.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    req.user = payload;
    next();
  })();
}

export function requireRole(roles = []) {
  return (req, res, next) => {
    (async ()=>{
      const { payload, error } = await verifyAny(req);
      if (error) return res.status(401).json({ message: error });
      if (!roles.includes(payload.role)) return res.status(403).json({ message: 'Forbidden' });
      req.user = payload;
      next();
    })();
  };
}

export const requireDriver = requireRole(['driver']);
export const requireStudent = requireRole(['student']);
