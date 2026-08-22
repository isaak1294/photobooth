import 'react-native-get-random-values'; // must load before the Convex client (Hermes lacks crypto.getRandomValues)
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { ConvexProvider } from 'convex/react';

import { convex } from '@/lib/convex';

export default function RootLayout() {
  // No deployment configured — tell the developer instead of crashing.
  if (!convex) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Set EXPO_PUBLIC_CONVEX_URL</Text>
        <Text style={styles.body}>
          Add it to boothinator/.env (your *.convex.cloud URL, or your machine&apos;s LAN IP:3210
          for local dev), then restart Expo.
        </Text>
      </View>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'AI Photobooth' }} />
        <Stack.Screen name="s/[token]" options={{ title: 'Session' }} />
      </Stack>
    </ConvexProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22 },
});
