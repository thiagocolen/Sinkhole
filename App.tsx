import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button, ScrollView, Alert, TextInput, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';

WebBrowser.maybeCompleteAuthSession();

/**
 * Platform-aware storage wrapper.
 * Uses SecureStore on iOS/Android for encryption and localStorage on Web.
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
// Use the 'Web application' client ID here for the SDK configuration
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
  const [debugLog, setDebugLog] = useState<string>('');

  useEffect(() => {
    // Initialize Google Sign-In
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      offlineAccess: true, // required to get a refresh token
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

        // Attempt to restore user info from Native SDK if possible
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
      console.log('Persistence load error details:', JSON.stringify(e, null, 2));
      console.error('Persistence load error', e);
    }
  }

  async function saveToken(accessToken: string) {
    try {
      await storage.setItem(GOOGLE_TOKEN_KEY, accessToken);
      setToken(accessToken);
    } catch (e: any) {
      console.log('Save token error details:', JSON.stringify(e, null, 2));
      console.error('Save token error:', e);
    }
  }

  const handleLogin = async () => {
    setDebugLog('Starting login flow...');
    try {
      await GoogleSignin.hasPlayServices();
      setDebugLog('Play services available, calling signIn...');
      const response = await GoogleSignin.signIn();

      console.log('SignIn Response:', JSON.stringify(response, null, 2));

      const user = response.data?.user;
      const tokens = await GoogleSignin.getTokens();

      if (tokens.accessToken) {
        setUserInfo(user);
        saveToken(tokens.accessToken);
        setDebugLog(`Logged in as: ${user?.name || user?.email}`);
      } else {
        setDebugLog('Login success but no access token received');
      }
    } catch (error: any) {
      const errorDetail = `Code: ${error.code}\nMessage: ${error.message}\nStack: ${error.stack}`;
      console.log('Login error details:', JSON.stringify(error, null, 2));
      setDebugLog(`Login Error:\n${errorDetail}`);

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        setDebugLog('User cancelled the login flow');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        setDebugLog('Sign in is in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setDebugLog('Play services not available or outdated');
      } else if (error.code === '10') {
        setDebugLog('DEVELOPER_ERROR (10): This usually means a SHA-1 mismatch or wrong package name in Google Console.');
      }
      console.error('Full Login Error Object:', error);
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
      console.log('Logout error details:', JSON.stringify(error, null, 2));
      setDebugLog(`Logout Error: ${error.message}`);
      console.error('Full Logout Error Object:', error);
    }
  }

  async function pickFolder() {
    try {
      const result = await DocumentPicker.pickDirectoryAsync();
      if (result) {
        setFolderUri(result.uri);
        await storage.setItem(SYNC_FOLDER_KEY, result.uri);
      }
    } catch (e: any) {
      console.log('Pick folder error details:', JSON.stringify(e, null, 2));
      console.error('Pick folder error:', e);
      Alert.alert('Error', 'Failed to access local file system.');
    }
  }

  return (
    <ScrollView style={styles.container}>
      <StatusBar style="auto" />

      <View style={styles.header}>
        <Text style={styles.title}>GD Drive Sync</Text>
        <StatusIndicator isAuthenticated={!!token} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>1. Authentication</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Native Google Sign-In</Text>
          <Text style={styles.infoSubText}>
            Using @react-native-google-signin/google-signin. Requires Development Build.
          </Text>
        </View>

        {!token ? (
          <View>
            <Button
              title="Login with Google (Native)"
              onPress={handleLogin}
            />
          </View>
        ) : (
          <View>
            {userInfo && (
              <Text style={styles.info}>Welcome, {userInfo.name} ({userInfo.email})</Text>
            )}
            <Text style={styles.info}>Session active. You can now sync files.</Text>
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
          placeholder="e.g. MyMobileSync"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Sync Dashboard</Text>
        <Text style={styles.info}>Status: {syncStatus}</Text>
        <Button
          title="Start Synchronization"
          onPress={() => Alert.alert("Sync Initialized", "Scanning local directory...")}
          color="#2196F3"
        />
      </View>

      {debugLog ? (
        <View style={styles.debugSection}>
          <Text style={styles.label}>Debug Info</Text>
          <Text style={styles.debugText}>{debugLog}</Text>
          <Button title="Clear Debug" onPress={() => setDebugLog('')} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eee',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  authenticated: {
    backgroundColor: '#4CAF50',
  },
  unauthenticated: {
    backgroundColor: '#F44336',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  section: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    color: '#333',
  },
  subLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 5,
  },
  info: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  infoBox: {
    backgroundColor: '#e8f0fe',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#d2e3fc',
  },
  infoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a73e8',
    marginBottom: 4,
  },
  infoSubText: {
    fontSize: 11,
    color: '#1967d2',
  },
  debugSection: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 15,
    marginTop: 20,
    marginBottom: 40,
  },
  debugText: {
    color: '#0f0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
});