import { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFlowStore } from '@/lib/store';

export default function TabTwoScreen() {
  const { digestSummary, failedFlows, loadDigest, isLoading } = useFlowStore();

  useEffect(() => {
    void loadDigest();
  }, [loadDigest]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Daily Digest</Text>
        <Text style={styles.subtitle}>A snapshot of what PulseGrid ran today.</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color="#22c55e" />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Summary</Text>
              <Text style={styles.cardText}>{digestSummary}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Top Failed Flows</Text>
              {failedFlows.length === 0 ? (
                <Text style={styles.cardText}>No failures reported.</Text>
              ) : (
                failedFlows.map((flow) => (
                  <View key={flow.id} style={styles.failedRow}>
                    <Text style={styles.flowName}>{flow.name}</Text>
                    <Text style={styles.failureCount}>{flow.failures} failures</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  cardText: {
    color: '#cbd5e1',
  },
  failedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: '#1e293b',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flowName: {
    color: '#e2e8f0',
  },
  failureCount: {
    color: '#fca5a5',
  },
});
