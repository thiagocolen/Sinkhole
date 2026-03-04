import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, ScrollView, Alert, TextInput, Platform, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { GoogleDriveService } from './src/services/googleDrive';

WebBrowser.maybeCompleteAuthSession();

/**
 * Platform-aware storage wrapper.
 */
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const GOOGLE_TOKEN_KEY = 'google_access_token';
const SYNC_FOLDER_KEY = 'sync_folder_path';
const TARGET_FOLDER_KEY = 'target_folder_name';

// OAuth Client IDs from Google Cloud Console
const WEB_CLIENT_ID = '757482518920-69oe97nn8t0h6bhil6ogr7ltonvusv4j.apps.googleusercontent.com';

const StatusIndicator = ({ isAuthenticated }: { isAuthenticated: boolean }) => (
  <View style={styles.statusContainer}>
    <View style={[styles.statusIndicator, isAuthenticated ? styles.authenticated : styles.unauthenticated]} />
    <Text style={styles.statusText}>{isAuthenticated ? 'Connected' : 'Disconnected'}</Text>
  </View>
);

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [targetFolderName, setTargetFolderName] = useState<string>('SyncAppFolder');
  const [syncStatus, setSyncStatus] = useState<string>('Not Synced');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [debugLog, setDebugLog] = useState<string>('');

  useEffect(() => {
    // Initialize Google Sign-In
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      offlineAccess: true,
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
    });
    loadStoredData();
  }, []);

  async function loadStoredData() {
    try {
      const storedToken = await storage.getItem(GOOGLE_TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
        const isSignedIn = await GoogleSignin.hasPreviousSignIn();
        if (isSignedIn) {
          const currentUser = await GoogleSignin.getCurrentUser();
          if (currentUser) {
            setUserInfo(currentUser.user);
          }
        }
      }

      const storedFolder = await storage.getItem(SYNC_FOLDER_KEY);
      if (storedFolder) setFolderUri(storedFolder);

      const storedTarget = await storage.getItem(TARGET_FOLDER_KEY);
      if (storedTarget) setTargetFolderName(storedTarget);
    } catch (e) {
      console.error('Persistence load error', e);
    }
  }

  async function saveToken(accessToken: string) {
    try {
      await storage.setItem(GOOGLE_TOKEN_KEY, accessToken);
      setToken(accessToken);
    } catch (e: any) {
      console.error('Save token error:', e);
    }
  }

  const handleLogin = async () => {
    setDebugLog('Starting login flow...');
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const user = response.data?.user;
      const tokens = await GoogleSignin.getTokens();

      if (tokens.accessToken) {
        setUserInfo(user);
        saveToken(tokens.accessToken);
        setDebugLog(`Logged in as: ${user?.name || user?.email}`);
      }
    } catch (error: any) {
      setDebugLog(`Login Error: ${error.message}`);
    }
  };

  async function handleLogout() {
    try {
      await GoogleSignin.signOut();
      await storage.deleteItem(GOOGLE_TOKEN_KEY);
      setToken(null);
      setUserInfo(null);
      setDebugLog('Logged out');
    } catch (error: any) {
      setDebugLog(`Logout Error: ${error.message}`);
    }
  }

  async function pickFolder() {
    try {
      // Use the new Expo SDK 52+ FileSystem.Directory API
      const directory = await FileSystem.Directory.pickDirectoryAsync();
      if (directory && directory.uri) {
        setFolderUri(directory.uri);
        await storage.setItem(SYNC_FOLDER_KEY, directory.uri);
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Failed to access local file system.');
    }
  }

  const handleSync = async () => {
    if (!folderUri) {
      Alert.alert('Missing Info', 'Please select a folder first.');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Syncing...');
    setDebugLog('Sync Started...');

    try {
      // 1. Refresh/get fresh tokens before starting
      console.log('Refreshing Google tokens...');
      const tokens = await GoogleSignin.getTokens();
      const currentToken = tokens.accessToken;

      if (!currentToken) {
        throw new Error('Could not obtain fresh access token. Please login again.');
      }

      // Update state and storage with fresh token
      setToken(currentToken);
      await storage.setItem(GOOGLE_TOKEN_KEY, currentToken);

      // 2. Perform sync
      await GoogleDriveService.syncDirectory(
        folderUri,
        targetFolderName,
        currentToken,
        (message) => {
          console.log(`[Sync Progress] ${message}`);
          setDebugLog((prev) => `${prev}\n> ${message}`);
          setSyncStatus(message);
        }
      );
      setSyncStatus(`Last Sync: ${new Date().toLocaleTimeString()}`);
      Alert.alert('Success', 'Sync completed successfully!');
    } catch (error: any) {
      console.error('--- DETAILED SYNC ERROR ---');
      console.error(error);
      if (error.stack) console.error(error.stack);
      console.error('---------------------------');
      
      const errorMsg = `Sync Error: ${error.message}`;
      setDebugLog((prev) => `${prev}\n!! ${errorMsg}`);
      setSyncStatus('Failed');
      Alert.alert('Sync Failed', error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <StatusBar style="auto" />

      <View style={styles.header}>
        <Text style={styles.title}>GD Drive Sync</Text>
        <StatusIndicator isAuthenticated={!!token} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>1. Authentication</Text>
        {!token ? (
          <Button title="Login with Google" onPress={handleLogin} />
        ) : (
          <View>
            {userInfo && (
              <Text style={styles.info}>User: {userInfo.name} ({userInfo.email})</Text>
            )}
            <Button title="Logout" onPress={handleLogout} color="#F44336" />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>2. Local Folder</Text>
        <Text style={styles.info} numberOfLines={1} ellipsizeMode="middle">
          {folderUri || 'No folder selected'}
        </Text>
        <Button title="Select Folder" onPress={pickFolder} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>3. Drive Settings</Text>
        <Text style={styles.subLabel}>Target Folder Name in Google Drive</Text>
        <TextInput
          style={styles.input}
          value={targetFolderName}
          onChangeText={(val) => {
            setTargetFolderName(val);
            storage.setItem(TARGET_FOLDER_KEY, val);
          }}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Sync Dashboard</Text>
        <Text style={styles.info}>Status: {syncStatus}</Text>
        {isSyncing ? (
          <ActivityIndicator size="large" color="#2196F3" />
        ) : (
          <Button
            title="Sync Now"
            onPress={handleSync}
            color="#2196F3"
            disabled={!token || !folderUri}
          />
        )}
      </View>

      {debugLog ? (
        <View style={styles.debugSection}>
          <Text style={styles.label}>Debug Info</Text>
          <ScrollView style={{ maxHeight: 500 }}>
            <Text style={styles.debugText}>{debugLog}</Text>
          </ScrollView>
          <Button title="Clear Logs" onPress={() => setDebugLog('')} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20, paddingTop: 60, paddingBottom: 500, borderWidth: 40, borderColor: '#967f93ff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a73e8' },
  statusContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
  statusIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  authenticated: { backgroundColor: '#4CAF50' },
  unauthenticated: { backgroundColor: '#F44336' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#666' },
  section: { backgroundColor: '#ffffff', padding: 18, borderRadius: 15, marginBottom: 20, elevation: 3 },
  label: { fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#333' },
  subLabel: { fontSize: 12, color: '#888', marginBottom: 5 },
  info: { fontSize: 14, color: '#555', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#fafafa' },
  debugSection: { backgroundColor: '#333', padding: 15, borderRadius: 15, marginTop: 20, marginBottom: 40 },
  debugText: { color: '#0f0', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },
});