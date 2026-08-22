import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { ACTIVE_CAPTURE, CaptureStatus, fns, Session, Style } from '@/lib/convex';

const CAPTURE_LABEL: Record<CaptureStatus, string> = {
  pending: 'Waiting for booth…',
  counting_down: 'Get ready…',
  capturing: 'Smile! 📸',
  uploading: 'Uploading…',
  complete: 'Take Picture',
  failed: 'Take Picture',
};

export default function SessionScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const session = useQuery(fns.getSession, { token }) as Session | null | undefined;
  const styles_ = (useQuery(fns.listStyles, {}) as Style[] | undefined) ?? [];
  const requestCapture = useMutation(fns.requestCapture);
  const requestRender = useMutation(fns.requestRender);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  if (session === undefined)
    return (
      <Center>
        <ActivityIndicator />
      </Center>
    );
  if (session === null)
    return (
      <Center>
        <Text style={s.muted}>Session not found.</Text>
      </Center>
    );

  const photos = session.photos;
  const latest = photos[photos.length - 1];
  const activePhotoId = selectedPhotoId ?? latest?._id ?? null;
  const activePhoto = photos.find((p) => p._id === activePhotoId) ?? latest;

  const capture = session.capture;
  const isCapturing = capture !== null && ACTIVE_CAPTURE.includes(capture.status);
  const buttonLabel = isCapturing ? CAPTURE_LABEL[capture!.status] : 'Take Picture';
  const styleName = (id: string) => styles_.find((x) => x._id === id)?.name ?? 'Style';
  const rendersForPhoto = activePhoto
    ? session.renders.filter((r) => r.photoId === activePhoto._id)
    : [];

  const onCapture = async () => {
    try {
      await requestCapture({ token });
    } catch {
      // Already in progress — the status UI already reflects it.
    }
  };
  const onStyle = async (styleId: string) => {
    if (!activePhoto) return;
    try {
      await requestRender({ token, photoId: activePhoto._id, styleId });
    } catch {
      // ignore; render errors surface via the subscribed render doc
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.title}>AI Photobooth</Text>
          <Text style={s.code}>{session.shortCode}</Text>
        </View>

        <Pressable
          onPress={onCapture}
          disabled={isCapturing}
          style={[s.capture, isCapturing && s.captureBusy]}>
          <Text style={s.captureText}>{buttonLabel}</Text>
        </Pressable>
        {capture?.status === 'failed' && (
          <Text style={s.error}>Capture failed: {capture.error}</Text>
        )}

        {photos.length === 0 ? (
          <Text style={s.muted}>Tap Take Picture — your photo appears here, no refresh.</Text>
        ) : (
          <>
            <Text style={s.section}>Photos</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.thumbs}>
              {photos.map((p) =>
                p.url ? (
                  <Pressable key={p._id} onPress={() => setSelectedPhotoId(p._id)}>
                    <Image
                      source={{ uri: p.url }}
                      style={[s.thumb, activePhotoId === p._id && s.thumbActive]}
                      contentFit="cover"
                    />
                  </Pressable>
                ) : null,
              )}
            </ScrollView>

            <Text style={s.section}>Pick a style</Text>
            <View style={s.styleRow}>
              {styles_.map((st) => (
                <Pressable key={st._id} style={s.styleBtn} onPress={() => onStyle(st._id)}>
                  <Text style={s.styleBtnText}>{st.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {rendersForPhoto.length > 0 && (
          <>
            <Text style={s.section}>Renders</Text>
            {rendersForPhoto
              .slice()
              .reverse()
              .map((r) => (
                <View key={r._id} style={s.renderCard}>
                  <Text style={s.renderTitle}>{styleName(r.styleId)}</Text>
                  {r.status === 'done' && r.outputUrl ? (
                    <Image source={{ uri: r.outputUrl }} style={s.renderImg} contentFit="cover" />
                  ) : r.status === 'failed' ? (
                    <Text style={s.error}>Failed: {r.error}</Text>
                  ) : (
                    <View style={s.renderPending}>
                      <ActivityIndicator />
                      <Text style={s.muted}>Rendering… ({r.status})</Text>
                    </View>
                  )}
                </View>
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={s.centerFull}>{children}</View>;
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 16 },
  centerFull: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '800' },
  code: {
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: '#e2e8f0',
    color: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  capture: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  captureBusy: { opacity: 0.5 },
  captureText: { color: 'white', fontSize: 18, fontWeight: '700' },
  section: { fontSize: 13, fontWeight: '600', color: '#64748b', marginTop: 4 },
  muted: { color: '#94a3b8', textAlign: 'center' },
  error: { color: '#ef4444', fontSize: 14, textAlign: 'center' },
  thumbs: { gap: 10, paddingVertical: 2 },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#e2e8f0' },
  thumbActive: { borderWidth: 3, borderColor: '#2563eb' },
  styleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  styleBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  styleBtnText: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  renderCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 12, gap: 8 },
  renderTitle: { fontSize: 14, fontWeight: '600' },
  renderImg: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#e2e8f0' },
  renderPending: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
