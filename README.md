<div align="center">

# College Transport Tracker

Real-time bus location tracking for colleges with Driver and Student apps (Expo React Native) and a separate Admin Panel (React + Express) backed by Supabase.

</div>

---

## Overview

This repository contains a mobile application built with Expo (React Native) for two roles:

- **Driver**: Shares live location while on route so students can track buses in real-time.
- **Student**: Authenticates and views live bus position on a map with route/driver context.

An accompanying **Admin Panel** (in `Application/AdminPanel/`) lets administrators manage drivers, buses, and student allocations. Supabase is used for authentication and data; Google Maps powers the map view.

## Features

- **Authentication via Supabase** for both drivers and students with optional username lookup via an RPC function.
- **Driver live location sharing** using `expo-location` with foreground permissions.
- **Student map view** using `react-native-maps` (Google Maps SDK) to track a driver/bus in real-time.
- **Admin Panel** to manage buses, drivers, and student allocations (React client, Express server, Supabase SQL schema).
- **Expo** development workflow and **EAS** configuration for builds.

## Tech Stack

- Mobile app: `expo`, `react-native`, `react`, `react-native-maps`, `expo-location`
- Backend/data: `@supabase/supabase-js` (Auth + DB)
- Admin: React (Vite) client + Express server; SQL schema for Supabase

## Project Structure

```
.
├─ App.js
├─ index.js
├─ app.json
├─ eas.json
├─ package.json
├─ assets/
├─ screens/
│  ├─ DriverLoginScreen.js
│  ├─ StudentLoginScreen.js
│  ├─ DriverScreen.js
│  ├─ StudentScreen.js
│  └─ StudentMapScreen.js
├─ src/
│  └─ supabaseClient.js
└─ Application/
   └─ AdminPanel/
      ├─ client/
      ├─ server/
      └─ supabase/
```

Key files:

- `App.js`: Role selection and navigation between screens.
- `screens/DriverScreen.js`: Location permissions and live sharing workflow.
- `screens/StudentMapScreen.js`: Map UI and driver location fetch loop.
- `src/supabaseClient.js`: Supabase client configuration.
- `Application/AdminPanel/README.md`: Admin app quick start and schema.

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (installed automatically via `npx expo`)
- Supabase project (URL + anon key; service role key for admin server)
- Google Maps API keys (Android/iOS SDK)

## Setup (Mobile App)

1) Install dependencies

```
npm install
# or
yarn
```

2) Configure environment/secrets

- Supabase: Update `src/supabaseClient.js` with your own `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Google Maps: Put your keys in `app.json` under:
  - `android.config.googleMaps.apiKey`
  - `ios.config.googleMapsApiKey`

Security note: Do not commit real keys in public repos. Replace with placeholders before pushing to GitHub.

3) Start the app

```
npx expo start
```

Open on a device/emulator. Choose a role (Driver/Student) and sign in.

## Running Scripts

Available from `package.json`:

```
# Start Expo bundler
npm run start

# Run on Android device/emulator
npm run android

# Run on iOS simulator (macOS)
npm run ios

# Web preview (limited)
npm run web
```

## Configuration Details

- `app.json`
  - App metadata, permissions, and Google Maps keys (`android.config.googleMaps.apiKey`, `ios.config.googleMapsApiKey`).
  - EAS project id under `expo.extra.eas.projectId`.
- `eas.json`
  - EAS build profiles: `development`, `preview` (APK for Android), `production` with auto increment.
- `firebase.json` and `.firebaserc`
  - Emulator config and rules path are present; Firebase is not primary in this version. If you use Firebase elsewhere, update credentials accordingly.

## Admin Panel (Optional)

Located at `Application/AdminPanel/` with its own README and setup.

Quick start (summary):

- Create a Supabase project, copy Project URL and Service Role key.
- Run SQL from `Application/AdminPanel/supabase/schema.sql`.
- Server: copy `server/.env.example` to `server/.env`, then `npm install && npm run dev` inside `server/`.
- Client: copy `client/.env.example` to `client/.env`, then `npm install && npm run dev` inside `client/`.

Refer to `Application/AdminPanel/README.md` for details.

## Authentication and Data

- Uses Supabase Auth for drivers and students.
- Login screens accept email or username. Username is resolved via RPC `resolve_username_email(u)` on Supabase.
- Driver screen loads allocation data (bus/driver profile) and shares live location while active.
- Student map subscribes/polls driver location to render a moving marker.

## Building

This project is configured for EAS.

```
# Install EAS CLI (if not installed)
npm i -g eas-cli

# Configure project (one-time)
eas login
eas project:init

# Build profiles as defined in eas.json
eas build --profile preview --platform android   # APK for testing
eas build --profile production --platform android
eas build --profile production --platform ios
```

Ensure you have set the Google Maps keys in `app.json` and your Supabase settings before building.

## Map Setup (Google Maps)

- Android: Requires `android.config.googleMaps.apiKey` in `app.json` and appropriate location permissions (already added).
- iOS: Requires `ios.config.googleMapsApiKey` in `app.json` and location usage descriptions (already configured in `infoPlist`).

## Security and Secrets

- Replace any hardcoded keys in `app.json` and `src/supabaseClient.js` with your own. Do not commit real secrets.
- For public repos, use placeholders or environment-driven config. Consider `.env` + `expo-constants` or `app.config.js` to inject values at build time.

## Troubleshooting

- Location permissions denied: The Driver screen requires foreground location. Ensure device settings allow it.
- Map not showing: Verify Google Maps API keys are valid and billing is enabled.
- Cannot sign in: Confirm Supabase URL/anon key and that the RPC `resolve_username_email` exists and returns an email.
- No bus/driver data: Ensure allocations are created via Admin Panel and tables exist per the provided SQL schema.

## License

Specify your license here (e.g., MIT). If omitted, the project is proprietary by default.
