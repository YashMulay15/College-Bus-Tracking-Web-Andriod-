# College Transport Tracking System (MVP)

## Setup
- **Install**: `npm install` (or `yarn`)
- **Run**: `npx expo start`
- **Select role**: Driver or Student

## Required keys
- Edit `src/firebaseConfig.js` with your Firebase project credentials.
- Put Google Maps API keys into `app.json` under:
  - `android.config.googleMaps.apiKey`
  - `ios.config.googleMapsApiKey`

## Notes
- Driver writes current location to `drivers/defaultDriver` in Firebase Realtime Database.
- Student listens to the same path and shows a moving marker.
- Adjust `DRIVER_ID` in `screens/DriverScreen.js` and `screens/StudentScreen.js` to support multiple drivers.
