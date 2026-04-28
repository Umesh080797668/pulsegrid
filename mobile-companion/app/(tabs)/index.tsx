import { useEffect } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFlowStore } from '@/lib/store';

export default function HomeScreen() {
  const router = useRouter();
  const { flows, isLoading, error, loadFlows, loadDigest, triggerFlow } = useFlowStore();

  useEffect(() => {
    void loadFlows();
    void loadDigest();
  }, [loadFlows, loadDigest]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Quick Triggers</Text>
        <Text style={styles.subtitle}>Tap a flow to execute instantly.</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color="#7c3aed" />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          flows.slice(0, 5).map((flow) => (
            <Pressable
              key={flow.id}
              style={styles.card}
              onPress={async () => {
                await triggerFlow(flow.id);
                router.push('/modal');
              }}>
              <View style={styles.row}>
                <View style={styles.flowMeta}>
                  <Text style={styles.flowName}>{flow.name}</Text>
                  <Text style={styles.flowDesc}>{flow.description}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{flow.status}</Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  flowMeta: {
    flex: 1,
  },
  flowName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  flowDesc: {
    color: '#cbd5e1',
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#312e81',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    color: '#e0e7ff',
    textTransform: 'capitalize',
  },
  errorText: {
    color: '#fca5a5',
  },
});
