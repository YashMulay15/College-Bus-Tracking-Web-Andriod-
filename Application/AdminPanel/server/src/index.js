import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import busDriverRoutes from './routes/busDriver.js';
import studentRoutes from './routes/students.js';
import mobileRoutes from './routes/mobile.js';
import passesRoutes from './routes/passes.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/bus-driver', busDriverRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/passes', passesRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
