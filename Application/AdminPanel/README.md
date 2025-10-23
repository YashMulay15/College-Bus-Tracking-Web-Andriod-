# Admin Panel (MERN + Supabase)

Complete Admin Panel: React + Tailwind (client), Express (server), Supabase (DB). MongoDB is replaced with Supabase.

## Structure
- `Application/AdminPanel/client/` React + Vite + Tailwind UI
- `Application/AdminPanel/server/` Node + Express API
- `Application/AdminPanel/supabase/` SQL schema

## Quick Start

1) Supabase
- Create a project at https://supabase.com
- Copy Project URL and Service Role (secret) key
- Run SQL in `supabase/schema.sql`

2) Server
- Copy `server/.env.example` to `server/.env` and fill values
- In `server/`: `npm install` then `npm run dev`

3) Client
- Copy `client/.env.example` to `client/.env`
- In `client/`: `npm install` then `npm run dev`

## Admin Login
- Static admin in `server/src/config/admin.js`

## Features
- Single admin login (JWT)
- Bus & Driver allocation with review
- Student management + auto student→driver mapping
- Auto-generate credentials for driver/student (hashed)
- Protected routes

## Notes
- All DB access via server using Supabase service key
- Replace placeholders in `.env`
