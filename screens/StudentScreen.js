import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Linking, Modal, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { supabase } from '../src/supabaseClient';
import * as Location from 'expo-location';

// Driver ID is resolved dynamically from students/{auth.uid}/assignedDriverId

export default function StudentScreen({ onBack, onOpenMap }) {
  const [driverLoc, setDriverLoc] = useState(null);
  const [studentLoc, setStudentLoc] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [busNumber, setBusNumber] = useState(null);
  const [driverEmail, setDriverEmail] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const mapRef = useRef(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [driverProfile, setDriverProfile] = useState(null);
  const [busDetails, setBusDetails] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [expiryAlertShown, setExpiryAlertShown] = useState(false);

  const initialsFrom = (name, email) => {
    const src = (name || '').trim() || (email || '').split('@')[0] || '';
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    if (src.length >= 2) return src.slice(0, 2).toUpperCase();
    return 'ST';
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      const uid = userData?.user?.id;
      if (!email) return;
      const { data: sRow, error: sErr } = await supabase
        .from('students_admin')
        .select('*')
        .or(`student_email.eq.${email}${uid ? `,auth_user_id.eq.${uid}` : ''}`)
        .maybeSingle();
      if (sErr) {
        if (!cancelled) { setStudentProfile(null); setBusNumber(null); }
        return;
      }
      if (cancelled) return;
      setStudentProfile(sRow || null);
      const bNum = sRow?.bus_number || null;
      setBusNumber(bNum);
      if (bNum) {
        const { data: dRow } = await supabase.from('drivers_admin').select('*').eq('bus_number', bNum).maybeSingle();
        if (!cancelled) {
          setDriverProfile(dRow || null);
          setDriverEmail(dRow?.driver_email || null);
        }
        const { data: bRow } = await supabase.from('buses').select('*').eq('bus_number', bNum).maybeSingle();
        if (!cancelled) setBusDetails(bRow || null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Show bus pass expiry popup once per login (screen mount)
  useEffect(() => {
    if (expiryAlertShown) return;
    const raw = studentProfile?.bus_pass_validity || null;
    if (!raw) return;
    const parse = (v) => {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
      const m1 = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m1) return new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
      const m2 = String(v).match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
      if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
      return null;
    };
    const until = parse(raw);
    if (!until) return;
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.ceil((until.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      Alert.alert(
        'Bus Pass Expired',
        'Your bus pass already expired. Please renew it to use transportation facilities.',
        [
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              try { await supabase.auth.signOut(); } catch {}
              setExpiryAlertShown(true);
              onBack?.();
            }
          }
        ],
        { cancelable: false }
      );
      setExpiryAlertShown(true);
    } else {
      const msg = `Your Bus pass will expire in ${diffDays} day${diffDays === 1 ? '' : 's'}.`;
      Alert.alert('Bus Pass Validity', msg, [{ text: 'OK', onPress: () => setExpiryAlertShown(true) }], { cancelable: true });
      setExpiryAlertShown(true);
    }
  }, [studentProfile, expiryAlertShown]);

  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setStudentLoc({ latitude: current.coords.latitude, longitude: current.coords.longitude, timestamp: current.timestamp });
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 }, (pos) => {
        setStudentLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, timestamp: pos.timestamp });
      });
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  useEffect(() => {
    if (driverLoc && studentLoc) {
      const d = haversine(driverLoc.latitude, driverLoc.longitude, studentLoc.latitude, studentLoc.longitude);
      setDistanceKm(d);
    } else {
      setDistanceKm(null);
    }
  }, [driverLoc, studentLoc]);

  const fetchDriverLocationOnce = async () => {
    if (!driverEmail) return;
    setLoadingLocation(true);
    try {
      // Resolve driver user_id primarily from drivers_admin (auth_user_id), fallback to credentials
      const emailKey = driverEmail.trim().toLowerCase();
      console.log('Resolving driver for email:', emailKey);
      const { data: adminRow, error: dErr } = await supabase
        .from('drivers_admin')
        .select('auth_user_id, driver_email')
        .ilike('driver_email', emailKey)
        .maybeSingle();
      if (dErr) throw dErr;
      console.log('drivers_admin row:', adminRow);
      let driverId = adminRow?.auth_user_id || null;

      if (!driverId) {
        const { data: cred, error: cErr } = await supabase
          .from('credentials')
          .select('user_id')
          .ilike('email', emailKey)
          .maybeSingle();
        if (cErr) throw cErr;
        driverId = cred?.user_id || null;
        console.log('fallback credentials user_id:', driverId);
      }

      if (!driverId) throw new Error('Driver account not found');
      const { data: loc, error: lErr } = await supabase
        .from('drivers_latest')
        .select('latitude, longitude, timestamp')
        .eq('driver_id', driverId)
        .maybeSingle();
      if (lErr) throw lErr;
      if (loc) {
        const val = { latitude: loc.latitude, longitude: loc.longitude, timestamp: new Date(loc.timestamp).getTime() };
        setDriverLoc(val);
        if (mapRef.current) {
          mapRef.current.animateCamera({ center: { latitude: val.latitude, longitude: val.longitude }, zoom: 16 }, { duration: 800 });
        }
      } else {
        setDriverLoc(null);
      }
    } catch (e) {
      console.warn('Failed to fetch driver location', e);
      setDriverLoc(null);
    } finally {
      setLoadingLocation(false);
    }
  };

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return +(R * c).toFixed(2);
  }

  return (
    <View style={styles.container}>
      <Image source={require('../assets/watermarklogo.png')} style={styles.watermark} />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>Welcome {studentProfile?.student_name || 'Student'}</Text>
        <TouchableOpacity onPress={() => setProfileOpen(true)}>
          <View style={styles.avatarSm}><Text style={styles.avatarTextSm}>{initialsFrom(studentProfile?.student_name, studentProfile?.student_email)}</Text></View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.primary, { marginHorizontal: 16, marginTop: 12 }]} onPress={() => { if (onOpenMap) { onOpenMap({ driverEmail, busNumber }); } else { setShowMap(true); } }} disabled={!driverEmail}>
        <Text style={styles.primaryText}>View Driver's Location</Text>
      </TouchableOpacity>

      <View style={[styles.card, { marginTop: 12, marginHorizontal: 16 }]}>
        <Text style={styles.cardTitle}>Allocated Driver</Text>
        <View style={styles.rowBetween}><Text style={styles.label}>Name</Text><Text style={styles.value}>{driverProfile?.driver_name || '—'}</Text></View>
        <View style={styles.rowBetween}><Text style={styles.label}>Contact</Text><Text style={[styles.value, { color: '#2563eb' }]} onPress={() => driverProfile?.driver_contact && Linking.openURL(`tel:${driverProfile.driver_contact}`)}>{driverProfile?.driver_contact || '—'}</Text></View>
        <View style={styles.rowBetween}><Text style={styles.label}>Bus Number</Text><Text style={styles.value}>{busNumber || '—'}</Text></View>
        <View style={styles.rowBetween}><Text style={styles.label}>Bus Plate</Text><Text style={styles.value}>{busDetails?.bus_plate_number || busDetails?.plate_number || busDetails?.bus_plate || busDetails?.bus_plate_no || '—'}</Text></View>
      </View>

      <View style={[styles.card, { marginTop: 12, marginHorizontal: 16 }] }>
        <Text style={styles.cardTitle}>Bus Pass Validity</Text>
        <ValidityCard profile={studentProfile} />
      </View>

      {false && showMap && (
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: driverLoc?.latitude || 12.9716,
            longitude: driverLoc?.longitude || 77.5946,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          onMapReady={() => console.log('Map ready')}
          onRegionChangeComplete={(region) => console.log('Region change:', region)}
        >
          {studentLoc && driverLoc ? (
            <Polyline
              coordinates={[
                { latitude: studentLoc.latitude, longitude: studentLoc.longitude },
                { latitude: driverLoc.latitude, longitude: driverLoc.longitude }
              ]}
              strokeColor="#2563eb"
              strokeWidth={4}
            />
          ) : null}
          {driverLoc ? (
            <Marker
              coordinate={{ latitude: driverLoc.latitude, longitude: driverLoc.longitude }}
              title="Driver"
              description={new Date(driverLoc.timestamp).toLocaleTimeString()}
            />
          ) : null}
          {studentLoc ? (
            <Marker
              coordinate={{ latitude: studentLoc.latitude, longitude: studentLoc.longitude }}
              title="You"
              description={studentLoc.timestamp ? new Date(studentLoc.timestamp).toLocaleTimeString() : ''}
              pinColor="#22c55e"
            />
          ) : null}
        </MapView>
        {!driverLoc && (
          <View style={styles.overlay}> 
            {loadingLocation ? (
              <>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.overlayText}>Fetching driver location...</Text>
              </>
            ) : (
              <>
                <Text style={styles.overlayText}>{driverEmail ? 'Tap the button above to view the driver\'s location.' : 'No driver assigned'}</Text>
              </>
            )}
          </View>
        )}
        {distanceKm != null && (
          <View style={styles.infoBar}>
            <Text style={styles.infoText}>Distance: {distanceKm} km</Text>
          </View>
        )}
      </View>
      )}
      <Modal visible={profileOpen} animationType="slide" transparent onRequestClose={() => setProfileOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <View style={styles.avatarLg}><Text style={styles.avatarTextLg}>{initialsFrom(studentProfile?.student_name, studentProfile?.student_email)}</Text></View>
              <Text style={styles.modalTitle}>{studentProfile?.student_name || 'Student'}</Text>
              <Text style={styles.modalSubtitle}>{studentProfile?.student_email || '—'}</Text>
            </View>
            <View style={styles.chipsRow}>
              <View style={styles.chip}><Text style={styles.chipText}>Bus: {busNumber || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Semester: {studentProfile?.semester || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Dept: {studentProfile?.student_department || '—'}</Text></View>
            </View>
            <View style={styles.rowBetween}><Text style={styles.label}>PRN</Text><Text style={styles.value}>{studentProfile?.student_prn || '—'}</Text></View>
            <View style={styles.rowBetween}><Text style={styles.label}>Contact</Text><Text style={styles.value}>{studentProfile?.student_contact || '—'}</Text></View>
            <View style={{ height: 12 }} />
            <TouchableOpacity style={styles.secondaryBtn} onPress={async () => { await supabase.auth.signOut(); setProfileOpen(false); onBack?.(); }}>
              <Text style={styles.secondaryBtnText}>Logout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: '#e5e7eb' }]} onPress={() => setProfileOpen(false)}>
              <Text style={[styles.secondaryBtnText, { color: '#111827' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  back: { color: '#2563eb', fontWeight: '600', width: 48 },
  title: { fontSize: 20, fontWeight: '700' },
  avatarSm: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarTextSm: { fontSize: 12, fontWeight: '800', color: '#111827' },
  mapWrap: { flex: 1, marginTop: 12 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  overlayText: { color: '#64748b' },
  infoBar: { position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  infoText: { color: '#fff', fontWeight: '600' },
  primary: { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginTop: 8 },
  primaryText: { color: '#fff', fontWeight: '700' }
  ,watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.12, resizeMode: 'contain', alignSelf: 'center' },
  card: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  label: { color: '#64748b' },
  value: { color: '#0f172a', fontWeight: '600' },
  secondaryBtn: { backgroundColor: '#111827', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  secondaryBtnText: { color: '#fff', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalSubtitle: { color: '#64748b', marginBottom: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 4 },
  chip: { backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, marginRight: 8, marginTop: 8 },
  chipText: { color: '#0f172a', fontSize: 12, fontWeight: '600' },
  avatarLg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarTextLg: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
})
;

function ValidityCard({ profile }) {
  const raw = profile?.bus_pass_validity || null;
  const parse = (v) => {
    if (!v) return null;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    const m1 = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m1) return new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]));
    const m2 = String(v).match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m2) return new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
    return null;
  };
  const until = parse(raw);
  if (!until) return <Text style={{ color: '#64748b' }}>No validity info</Text>;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.ceil((until.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
  // Color coding: Green (>7), Yellow (=7), Red (expired)
  let bg = '#16a34a';
  let fg = '#ffffff';
  if (diffDays < 0) { bg = '#ef4444'; fg = '#ffffff'; }
  else if (diffDays === 7) { bg = '#f59e0b'; fg = '#111827'; }
  else if (diffDays > 7) { bg = '#16a34a'; fg = '#ffffff'; }
  else { bg = '#16a34a'; fg = '#ffffff'; }
  const fmt = (d) => d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <View style={{ backgroundColor: bg, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: fg, fontWeight: '700' }}>Expiry Date: {fmt(until)}</Text>
      <Text style={{ color: fg, marginTop: 4 }}>Days Remaining: {diffDays >= 0 ? diffDays : 0}</Text>
    </View>
  );
}
