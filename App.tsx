import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Button, ScrollView, Alert, TextInput, Platform, ActivityIndicator, TouchableOpacity, useWindowDimensions, useColorScheme, Image, Linking, AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import { GoogleDriveService, UnauthorizedError } from './src/services/googleDrive';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';

WebBrowser.maybeCompleteAuthSession();

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
const THEME_KEY = 'app_theme_mode';
const WEB_CLIENT_ID = '572011650493-0nijokv3fm6p1dqtelbu1iisvt1fs42r.apps.googleusercontent.com';

const HIDE_CONFIG = true;
const SINKHOLE_NAME = 'SinkholeFolder';

type ThemeMode = 'light' | 'dark' | 'system';

const themes = {
  light: {
    background: '#e2ebe2',
    card: '#ffffff',
    text: '#333333',
    subText: '#666666',
    accent: '#2e7d32', // Dark Green
    inputBg: '#fafafa',
    inputBorder: '#e0e0e0',
    debugBg: '#b6d3b6ff',
    debugText: '#004600',
    statusBg: '#ffffff',
    statusBorder: '#eeeeee',
    buttonDanger: '#d32f2f',
    buttonSecondary: '#689f38', // Light Olive Green
  },
  dark: {
    background: '#121212',
    card: '#1e1e1e',
    text: '#e0e0e0',
    subText: '#aaaaaa',
    accent: '#4caf50', // Bright Green
    inputBg: '#2c2c2c',
    inputBorder: '#444444',
    debugBg: '#004600',
    debugText: '#80ff80',
    statusBg: '#2c2c2c',
    statusBorder: '#444444',
    buttonDanger: '#ef5350',
    buttonSecondary: '#8bc34a', // Light Green
  },
};

const StatusIndicator = ({ isAuthenticated, onPress, theme }: { isAuthenticated: boolean, onPress: () => void, theme: any }) => (
  <TouchableOpacity
    style={[styles.statusContainer, { backgroundColor: theme.statusBg, borderColor: theme.statusBorder }]}
    onPress={onPress}
  >
    <View style={[styles.statusIndicator, isAuthenticated ? styles.authenticated : styles.unauthenticated]} />
    <Text style={[styles.statusText, { color: theme.subText }]}>{isAuthenticated ? 'Connected' : 'Disconnected'}</Text>
  </TouchableOpacity>
);

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const systemColorScheme = useColorScheme();

  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [targetFolderName, setTargetFolderName] = useState<string>('SyncAppFolder');
  const [syncStatus, setSyncStatus] = useState<string>('Not Synced');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [debugLog, setDebugLog] = useState<string>('');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');

  const theme = useMemo(() => {
    if (themeMode === 'system') {
      return systemColorScheme === 'dark' ? themes.dark : themes.light;
    }
    return themeMode === 'dark' ? themes.dark : themes.light;
  }, [themeMode, systemColorScheme]);

  const isDarkActive = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');

  useEffect(() => {
    async function init() {
      await ScreenOrientation.unlockAsync();
      GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
        offlineAccess: true,
        scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive'],
      });
      loadStoredData();
    }
    init();
  }, []);

  async function loadStoredData() {
    console.log('[App] Loading stored data...');
    try {
      const storedTheme = await storage.getItem(THEME_KEY);
      if (storedTheme) setThemeMode(storedTheme as ThemeMode);

      const isSignedIn = await GoogleSignin.hasPreviousSignIn();
      console.log('[App] Is signed in?', isSignedIn);
      if (isSignedIn) {
        const currentUser = await GoogleSignin.getCurrentUser();
        console.log('[App] Current user:', currentUser?.user?.email);
        if (currentUser) {
          setUserInfo(currentUser.user);
          const tokens = await GoogleSignin.getTokens();
          if (tokens.accessToken) {
            setToken(tokens.accessToken);
          }
        }
      } else {
        console.log('[App] No previous sign-in found, initiating login...');
        handleLogin();
      }

      const storedFolder = await storage.getItem(SYNC_FOLDER_KEY);
      if (storedFolder) setFolderUri(storedFolder);

      // Always force Google Drive folder to SinkholeFolder
      setTargetFolderName(SINKHOLE_NAME);
      await storage.setItem(TARGET_FOLDER_KEY, SINKHOLE_NAME);
    } catch (e) {
      console.error('[App] Persistence load error:', e);
    }
  }

  const cycleTheme = async () => {
    let nextMode: ThemeMode;
    if (themeMode === 'dark') nextMode = 'light';
    else if (themeMode === 'light') nextMode = 'system';
    else nextMode = 'dark';

    setThemeMode(nextMode);
    await storage.setItem(THEME_KEY, nextMode);
  };

  const getThemeIcon = () => {
    if (themeMode === 'dark') return '🌙';
    if (themeMode === 'light') return '☀️';
    return '⚙️';
  };

  const handleLogin = async () => {
    console.log('[App] Starting login flow...');
    setDebugLog('Starting login flow...');
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      console.log('[App] Login response received:', JSON.stringify(response, null, 2));

      const user = response.data?.user;
      const tokens = await GoogleSignin.getTokens();

      if (tokens.accessToken) {
        console.log('[App] Login successful for:', user?.email);
        setUserInfo(user);
        setToken(tokens.accessToken);
        await storage.setItem(GOOGLE_TOKEN_KEY, tokens.accessToken);
        setDebugLog(`Logged in as: ${user?.name || user?.email}`);
      } else {
        console.warn('[App] Login succeeded but no access token received');
        setDebugLog('Warning: No access token');
      }
    } catch (error: any) {
      console.error('[App] Login Error Detail:', JSON.stringify(error, null, 2));
      console.error('[App] Login Error Code:', error.code);
      console.error('[App] Login Error Message:', error.message);
      
      let errorMessage = `Login Error (${error.code || 'unknown'}): ${error.message}`;

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('[App] Login cancelled by user');
        errorMessage = 'Login cancelled';
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('[App] Login already in progress');
        errorMessage = 'Login in progress...';
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.error('[App] Play services not available');
        errorMessage = 'Error: Play services not available';
      } else if (error.code === statusCodes.DEVELOPER_ERROR) {
        console.error('[App] Developer Error (10): Check SHA-1, Package Name, and Web Client ID in Google Console');
        errorMessage = 'Developer Error: Check Console Config';
      } else if (error.code === '12500') {
        console.error('[App] Sign-In Failed (12500): Likely a configuration mismatch or unverified test user');
        errorMessage = 'Sign-In Failed (12500): Check Test Users';
      }
      
      setDebugLog(errorMessage);
    }
  };

  async function handleLogout() {
    console.log('[App] Starting logout...');
    try {
      await GoogleSignin.signOut();
      await storage.deleteItem(GOOGLE_TOKEN_KEY);
      setToken(null);
      setUserInfo(null);
      setDebugLog('Logged out');
      console.log('[App] Logout successful');
    } catch (error: any) {
      console.error('[App] Logout Error:', error);
      setDebugLog(`Logout Error: ${error.message}`);
    }
  }

  const toggleAuth = () => {
    if (token) handleLogout();
    else handleLogin();
  };

  async function pickFolder() {
    try {
      const directory = await FileSystem.Directory.pickDirectoryAsync();
      if (directory && directory.uri) {
        setFolderUri(directory.uri);
        await storage.setItem(SYNC_FOLDER_KEY, directory.uri);
      }
    } catch (e: any) {
      console.error('[App] Folder selection error:', e);
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
      // The token provider function that will be called by GoogleDriveService
      // whenever a token is needed or a retry is required.
      const tokenProvider = async () => {
        try {
          const tokens = await GoogleSignin.getTokens();
          if (tokens.accessToken) {
            setToken(tokens.accessToken); // Update UI state
            await storage.setItem(GOOGLE_TOKEN_KEY, tokens.accessToken);
            return tokens.accessToken;
          }
        } catch (e) {
          console.error('[App] Failed to get fresh tokens:', e);
        }
        return null;
      };

      await GoogleDriveService.syncDirectory(
        folderUri,
        targetFolderName,
        tokenProvider,
        (message) => {
          setDebugLog((prev) => `${prev}\n> ${message}`);
          setSyncStatus(message);
        }
      );
      setSyncStatus(`Last Sync: ${new Date().toLocaleTimeString()}`);
    } catch (error: any) {
      console.error('[App] Sync Failed Detail:', error);
      if (error.stack) console.error('[App] Sync Error Stack:', error.stack);

      if (error instanceof UnauthorizedError) {
        setToken(null);
        setUserInfo(null);
        await storage.deleteItem(GOOGLE_TOKEN_KEY);
        setDebugLog((prev) => `${prev}\n!! Session Lost: Please login again.`);
        setSyncStatus('Session Expired');
        Alert.alert('Session Expired', 'Your Google session has expired. Please login again to continue syncing.');
      } else {
        setDebugLog((prev) => `${prev}\n!! Sync Error: ${error.message}`);
        setSyncStatus('Failed');
        Alert.alert('Sync Failed', error.message);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const mainContent = (
    <>
      <View style={[styles.section, { backgroundColor: theme.card, width: isLandscape ? '48.5%' : '100%' }]}>
        <View style={styles.sectionTitleContainer}>
          <MaterialCommunityIcons name="folder-outline" size={24} color={theme.accent} style={styles.sectionIcon} />
          <Text style={[styles.label, { color: theme.text }]}>Local Folder</Text>
        </View>
        <Text style={[styles.info, { color: theme.subText }]} numberOfLines={1} ellipsizeMode="middle">
          {folderUri || 'No folder selected'}
        </Text>
        <Button title="Select Folder" onPress={pickFolder} color={theme.accent} />
      </View>

      {!HIDE_CONFIG && (
        <View style={[styles.section, { backgroundColor: theme.card, width: isLandscape ? '48.5%' : '100%' }]}>
          <View style={styles.sectionTitleContainer}>
            <MaterialCommunityIcons name="google-drive" size={24} color="#34A853" style={styles.sectionIcon} />
            <Text style={[styles.label, { color: theme.text }]}>Google Drive Folder</Text>
          </View>
          <Text style={[styles.subLabel, { color: theme.subText }]}>Target Folder Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.inputBorder }]}
            value={targetFolderName}
            onChangeText={(val) => {
              setTargetFolderName(val);
              storage.setItem(TARGET_FOLDER_KEY, val);
            }}
          />
        </View>
      )}

      <View style={[styles.section, { backgroundColor: theme.card, width: isLandscape ? '48.5%' : '100%' }]}>
        <View style={styles.sectionTitleContainer}>
          <MaterialCommunityIcons name="sync" size={24} color={theme.accent} style={styles.sectionIcon} />
          <Text style={[styles.label, { color: theme.text }]}>Sync Folders</Text>
        </View>
        <Text style={[styles.info, { color: theme.subText }]}>Status: {syncStatus}</Text>
        {isSyncing ? (
          <ActivityIndicator size="large" color={theme.accent} />
        ) : (
          <Button
            title="Sync Now"
            onPress={handleSync}
            color={theme.accent}
            disabled={!token || !folderUri}
          />
        )}
      </View>
    </>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, isLandscape && { paddingHorizontal: 90 }]}
    >
      <StatusBar style={isDarkActive ? 'light' : 'dark'} />

      <View style={[styles.header, { flexDirection: isLandscape ? 'row' : 'column', alignItems: isLandscape ? 'flex-start' : 'stretch' }]}>
        {isLandscape ? (
          <>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={require('./assets/sinkhole-icon.png')}
                style={{ width: 60, height: 60, marginRight: 12, borderRadius: 8 }}
              />
              <View>
                <Text style={[styles.title, { color: theme.accent, fontSize: 30 }]}>Sinkhole</Text>
                {userInfo && (
                  <Text style={[styles.userInfoText, { color: theme.subText }]}>{userInfo.email}</Text>
                )}
              </View>
            </View>
            <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' }}>
              <StatusIndicator isAuthenticated={!!token} onPress={toggleAuth} theme={theme} />
              <TouchableOpacity onPress={cycleTheme} style={[styles.themeToggle, { marginLeft: 10 }]}>
                <Text style={{ fontSize: 20 }}>{getThemeIcon()}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Image
              source={require('./assets/sinkhole-icon.png')}
              style={{ width: 120, height: 120, borderRadius: 15, marginBottom: 15 }}
              resizeMode="contain"
            />
            <Text style={[styles.title, { color: theme.accent, fontSize: 32, textAlign: 'center' }]}>Wellcome!</Text>
            {userInfo && (
              <Text style={[styles.userInfoText, { color: theme.subText, fontSize: 16, textAlign: 'center', marginTop: 5, marginBottom: 20 }]}>
                {userInfo.email}
              </Text>
            )}
            <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <TouchableOpacity onPress={cycleTheme} style={styles.themeToggle}>
                <Text style={{ fontSize: 24 }}>{getThemeIcon()}</Text>
              </TouchableOpacity>
              <StatusIndicator isAuthenticated={!!token} onPress={toggleAuth} theme={theme} />
            </View>
          </View>
        )}
      </View>

      <View style={isLandscape ? styles.landscapeGrid : styles.portraitStack}>
        {mainContent}
      </View>

      <View style={[styles.debugSection, { backgroundColor: theme.debugBg, width: '100%' }]}>
        <View style={styles.sectionTitleContainer}>
          <MaterialCommunityIcons name="console" size={24} color="#a0ffa0" style={styles.sectionIcon} />
          <Text style={[styles.label, { color: '#fff' }]}>Logs</Text>
        </View>
        <ScrollView style={styles.debugScroll} nestedScrollEnabled={true}>
          <Text style={[styles.debugText, { color: theme.debugText }]}>{debugLog || 'No logs yet...'}</Text>
        </ScrollView>
        <Button title="Clear Logs" onPress={() => setDebugLog('')} color={theme.buttonSecondary} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { justifyContent: 'space-between', marginBottom: 30 },
  title: { fontSize: 24, fontWeight: 'bold' },
  userInfoText: { fontSize: 12, marginTop: 2 },
  themeToggle: { padding: 8, backgroundColor: 'rgba(0, 0, 0, 0.1)', borderRadius: 20, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  statusContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  statusIndicator: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  authenticated: { backgroundColor: '#4CAF50' },
  unauthenticated: { backgroundColor: '#F44336' },
  statusText: { fontSize: 13, fontWeight: '600' },
  portraitStack: { width: '100%' },
  landscapeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  section: { padding: 18, borderRadius: 15, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  sectionTitleContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionIcon: { marginRight: 8 },
  label: { fontSize: 18, fontWeight: '700' },
  subLabel: { fontSize: 12, marginBottom: 5 },
  info: { fontSize: 14, marginBottom: 12 },
  input: { borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1 },
  debugSection: { padding: 15, borderRadius: 15, marginTop: 10, marginBottom: 40 },
  debugScroll: { minHeight: 120, maxHeight: 300, marginBottom: 15 },
  debugText: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});