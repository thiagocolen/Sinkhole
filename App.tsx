import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, ScrollView, Alert, TextInput, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';

// Platform-aware storage: SecureStore on native, localStorage on web
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    return SecureStore.deleteItemAsync(key);
  },
};

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_TOKEN_KEY = 'google_access_token';
const SYNC_FOLDER_KEY = 'sync_folder_path';
const TARGET_FOLDER_KEY = 'target_folder_name';

// ⚠️  These must be DIFFERENT client IDs from Google Cloud Console:
//   - ANDROID: "Android" type OAuth client (SHA-1 fingerprint required)
//   - WEB:     "Web application" type OAuth client
const ANDROID_CLIENT_ID = '757482518920-pusv95fln22bmuk3kof1rdmfp9o9k8ec.apps.googleusercontent.com'; // Replace with Android Client ID
const WEB_CLIENT_ID = '757482518920-k33dp239dl7bomrslbhk8poi9pt54sc8.apps.googleusercontent.com'; // Web application OAuth client

// Platform-aware redirect URI:
//   - Web/dev:   http://localhost:8081  → register this in Google Cloud Console (Web application client)
//   - Android:   gd-api-consumer-app:// → handled by the Android OAuth client type
const redirectUri = AuthSession.makeRedirectUri(
  Platform.OS === 'web'
    ? {}
    : { native: 'gd-api-consumer-app://' }
);

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [targetFolderName, setTargetFolderName] = useState<string>('SyncAppFolder');
  const [syncStatus, setSyncStatus] = useState<string>('Not Synced');
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
    redirectUri,
  });

  useEffect(() => {
    loadStoredData();
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        saveToken(authentication.accessToken);
      }
    }
  }, [response]);

  async function loadStoredData() {
    try {
      const storedToken = await storage.getItem(GOOGLE_TOKEN_KEY);
      if (storedToken) setToken(storedToken);

      const storedFolder = await storage.getItem(SYNC_FOLDER_KEY);
      if (storedFolder) setFolderUri(storedFolder);

      const storedTarget = await storage.getItem(TARGET_FOLDER_KEY);
      if (storedTarget) setTargetFolderName(storedTarget);
    } catch (e) {
      console.error('Failed to load stored data', e);
    }
  }

  async function saveToken(accessToken: string) {
    try {
      await storage.setItem(GOOGLE_TOKEN_KEY, accessToken);
      setToken(accessToken);
    } catch (e) {
      Alert.alert('Error', 'Failed to save access token');
    }
  }

  async function saveTargetFolder(name: string) {
    setTargetFolderName(name);
    try {
      await storage.setItem(TARGET_FOLDER_KEY, name);
    } catch (e) {
      console.error('Failed to save target folder name');
    }
  }

  async function handleLogout() {
    try {
      await storage.deleteItem(GOOGLE_TOKEN_KEY);
      setToken(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to logout');
    }
  }

  async function pickFolder() {
    try {
      const result = await DocumentPicker.pickDirectoryAsync();

      if (result) {
        setFolderUri(result.uri);
        await storage.setItem(SYNC_FOLDER_KEY, result.uri);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick folder');
    }
  }

  async function handleSync() {
    if (!token) {
      Alert.alert('Error', 'Please login first');
      return;
    }
    if (!folderUri) {
      Alert.alert('Error', 'Please select a folder first');
      return;
    }

    setSyncStatus('Syncing...');

    // Phase C logic will go here.
    // For now, let's simulate a sync.
    setTimeout(() => {
      setSyncStatus('Last Sync: ' + new Date().toLocaleString());
      setLastSync(new Date().toLocaleString());
      Alert.alert('Sync Complete', 'Files have been synchronized with Google Drive');
    }, 2000);
  }

  return (
    <ScrollView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>GD Drive Sync</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Authentication</Text>
        {!token ? (
          <Button
            title="Login with Google"
            disabled={!request}
            onPress={() => promptAsync()}
          />
        ) : (
          <View>
            <Text style={styles.info}>Logged In ✅</Text>
            <Button title="Logout" onPress={handleLogout} color="red" />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Folder Selection</Text>
        <Text style={styles.info} numberOfLines={1} ellipsizeMode="middle">
          {folderUri ? folderUri : 'No folder selected'}
        </Text>
        <Button title="Select Folder" onPress={pickFolder} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Settings</Text>
        <Text style={styles.subLabel}>Target Folder Name (Drive)</Text>
        <TextInput
          style={styles.input}
          value={targetFolderName}
          onChangeText={saveTargetFolder}
          placeholder="e.g. MySyncFolder"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Status: {syncStatus}</Text>
        <Button title="Sync Now" onPress={handleSync} color="#2196F3" />
      </View>

      {lastSync && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>Last Sync: {lastSync}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  section: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#555',
  },
  subLabel: {
    fontSize: 14,
    color: '#777',
    marginBottom: 5,
  },
  info: {
    fontSize: 14,
    color: '#777',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginTop: 5,
    fontSize: 16,
  },
  footer: {
    marginTop: 20,
    marginBottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#aaa',
  },
});
