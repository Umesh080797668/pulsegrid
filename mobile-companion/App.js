import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, RefreshControl, TextInput, Alert, ActivityIndicator } from 'react-native';

const API_BASE = 'http://10.0.2.2:3000'; // Or your local network IP for testing

export default function App() {
  const [activeTab, setActiveTab] = useState('flows');
  const [flows, setFlows] = useState([]);
  const [events, setEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchWorkspaces();
    }
  }, [token]);

  useEffect(() => {
    if (workspaceId && token) {
      loadData();
    }
  }, [workspaceId, token]);

  const apiCall = async (endpoint, method = 'GET', body = null) => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: body ? JSON.stringify(body) : null,
      });
      if (res.status === 401 && refreshToken) {
         return await handleTokenRefresh(endpoint, method, body);
      }
      return res;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleTokenRefresh = async (endpoint, method, body) => {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) {
       setIsAuthenticated(false);
       return null;
    }
    const data = await res.json();
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    
    return await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.accessToken}`,
        },
        body: body ? JSON.stringify(body) : null,
      });
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        setIsAuthenticated(true);
      } else {
        Alert.alert('Login failed', data.message || 'Invalid credentials');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server');
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
     setToken(null);
     setRefreshToken(null);
     setIsAuthenticated(false);
     setFlows([]);
     setEvents([]);
  };

  const fetchWorkspaces = async () => {
     const res = await apiCall('/workspaces');
     if (res?.ok) {
        const data = await res.json();
        if (data.length > 0) {
            setWorkspaceId(data[0].id);
        }
     }
  };

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [flowsRes, eventsRes] = await Promise.all([
        apiCall(`/flows?workspaceId=${workspaceId}`),
        apiCall(`/events?workspaceId=${workspaceId}&limit=20`)
      ]);
      
      if (flowsRes?.ok) {
          setFlows(await flowsRes.json());
      }
      if (eventsRes?.ok) {
          // Assuming events feed API exists, otherwise this will fail gracefully
          try {
             setEvents(await eventsRes.json());
          } catch(e) {}
      }
    } catch (e) {
      console.warn("Failed loading data", e);
    }
    setRefreshing(false);
  };

  const renderAuth = () => (
    <View style={styles.authContainer}>
      <Text style={styles.authTitle}>Login to PulseGrid</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Sign In</Text>}
      </TouchableOpacity>
    </View>
  );

  const renderTab = () => {
    if (activeTab === 'flows') {
      return (
        <FlatList
          data={flows}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No flows found in this workspace.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.textMuted}>{item.description || 'No description'}</Text>
              <View style={styles.statusRow}>
                  <Text style={item.enabled ? styles.statusSuccess : styles.statusFailed}>
                    {item.enabled ? 'ENABLED' : 'DISABLED'}
                  </Text>
              </View>
            </View>
          )}
        />
      );
    }
    return (
      <FlatList
        data={events}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No recent events.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.event_type || 'Unknown Event'}</Text>
            <Text style={styles.textMuted}>{new Date(item.timestamp).toLocaleString()}</Text>
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
        {isAuthenticated && (
           <TouchableOpacity onPress={handleLogout}><Text style={styles.logoutText}>Logout</Text></TouchableOpacity>
        )}
      </View>
      {!isAuthenticated ? renderAuth() : (
        <>
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
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
  logoutText: { color: '#ef4444', fontWeight: 'bold' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  activeTab: { borderColor: '#3b82f6' },
  tabText: { color: '#64748b', fontWeight: '600' },
  activeTabText: { color: '#3b82f6' },
  content: { flex: 1, padding: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 },
  statusRow: { marginTop: 10 },
  statusSuccess: { color: '#10b981', fontWeight: '500', fontSize: 12, marginTop: 4 },
  statusFailed: { color: '#ef4444', fontWeight: '500', fontSize: 12, marginTop: 4 },
  textMuted: { color: '#64748b', fontSize: 13 },
  button: { backgroundColor: '#3b82f6', padding: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  authTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#1e293b' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', padding: 12, borderRadius: 8, marginBottom: 12 },
  btnPrimary: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40 }
});
