import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { supabase } from '../src/supabaseClient';

export default function StudentLoginScreen({ onSuccess, onBack }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setError('');
    setLoading(true);
    try {
      const ident = username.trim();
      if (!ident) throw new Error('Enter email or username');
      let loginEmail = ident.toLowerCase();
      if (!ident.includes('@')) {
        const { data: emailRes, error: qErr } = await supabase.rpc('resolve_username_email', { u: ident });
        if (qErr) throw qErr;
        if (!emailRes) throw new Error('Username not found');
        loginEmail = String(emailRes).toLowerCase();
      } else if (!loginEmail.includes('@')) {
        throw new Error('Enter a valid email');
      }
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (err) throw err;
      onSuccess?.(data.user);
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>Back</Text></TouchableOpacity>
        <Text style={styles.title}>Student Login</Text>
        <View style={{ width: 48 }} />
      </View>

      <Image source={require('../assets/logo.png')} style={{ width: 180, height: 180, alignSelf: 'center', marginBottom: 16, resizeMode: 'contain' }} />

      <TextInput
        style={styles.input}
        placeholder="Email or Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.primary} onPress={login} disabled={loading}>
        <Text style={styles.primaryText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 48, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  back: { color: '#2563eb', fontWeight: '600', width: 48 },
  title: { fontSize: 20, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 12 },
  error: { color: '#ef4444', marginBottom: 8 },
  primary: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
});
