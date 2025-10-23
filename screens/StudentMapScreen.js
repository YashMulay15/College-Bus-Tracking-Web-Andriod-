import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../src/supabaseClient';

export default function StudentMapScreen({ onBack, driverEmail, busNumber }) {
  const [driverLoc, setDriverLoc] = useState(null);
  const [studentLoc, setStudentLoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [routeCoords, setRouteCoords] = useState([]);
  const [distanceText, setDistanceText] = useState(null);
  const [durationText, setDurationText] = useState(null);
  const mapRef = useRef(null);
  const pollRef = useRef(null);
  const watcherRef = useRef(null);
  const GOOGLE_MAPS_API_KEY = 'AIzaSyBdoQlsILB1WJXmXuliZBbFA0jm0QBitF4';
  const lastRouteFetchAt = useRef(0);
  const lastUserInteractionAt = useRef(0);
  const AUTO_FIT_COOLDOWN_MS = 60000; // 60s cooldown after user pans/zooms

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!mounted) return;
        setStudentLoc({ latitude: current.coords.latitude, longitude: current.coords.longitude, timestamp: current.timestamp });
        watcherRef.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 }, (pos) => {
          setStudentLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, timestamp: pos.timestamp });
        });
      }
      await fetchDriverLoc();
      startPolling();
    })();
    return () => {
      mounted = false;
      stopPolling();
      if (watcherRef.current) { watcherRef.current.remove(); watcherRef.current = null; }
    };
  }, []);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchDriverLoc, 15000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const decodePolyline = (encoded) => {
    let points = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
    while (index < len) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;
      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  };

  const fetchRoute = async (origin, destination) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    const now = Date.now();
    if (now - lastRouteFetchAt.current < 15000) return; // throttle to every 15s
    lastRouteFetchAt.current = now;
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving&departure_time=now&traffic_model=best_guess&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(encodeURI(url));
      const json = await res.json();
      const route = json?.routes?.[0];
      const leg = route?.legs?.[0];
      if (route && leg) {
        const pts = decodePolyline(route.overview_polyline.points);
        setRouteCoords(pts);
        setDistanceText(leg.distance?.text || null);
        setDurationText(leg.duration_in_traffic?.text || leg.duration?.text || null);
        const canAutoFit = Date.now() - lastUserInteractionAt.current > AUTO_FIT_COOLDOWN_MS;
        if (mapRef.current && pts.length && canAutoFit) {
          mapRef.current.fitToCoordinates(pts, { edgePadding: { top: 100, right: 60, bottom: 100, left: 60 }, animated: true });
        }
      }
    } catch {}
  };

  const fetchDriverLoc = async () => {
    if (!driverEmail) return;
    setLoading(true);
    try {
      const emailKey = driverEmail.trim().toLowerCase();
      const { data: adminRow, error: dErr } = await supabase
        .from('drivers_admin')
        .select('auth_user_id, driver_email')
        .ilike('driver_email', emailKey)
        .maybeSingle();
      if (dErr) throw dErr;
      let driverId = adminRow?.auth_user_id || null;
      if (!driverId) {
        const { data: cred, error: cErr } = await supabase
          .from('credentials')
          .select('user_id')
          .ilike('email', emailKey)
          .maybeSingle();
        if (cErr) throw cErr;
        driverId = cred?.user_id || null;
      }
      if (!driverId && busNumber) {
        try {
          const { data: byBus, error: bErr } = await supabase
            .from('drivers_admin')
            .select('auth_user_id, driver_email')
            .eq('bus_number', busNumber)
            .maybeSingle();
          if (!bErr && byBus?.auth_user_id) {
            driverId = byBus.auth_user_id;
          }
        } catch {}
      }
      if (!driverId) return;
      const { data: loc, error: lErr } = await supabase
        .from('drivers_latest')
        .select('latitude, longitude, timestamp')
        .eq('driver_id', driverId)
        .maybeSingle();
      if (lErr) throw lErr;
      if (loc) {
        const val = { latitude: loc.latitude, longitude: loc.longitude, timestamp: new Date(loc.timestamp).getTime() };
        setDriverLoc(val);
        if (studentLoc) {
          fetchRoute(studentLoc, val);
        } else if (mapRef.current) {
          mapRef.current.animateCamera({ center: { latitude: val.latitude, longitude: val.longitude }, zoom: 15 }, { duration: 600 });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Recompute route when student location updates and we already have driver location
  useEffect(() => {
    if (studentLoc && driverLoc) {
      fetchRoute(studentLoc, driverLoc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentLoc]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={[styles.btn, styles.btnDark]} onPress={() => { stopPolling(); onBack?.(); }}>
          <Text style={styles.btnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnDark, { marginLeft: 8 }]}
          onPress={() => {
            lastUserInteractionAt.current = 0; // allow auto fit immediately
            if (mapRef.current) {
              if (routeCoords && routeCoords.length > 1) {
                mapRef.current.fitToCoordinates(routeCoords, { edgePadding: { top: 100, right: 60, bottom: 100, left: 60 }, animated: true });
              } else if (studentLoc && driverLoc) {
                mapRef.current.fitToCoordinates([studentLoc, driverLoc], { edgePadding: { top: 100, right: 60, bottom: 100, left: 60 }, animated: true });
              } else if (driverLoc) {
                mapRef.current.animateCamera({ center: { latitude: driverLoc.latitude, longitude: driverLoc.longitude }, zoom: 15 }, { duration: 600 });
              }
            }
          }}
        >
          <Text style={styles.btnText}>Recenter</Text>
        </TouchableOpacity>
      </View>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: driverLoc?.latitude || 12.9716,
          longitude: driverLoc?.longitude || 77.5946,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onRegionChange={() => { lastUserInteractionAt.current = Date.now(); }}
        onPanDrag={() => { lastUserInteractionAt.current = Date.now(); }}
      >
        {driverLoc && (
          <Marker
            coordinate={{ latitude: driverLoc.latitude, longitude: driverLoc.longitude }}
            title="Driver"
            description={new Date(driverLoc.timestamp).toLocaleTimeString()}
          />
        )}
        {studentLoc && (
          <Marker
            coordinate={{ latitude: studentLoc.latitude, longitude: studentLoc.longitude }}
            title="You"
            pinColor="#22c55e"
          />
        )}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor="#2563eb" strokeWidth={5} />
        )}
      </MapView>
      {(distanceText || durationText) && (
        <View style={styles.infoBottomLeft}>
          {distanceText ? <Text style={styles.infoText}>{`Distance: ${distanceText}`}</Text> : null}
          {durationText ? <Text style={styles.infoText}>{`ETA: ${durationText}`}</Text> : null}
        </View>
      )}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', top: 48, left: 16, right: 16, zIndex: 10, flexDirection: 'row', justifyContent: 'flex-start' },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnDark: { backgroundColor: '#111827' },
  btnText: { color: '#fff', fontWeight: '700' },
  loadingOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  infoBottomLeft: { position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  infoText: { color: '#fff', fontWeight: '700' },
});
