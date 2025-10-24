import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, FlatList, Modal } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../src/supabaseClient';


export default function DriverScreen({ onBack }) {
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [lastLocation, setLastLocation] = useState(null);
  const watcherRef = useRef(null);
  const autoStopRef = useRef(null);
  const [driverUid, setDriverUid] = useState(null);
  const [driverEmail, setDriverEmail] = useState(null);
  const [busInfo, setBusInfo] = useState(null); // { bus_number, ...optional fields }
  const [students, setStudents] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [driverName, setDriverName] = useState(null);
  const [driverContact, setDriverContact] = useState(null);
  const [loadError, setLoadError] = useState('');

  const initialsFrom = (name, email) => {
    const src = (name || '').trim() || (email || '').split('@')[0] || '';
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    if (src.length >= 2) return src.slice(0, 2).toUpperCase();
    return 'DR';
  };

  useEffect(() => {
    // cache current user id and email; then load allocations
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id || null;
      const email = data?.user?.email || null;
      const meta = data?.user?.user_metadata || {};
      setDriverUid(uid);
      setDriverEmail(email);
      setDriverName(meta.name || meta.full_name || null);
      setDriverContact(meta.phone || meta.contact || null);
      if (email) {
        await loadAllocations(email, uid);
      }
    });
    // Stop sharing when auth state becomes signed out
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        stopSharing();
      }
    });
    return () => {
      stopSharing();
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const loadAllocations = async (email, uid) => {
    try {
      setLoadError('');
      // Find driver's bus and driver profile
      let busRow = null;
      let driverRow = null;
      // Attempt 0: drivers_admin by driver_email/auth_user_id
      {
        const { data, error } = await supabase
          .from('drivers_admin')
          .select('*')
          .or(`driver_email.eq.${email}${uid ? `,auth_user_id.eq.${uid}` : ''}`)
          .maybeSingle();
        if (!error && data) {
          driverRow = data;
          busRow = { ...data }; // contains bus_number and driver fields
        }
      }
      // Attempt 1: bus_driver by driver_email
      {
        const { data, error } = await supabase.from('bus_driver').select('*').eq('driver_email', email).maybeSingle();
        if (!error && data) busRow = data;
      }
      // Attempt 2: bus_driver by email
      if (!busRow) {
        const { data, error } = await supabase.from('bus_driver').select('*').eq('email', email).maybeSingle();
        if (!error && data) busRow = data;
      }
      // Attempt 3: bus_driver by driver_id
      if (!busRow && uid) {
        const { data, error } = await supabase.from('bus_driver').select('*').eq('driver_id', uid).maybeSingle();
        if (!error && data) busRow = data;
      }
      // Attempt 4: buses table by driver_email
      if (!busRow) {
        const { data, error } = await supabase.from('buses').select('*').eq('driver_email', email).maybeSingle();
        if (!error && data) busRow = data;
      }
      // Attempt 5: buses by driver_id
      if (!busRow && uid) {
        const { data, error } = await supabase.from('buses').select('*').eq('driver_id', uid).maybeSingle();
        if (!error && data) busRow = data;
      }

      if (!busRow?.bus_number) {
        setBusInfo(null);
        setStudents([]);
        setLoadError('No bus assignment found for this driver.');
        return;
      }

      // Fetch bus details by bus_number to enrich profile (plate, driver details)
      let busDetails = null;
      try {
        const { data: bd, error: bdErr } = await supabase
          .from('buses')
          .select('*')
          .eq('bus_number', busRow.bus_number)
          .maybeSingle();
        if (!bdErr) busDetails = bd;
      } catch {}

      // Merge fallback driver fields into busInfo so profile can show something
      const mergedBus = {
        ...busRow,
        ...(busDetails || {}),
        driver_name: (driverRow?.driver_name || busRow?.driver_name || busDetails?.driver_name || driverName || null),
        driver_contact: (driverRow?.driver_contact || busRow?.driver_contact || busDetails?.driver_contact || driverContact || null),
        driver_email: (driverRow?.driver_email || busRow?.driver_email || busDetails?.driver_email || email),
        bus_plate_number: (busRow?.bus_plate_number || busDetails?.bus_plate_number || busDetails?.plate_number || busDetails?.bus_plate || busDetails?.bus_plate_no || null),
      };
      setBusInfo(mergedBus);

      // List students on that bus
      const { data: stRows, error: stErr } = await supabase
        .from('students_admin')
        .select('*')
        .eq('bus_number', busRow.bus_number);
      if (stErr) throw stErr;
      setStudents(stRows || []);
    } catch (e) {
      console.warn('Failed to load allocations', e);
      setLoadError(e.message || 'Failed to load driver/bus data');
      setBusInfo(null);
      setStudents([]);
    }
  };

  const requestPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status);
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Location permission is needed to share your location.');
      return false;
    }
    return true;
  };

  const startSharing = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      Alert.alert('Not signed in', 'Please sign in first.');
      return;
    }
    const ok = await requestPermission();
    if (!ok) return;

    if (watcherRef.current) return;

    watcherRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      async (loc) => {
        const { latitude, longitude } = loc.coords;
        const payload = { latitude, longitude, timestamp: new Date().toISOString() };
        setLastLocation(payload);
        try {
          const { error } = await supabase
            .from('drivers_latest')
            .upsert({ driver_id: uid, latitude, longitude, timestamp: payload.timestamp }, { onConflict: 'driver_id' });
          if (error) throw error;
        } catch (e) {
          console.warn('Failed to update location', e);
        }
      }
    );

    // Start 3-hour auto stop timer
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    autoStopRef.current = setTimeout(() => {
      stopSharing();
    }, 3 * 60 * 60 * 1000);

    setIsSharing(true);
  };

  const stopSharing = async () => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    // Mark as stale immediately, then attempt deletion (bounded) so students stop seeing quickly
    try {
      const uid = driverUid || (await supabase.auth.getUser()).data?.user?.id;
      if (uid) {
        // Upsert a tombstone with old timestamp to trigger stale handling client-side
        const tombstone = supabase
          .from('drivers_latest')
          .upsert({ driver_id: uid, latitude: null, longitude: null, timestamp: '1970-01-01T00:00:00.000Z' }, { onConflict: 'driver_id' });
        const tombstoneTimeout = new Promise((resolve) => setTimeout(resolve, 500));
        await Promise.race([tombstone, tombstoneTimeout]);
        // Then try delete, but don't block the UI
        const deletion = supabase.from('drivers_latest').delete().eq('driver_id', uid);
        const timeout = new Promise((resolve) => setTimeout(resolve, 800));
        await Promise.race([deletion, timeout]);
        // Broadcast a realtime 'stopped' event so students can react instantly
        try {
          const ch = supabase.channel(`drivers_latest_${uid}`);
          await ch.subscribe();
          await ch.send({ type: 'broadcast', event: 'stopped', payload: { at: new Date().toISOString() } });
          supabase.removeChannel(ch);
        } catch {}
      }
    } catch {}
    setIsSharing(false);
  };

  // Parse various date formats to a Date. Supports ISO, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, numeric timestamps.
  const parseDateFlexible = (v) => {
    if (v == null) return null;
    // numeric timestamp (seconds or millis)
    if (typeof v === 'number') {
      const ms = v > 1e12 ? v : v * 1000; // heuristic
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (v instanceof Date) {
      return isNaN(v.getTime()) ? null : v;
    }
    if (typeof v === 'string') {
      const str = v.trim();
      // Try native Date first
      const d1 = new Date(str);
      if (!isNaN(d1.getTime())) return d1;
      // YYYY-MM-DD
      let m = str.match(/^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*$/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return isNaN(d.getTime()) ? null : d;
      }
      // DD/MM/YYYY or DD-MM-YYYY
      m = str.match(/^\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s*$/);
      if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return isNaN(d.getTime()) ? null : d;
      }
    }
    return null;
  };

  const validityInfo = (s) => {
    let dateLike = s?.bus_pass_validity || s?.bus_pass_valid_until || s?.pass_valid_upto || s?.bus_pass_valid_till || s?.pass_valid_until || s?.valid_till || s?.valid_until || s?.expiry || s?.expiry_date || s?.expires_on || s?.pass_expiry;
    // If not found, try to heuristically detect a validity-like field
    if (!dateLike && s && typeof s === 'object') {
      const candidates = Object.keys(s).filter(k => /(pass|valid|expir|till|until|expire)/i.test(k));
      for (const k of candidates) {
        const v = s[k];
        if (!v) continue;
        const d = parseDateFlexible(v);
        if (d) { dateLike = v; break; }
      }
    }
    if (!dateLike) return { label: 'Unknown', bg: '#9ca3af', fg: '#ffffff' };
    const until = parseDateFlexible(dateLike);
    if (!until) return { label: String(dateLike), bg: '#9ca3af', fg: '#ffffff' };
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const msDiff = until.getTime() - startOfToday.getTime();
    const daysDiff = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    // expired
    if (until < startOfToday) return { label: until.toDateString(), bg: '#ef4444', fg: '#ffffff' };
    // next 7 days
    if (daysDiff <= 7) return { label: until.toDateString(), bg: '#f97316', fg: '#ffffff' };
    // otherwise valid
    return { label: until.toDateString(), bg: '#16a34a', fg: '#ffffff' };
  };

  const renderStudent = ({ item }) => {
    const v = validityInfo(item);
    return (
      <View style={styles.studentRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.studentName}>{item.student_name || item.name || 'Unknown'}</Text>
          <Text style={styles.studentMeta}>
            Dept: {item.student_department || item.department || '—'}  ·  PRN: {item.student_prn || item.prn || '—'}
          </Text>
        </View>
        <View style={[styles.validityBadge, { backgroundColor: v.bg }]}>
          <Text style={[styles.validityBadgeText, { color: v.fg }]}>{v.label}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/watermarklogo.png')}
        style={styles.watermark}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { /* fire-and-forget stop for speed */ stopSharing(); onBack?.(); }}><Text style={styles.back}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>Welcome {busInfo?.driver_name || driverName || 'Driver'}</Text>
        <TouchableOpacity onPress={() => setProfileOpen(true)} style={styles.profileBtn}>
          <View style={styles.avatarSm}><Text style={styles.avatarTextSm}>{initialsFrom(busInfo?.driver_name || driverName, driverEmail)}</Text></View>
        </TouchableOpacity>
      </View>

      {/* Top Start/Stop buttons */}
      <TouchableOpacity style={styles.primary} onPress={startSharing}>
        <Text style={styles.primaryText}>Start Sharing Location</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.danger, !isSharing && { opacity: 0.6 }]} onPress={stopSharing} disabled={!isSharing}>
        <Text style={styles.dangerText}>Stop Sharing Location</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.label}>Location Permission</Text>
        <Text style={styles.value}>{permissionStatus ?? 'unknown'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Location Status</Text>
        <Text style={styles.value}>{isSharing ? 'Sharing location' : 'Idle'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Allocated Bus Number</Text>
        <Text style={styles.value}>{busInfo?.bus_number || 'Not assigned'}</Text>
      </View>

      {loadError ? (
        <View style={[styles.card, { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' }]}>
          <Text style={[styles.label, { color: '#b45309' }]}>Notice</Text>
          <Text style={[styles.value, { color: '#9a3412', fontWeight: '400' }]}>{loadError}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>Students on this Bus ({students.length})</Text>
        <FlatList
          data={students}
          keyExtractor={(item, idx) => String(item.id || item.student_email || item.student_prn || idx)}
          renderItem={renderStudent}
          style={{ maxHeight: 260 }}
        />
      </View>

      {lastLocation && (
        <View style={styles.card}>
          <Text style={styles.label}>Last Location</Text>
          <Text style={styles.value}>
            {lastLocation.latitude.toFixed(5)}, {lastLocation.longitude.toFixed(5)}
          </Text>
          <Text style={styles.subtle}>{new Date(lastLocation.timestamp).toLocaleTimeString()}</Text>
        </View>
      )}

      <Text style={styles.helper}>Driver UID: {driverUid || 'unknown'}</Text>

      <Modal visible={profileOpen} animationType="slide" transparent onRequestClose={() => setProfileOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <View style={styles.avatarLg}><Text style={styles.avatarTextLg}>{initialsFrom(busInfo?.driver_name || driverName, driverEmail)}</Text></View>
              <Text style={styles.modalTitle}>{busInfo?.driver_name || driverName || 'Driver'}</Text>
              <Text style={styles.modalSubtitle}>{driverEmail || '—'}</Text>
            </View>
            <View style={styles.chipsRow}>
              <View style={styles.chip}><Text style={styles.chipText}>Bus: {busInfo?.bus_number || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Plate: {busInfo?.bus_plate_number || busInfo?.plate_number || '—'}</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>Students: {students.length}</Text></View>
            </View>
            <View style={styles.modalRow}><Text style={styles.label}>Contact</Text><Text style={styles.value}>{busInfo?.driver_contact || driverContact || '—'}</Text></View>
            <View style={{ height: 12 }} />
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setProfileOpen(false); onBack?.(); /* fire-and-forget for speed */ stopSharing(); supabase.auth.signOut(); }}>
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
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 48, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  back: { color: '#2563eb', fontWeight: '600', width: 48 },
  title: { fontSize: 20, fontWeight: '700' },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#f8fafc', marginBottom: 12 },
  label: { color: '#64748b', fontSize: 12, marginBottom: 4 },
  value: { color: '#0f172a', fontSize: 16, fontWeight: '600' },
  subtle: { color: '#64748b', marginTop: 4 },
  primary: { backgroundColor: '#16a34a', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
  danger: { backgroundColor: '#ef4444', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  dangerText: { color: '#fff', fontWeight: '700' },
  helper: { textAlign: 'center', color: '#64748b', marginTop: 12 },
  watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.12, resizeMode: 'contain', alignSelf: 'center' },
  profileBtn: { width: 48, height: 32, alignItems: 'flex-end', justifyContent: 'center' },
  profileIcon: { fontSize: 20 },
  avatarSm: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  avatarTextSm: { fontSize: 12, fontWeight: '800', color: '#111827' },
  avatarLg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarTextLg: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
  studentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  studentName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  studentMeta: { color: '#64748b', marginTop: 2, fontSize: 12 },
  validity: { fontSize: 12, fontWeight: '700' },
  validityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, alignSelf: 'center' },
  validityBadgeText: { fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  modalSubtitle: { color: '#64748b', marginBottom: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 4 },
  chip: { backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, marginRight: 8, marginTop: 8 },
  chipText: { color: '#0f172a', fontSize: 12, fontWeight: '600' },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  secondaryBtn: { backgroundColor: '#111827', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  secondaryBtnText: { color: '#fff', fontWeight: '700' },
});
