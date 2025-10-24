import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
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
  const stopNotifiedRef = useRef(false);
  const hadSeenLocationRef = useRef(false);
  const STALE_MS = 15 * 1000;
  const STOP_GRACE_MS = 3 * 60 * 1000;
  const driverIdRef = useRef(null);
  const channelRef = useRef(null);
  const GOOGLE_MAPS_API_KEY = '';
  const lastRouteFetchAt = useRef(0);
  const lastUserInteractionAt = useRef(0);
  const AUTO_FIT_COOLDOWN_MS = 60000;
  const staleSinceRef = useRef(null);
  const startSharingAtRef = useRef(null);
  const MAX_SESSION_MS = 3 * 60 * 60 * 1000;

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
      // Unsubscribe realtime channel on unmount
      try {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      } catch {}
    };

  const haversineKm = (a, b) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const formatEta = (mins) => {
    if (mins < 1) return '<1 min';
    if (mins < 60) return `${Math.round(mins)} mins`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h} hr ${m} min` : `${h} hr`;
  };
  }, []);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchDriverLoc, 2000);
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

  const handleStopped = () => {
    if (!stopNotifiedRef.current) {
      stopNotifiedRef.current = true;
      stopPolling();
      setDriverLoc(null);
      Alert.alert('Notice', 'Driver has stopped sharing location.', [
        { text: 'OK', onPress: () => { onBack?.(); } }
      ], { cancelable: false });
    }
  };

  const markMaybeStopped = () => {
    const now = Date.now();
    if (staleSinceRef.current == null) {
      staleSinceRef.current = now;
    }
  };

  const ensureRealtimeSubscribed = (driverId) => {
    if (!driverId) return;
    // If already subscribed to a different driver, unsubscribe
    if (channelRef.current && driverIdRef.current && driverIdRef.current !== driverId) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    if (channelRef.current) return;
    try {
      const ch = supabase.channel(`drivers_latest_${driverId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers_latest', filter: `driver_id=eq.${driverId}` }, (payload) => {
          const { eventType, new: newRow } = payload;
          if (eventType === 'DELETE') {
            handleStopped();
          } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const t = newRow?.timestamp ? new Date(newRow.timestamp).getTime() : NaN;
            const age = Date.now() - t;
            if (startSharingAtRef.current && Date.now() - startSharingAtRef.current > MAX_SESSION_MS) {
              handleStopped();
              return;
            }
            if (!newRow?.latitude || !newRow?.longitude || isNaN(age) || age > STALE_MS) {
              markMaybeStopped();
            } else {
              // Fresh update
              const val = { latitude: newRow.latitude, longitude: newRow.longitude, timestamp: t };
              setDriverLoc(val);
              hadSeenLocationRef.current = true;
              stopNotifiedRef.current = false;
              staleSinceRef.current = null;
              if (!startSharingAtRef.current) startSharingAtRef.current = Date.now();
            }
          }
        })
        .on('broadcast', { event: 'stopped' }, () => {
          handleStopped();
        })
        .subscribe((status) => {
          // no-op; could inspect status if needed
        });
      channelRef.current = ch;
    } catch {}
  };

  const fetchRoute = async (origin, destination) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    const now = Date.now();
    if (now - lastRouteFetchAt.current < 15000) return; // throttle to every 15s
    lastRouteFetchAt.current = now;
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&mode=driving&departure_time=now&traffic_model=best_guess&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(encodeURI(url));
      const ct = res.headers?.get?.('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        const text = await res.text();
        console.warn('Directions fetch error', { status: res.status, contentType: ct, snippet: text?.slice?.(0, 200) });
        const km = haversineKm(origin, destination);
        const mins = (km / 30) * 60;
        setRouteCoords([origin, destination]);
        setDistanceText(`${km.toFixed(1)} km`);
        setDurationText(formatEta(mins));
        return;
      }
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
      } else {
        const km = haversineKm(origin, destination);
        const mins = (km / 30) * 60;
        setRouteCoords([origin, destination]);
        setDistanceText(`${km.toFixed(1)} km`);
        setDurationText(formatEta(mins));
      }
    } catch {
      const km = haversineKm(origin, destination);
      const mins = (km / 30) * 60;
      setRouteCoords([origin, destination]);
      setDistanceText(`${km.toFixed(1)} km`);
      setDurationText(formatEta(mins));
    }
  };

  const fetchDriverLoc = async () => {
    if (!driverEmail && !busNumber) return;
    setLoading(true);
    try {
      let driverId = null;
      let emailKey = null;
      if (driverEmail) emailKey = driverEmail.trim().toLowerCase();
      // Attempt A: drivers_admin by driver_email
      if (!driverId && emailKey) {
        const { data, error } = await supabase
          .from('drivers_admin')
          .select('auth_user_id, driver_email, bus_number')
          .ilike('driver_email', emailKey)
          .maybeSingle();
        if (!error && data?.auth_user_id) driverId = data.auth_user_id;
      }
      // Attempt B: credentials by email
      if (!driverId && emailKey) {
        const { data, error } = await supabase
          .from('credentials')
          .select('user_id, email')
          .ilike('email', emailKey)
          .maybeSingle();
        if (!error && data?.user_id) driverId = data.user_id;
      }
      // Attempt C: bus_driver by email
      if (!driverId && emailKey) {
        const { data, error } = await supabase
          .from('bus_driver')
          .select('driver_id, driver_email, bus_number')
          .ilike('driver_email', emailKey)
          .maybeSingle();
        if (!error && (data?.driver_id || data?.driver_email)) {
          driverId = data?.driver_id || driverId;
          emailKey = data?.driver_email?.toLowerCase?.() || emailKey;
        }
      }
      // Attempt D: buses by email
      if (!driverId && emailKey) {
        const { data, error } = await supabase
          .from('buses')
          .select('driver_id, driver_email, bus_number')
          .ilike('driver_email', emailKey)
          .maybeSingle();
        if (!error && (data?.driver_id || data?.driver_email)) {
          driverId = data?.driver_id || driverId;
          emailKey = data?.driver_email?.toLowerCase?.() || emailKey;
        }
      }
      // Attempt E: drivers_admin by bus_number
      if (!driverId && busNumber) {
        const { data, error } = await supabase
          .from('drivers_admin')
          .select('auth_user_id, driver_email')
          .eq('bus_number', busNumber)
          .maybeSingle();
        if (!error && (data?.auth_user_id || data?.driver_email)) {
          driverId = data?.auth_user_id || driverId;
          if (!emailKey) emailKey = data?.driver_email?.toLowerCase?.() || null;
        }
      }
      // Attempt F: bus_driver by bus_number
      if (!driverId && busNumber) {
        const { data, error } = await supabase
          .from('bus_driver')
          .select('driver_id, driver_email')
          .eq('bus_number', busNumber)
          .maybeSingle();
        if (!error && (data?.driver_id || data?.driver_email)) {
          driverId = data?.driver_id || driverId;
          if (!emailKey) emailKey = data?.driver_email?.toLowerCase?.() || null;
        }
      }
      // Attempt G: buses by bus_number
      if (!driverId && busNumber) {
        const { data, error } = await supabase
          .from('buses')
          .select('driver_id, driver_email')
          .eq('bus_number', busNumber)
          .maybeSingle();
        if (!error && (data?.driver_id || data?.driver_email)) {
          driverId = data?.driver_id || driverId;
          if (!emailKey) emailKey = data?.driver_email?.toLowerCase?.() || null;
        }
      }
      if (driverId && driverIdRef.current !== driverId) {
        driverIdRef.current = driverId;
        ensureRealtimeSubscribed(driverId);
      }
      if (!driverId) {
        // No driver to resolve -> treat as stopped
        console.warn('Could not resolve driverId from provided identifiers', { driverEmail, busNumber });
        handleStopped();
        return;
      }
      const { data: loc, error: lErr } = await supabase
        .from('drivers_latest')
        .select('latitude, longitude, timestamp')
        .eq('driver_id', driverId)
        .maybeSingle();
      if (lErr) throw lErr;
      if (loc) {
        const val = { latitude: loc.latitude, longitude: loc.longitude, timestamp: new Date(loc.timestamp).getTime() };
        const age = Date.now() - val.timestamp;
        if (startSharingAtRef.current && Date.now() - startSharingAtRef.current > MAX_SESSION_MS) {
          handleStopped();
          return;
        }
        if (isNaN(age) || age > STALE_MS) {
          markMaybeStopped();
        } else {
          setDriverLoc(val);
          hadSeenLocationRef.current = true;
          stopNotifiedRef.current = false; // reset if it reappears timely
          staleSinceRef.current = null;
          if (!startSharingAtRef.current) startSharingAtRef.current = Date.now();
          if (studentLoc) {
            fetchRoute(studentLoc, val);
          } else if (mapRef.current) {
            mapRef.current.animateCamera({ center: { latitude: val.latitude, longitude: val.longitude }, zoom: 15 }, { duration: 600 });
          }
        }
      } else {
        // If driver location was previously visible and now missing, notify once and go back
        markMaybeStopped();
      }
    } catch (e) {
      const msg = e?.message || String(e);
      const short = msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
      console.warn('fetchDriverLoc error', short);
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
      {(() => {
        const lastAge = driverLoc?.timestamp ? (Date.now() - driverLoc.timestamp) : null;
        const formatAgo = (ms) => {
          const s = Math.floor(ms / 1000);
          if (s < 60) return `${s}s`;
          const m = Math.floor(s / 60);
          if (m < 60) return `${m}m`;
          const h = Math.floor(m / 60);
          return `${h}h`;
        };
        const showPanel = !!distanceText || !!durationText || lastAge != null;
        if (!showPanel) return null;
        return (
          <View style={styles.infoBottomLeft}>
            {distanceText ? <Text style={styles.infoText}>{`Distance: ${distanceText}`}</Text> : null}
            {durationText ? <Text style={styles.infoText}>{`ETA: ${durationText}`}</Text> : null}
            {lastAge != null ? (
              <Text style={styles.infoText}>{`Last update: ${formatAgo(lastAge)} ago${lastAge > STALE_MS ? ' (stationary/no update)' : ''}`}</Text>
            ) : null}
          </View>
        );
      })()}
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
