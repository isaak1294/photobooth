import { useState } from 'react';
import { Href, router } from 'expo-router';
import { useMutation } from 'convex/react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fns } from '@/lib/convex';

// Connect screen. The booth QR deep-links straight to /s/<token>
// (boothinator://s/<token>); this is the manual fallback + a test-session helper.
export default function Connect() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const createSession = useMutation(fns.createSession);

  const open = (value: string) => {
    const t = value.trim();
    if (t) router.push(`/s/${encodeURIComponent(t)}` as Href);
  };

  const createTest = async () => {
    setBusy(true);
    try {
      const s = await createSession({});
      open(s.token);
    } catch (e) {
      console.error('createSession failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>AI Photobooth</Text>
        <Text style={styles.sub}>Scan the booth QR, or paste a session token below.</Text>

        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="session token"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={() => open(token)}
        />

        <Pressable
          style={[styles.btn, !token.trim() && styles.btnDisabled]}
          disabled={!token.trim()}
          onPress={() => open(token)}>
          <Text style={styles.btnText}>Open session</Text>
        </Pressable>

        <Pressable style={styles.link} onPress={createTest} disabled={busy}>
          {busy ? <ActivityIndicator /> : <Text style={styles.linkText}>Create a test session</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', gap: 16, padding: 24 },
  title: { fontSize: 34, fontWeight: '800' },
  sub: { fontSize: 15, color: '#64748b' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  btn: { backgroundColor: '#0f172a', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: '#2563eb', fontSize: 15 },
});
