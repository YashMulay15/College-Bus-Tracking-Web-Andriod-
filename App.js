import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image } from 'react-native';
import DriverScreen from './screens/DriverScreen';
import StudentScreen from './screens/StudentScreen';
import StudentMapScreen from './screens/StudentMapScreen';
import DriverLoginScreen from './screens/DriverLoginScreen';
import StudentLoginScreen from './screens/StudentLoginScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';

export default function App() {
  const [screen, setScreen] = useState('role'); // 'role' | 'driverLogin' | 'studentLogin' | 'changePassword' | 'driver' | 'student' | 'studentMap'
  const [pendingRole, setPendingRole] = useState(null); // 'driver' | 'student' | null
  const [studentMapArgs, setStudentMapArgs] = useState({ driverEmail: null, busNumber: null });

  if (screen === 'driverLogin') {
    return (
      <DriverLoginScreen
        onBack={() => setScreen('role')}
        onSuccess={() => setScreen('driver')}
        onRequirePasswordChange={() => { setPendingRole('driver'); setScreen('changePassword'); }}
      />
    );
  }
  if (screen === 'studentLogin') {
    return (
      <StudentLoginScreen
        onBack={() => setScreen('role')}
        onSuccess={() => setScreen('student')}
        onRequirePasswordChange={() => { setPendingRole('student'); setScreen('changePassword'); }}
      />
    );
  }
  if (screen === 'changePassword') {
    return (
      <ChangePasswordScreen
        onSuccess={() => {
          if (pendingRole) {
            setScreen(pendingRole);
            setPendingRole(null);
          } else {
            setScreen('role');
          }
        }}
        onBack={() => { setPendingRole(null); setScreen('role'); }}
      />
    );
  }
  if (screen === 'driver') return <DriverScreen onBack={() => setScreen('role')} />;
  if (screen === 'student') return (
    <StudentScreen
      onBack={() => setScreen('role')}
      onOpenMap={({ driverEmail, busNumber }) => {
        setStudentMapArgs({ driverEmail, busNumber });
        setScreen('studentMap');
      }}
    />
  );
  if (screen === 'studentMap') return (
    <StudentMapScreen
      driverEmail={studentMapArgs.driverEmail}
      busNumber={studentMapArgs.busNumber}
      onBack={() => setScreen('student')}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <Image source={require('./assets/logo.png')} style={{ width: 200, height: 200, marginBottom: 20, resizeMode: 'contain' }} />
      <Text style={styles.title}>College Transport Tracker</Text>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.button} onPress={() => setScreen('driverLogin')}>
          <Text style={styles.buttonText}>Driver</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setScreen('studentLogin')}>
          <Text style={[styles.buttonText, styles.secondaryText]}>Student</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helper}>Select a role to continue</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  buttons: { width: '100%', gap: 12 },
  button: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { backgroundColor: '#f1f5f9' },
  secondaryText: { color: '#0f172a' },
  helper: { marginTop: 12, color: '#64748b' },
});
