import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, RefreshControl } from 'react-native';

export default function App() {
  const [activeTab, setActiveTab] = useState('flows');
  const [flows, setFlows] = useState([
    { id: '1', name: 'Lead Assignment Sync', status: 'success' },
    { id: '2', name: 'Slack Alerts for High CPU', status: 'failed' },
    { id: '3', name: 'Daily Sales Report', status: 'success' }
  ]);
  const [events, setEvents] = useState([
    { id: 'e1', type: 'webhook.received', message: 'Stripe Payment Succeeded' },
    { id: 'e2', type: 'jira.issue_created', message: 'New Ticket #1234' },
  ]);

  const [refreshing, setRefreshing] = useState(false);

  const renderTab = () => {
    if (activeTab === 'flows') {
      return (
        <FlatList
          data={flows}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={item.status === 'success' ? styles.statusSuccess : styles.statusFailed}>
                Last Run: {item.status.toUpperCase()}
              </Text>
              <TouchableOpacity style={styles.button}><Text style={styles.btnText}>Trigger Flow</Text></TouchableOpacity>
            </View>
          )}
        />
      );
    }
    return (
      <FlatList
        data={events}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(false)} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.message}</Text>
            <Text style={styles.textMuted}>{item.type}</Text>
          </View>
        )}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PulseGrid</Text>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, activeTab === 'flows' && styles.activeTab]} onPress={() => setActiveTab('flows')}>
          <Text style={[styles.tabText, activeTab === 'flows' && styles.activeTabText]}>Flows</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'events' && styles.activeTab]} onPress={() => setActiveTab('events')}>
          <Text style={[styles.tabText, activeTab === 'events' && styles.activeTabText]}>Event Feed</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {renderTab()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  activeTab: { borderColor: '#3b82f6' },
  tabText: { color: '#64748b', fontWeight: '600' },
  activeTabText: { color: '#3b82f6' },
  content: { flex: 1, padding: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 },
  statusSuccess: { color: '#10b981', fontWeight: '500', marginBottom: 10 },
  statusFailed: { color: '#ef4444', fontWeight: '500', marginBottom: 10 },
  textMuted: { color: '#64748b' },
  button: { backgroundColor: '#3b82f6', padding: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' }
});
