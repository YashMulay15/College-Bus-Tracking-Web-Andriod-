import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ADMIN } from '../config/admin.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Invalid' });
  if (email !== ADMIN.email) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, ADMIN.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ role: 'admin', email }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

export default router;
