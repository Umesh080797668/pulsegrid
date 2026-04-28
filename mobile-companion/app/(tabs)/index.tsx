import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFlowStore } from '@/lib/store';

export default function HomeScreen() {
  const router = useRouter();
  const { flows, isLoading, error, loadFlows, loadDigest, triggerFlow } = useFlowStore();
  const [triggeringFlowId, setTriggeringFlowId] = useState<string | null>(null);

  const quickStats = useMemo(() => {
    const activeFlows = flows.filter((flow) => flow.status === 'active').length;
    const totalRuns = flows.reduce((sum, flow) => sum + (flow.retryCount ?? 0), 0);
    return { activeFlows, totalRuns };
  }, [flows]);

  useEffect(() => {
    void loadFlows();
    void loadDigest();
  }, [loadFlows, loadDigest]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Quick Triggers</Text>
        <Text style={styles.subtitle}>Tap a flow to execute instantly.</Text>

        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Today</Text>
          <View style={styles.statsRow}>
            <Text style={styles.statsValue}>{quickStats.activeFlows}</Text>
            <Text style={styles.statsLabel}>Active flows</Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsValue}>{quickStats.totalRuns}</Text>
            <Text style={styles.statsLabel}>Total runs</Text>
          </View>
        </View>

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
                setTriggeringFlowId(flow.id);
                const ok = await triggerFlow(flow.id);
                setTriggeringFlowId(null);

                if (ok) {
                  Alert.alert('Triggered', `${flow.name} started successfully.`);
                  router.push('/modal');
                } else {
                  Alert.alert('Trigger failed', 'Please try again.');
                }
              }}>
              <View style={styles.row}>
                <View style={styles.flowMeta}>
                  <Text style={styles.flowName}>{flow.name}</Text>
                  <Text style={styles.flowDesc}>{flow.description}</Text>
                </View>
                {triggeringFlowId === flow.id ? (
                  <ActivityIndicator size="small" color="#e0e7ff" />
                ) : (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{flow.status}</Text>
                  </View>
                )}
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
  statsCard: {
    backgroundColor: '#1e1b4b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  statsTitle: {
    color: '#c7d2fe',
    fontSize: 16,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  statsValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  statsLabel: {
    color: '#cbd5e1',
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
