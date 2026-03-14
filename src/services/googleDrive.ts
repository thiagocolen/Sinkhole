import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const MANIFEST_FILENAME = '.sync-manifest.json';
const IGNORE_FILENAME = '.sinkhole-ignore';
const MD5_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB

// System/Trash files to ignore
const SYSTEM_IGNORE_LIST = ['.DS_Store', 'thumbs.db', '.trash'];
const isIgnored = (name: string, isDir: boolean, relativePath: string, customIgnoreList: string[] = []) => {
  if (SYSTEM_IGNORE_LIST.includes(name) || name.startsWith('.trashed-')) return true;

  const fullPath = relativePath ? `${relativePath}/${name}` : name;

  return customIgnoreList.some(pattern => {
    // 1. Handle directory-only patterns (ending in /)
    let cleanPattern = pattern;
    let mustBeDir = false;
    if (pattern.endsWith('/')) {
      cleanPattern = pattern.slice(0, -1);
      mustBeDir = true;
    }

    if (mustBeDir && !isDir) return false;

    // 2. Exact match on name or fullPath
    if (name === cleanPattern || fullPath === cleanPattern) return true;

    // 3. Glob support (simple conversion to regex)
    try {
      // Escape special regex characters except *
      let regexSource = cleanPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '(.+)')             // ** matches anything including /
        .replace(/\*/g, '([^/]*)');           // * matches anything except /

      // If it doesn't start with /, it can match anywhere (like gitignore)
      // but we'll try to match it against name or relative path
      const regex = new RegExp(`^${regexSource}$`);
      const dirContentRegex = new RegExp(`^${regexSource}/.*`);

      return regex.test(name) || regex.test(fullPath) || dirContentRegex.test(fullPath);
    } catch (e) {
      console.warn(`[Sync] Invalid ignore pattern: ${pattern}`, e);
      return false;
    }
  });
};
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  md5Checksum?: string;
}

interface ManifestEntry {
  id: string;
  localMtime: number;
  remoteMtime: number;
  size: number;
  isDir: boolean;
  hash?: string;
  manifestId?: string;
  /** @deprecated use localMtime and remoteMtime */
  lastMtime?: number;
}

interface Manifest {
  files: Record<string, ManifestEntry>;
  md5Checksum?: string;
}

/**
 * Calculate the MD5 hash of a local file.
 */
const calculateLocalHash = async (file: FileSystem.File): Promise<string> => {
  try {
    const hash = await Crypto.digestFileAsync(
      Crypto.CryptoDigestAlgorithm.MD5,
      file.uri
    );
    return hash;
  } catch (e) {
    console.warn(`[Sync] Failed to calculate hash for ${file.uri}:`, e);
    return '';
  }
};

/**
 * Calculate the top-level MD5 hash for the manifest.
 */
const calculateManifestHash = async (manifest: Manifest): Promise<string> => {
  const fileHashes = Object.keys(manifest.files)
    .filter(name => name !== MANIFEST_FILENAME)
    .sort()
    .map(name => manifest.files[name].hash || '')
    .filter(h => h !== '');
  
  if (fileHashes.length === 0) return '';
  
  const combinedHashes = fileHashes.join('');
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    combinedHashes
  );
};

/**
 * Custom error for handling session loss.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Session expired or unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Type for a function that provides a valid access token, refreshing if necessary.
 */
export type TokenProvider = () => Promise<string | null>;

/**
 * Service to handle Google Drive API interactions with robust SAF support.
 */
export const GoogleDriveService = {
  /**
   * Helper to perform a fetch with a single retry on 401.
   */
  async fetchWithRetry(
    url: string,
    options: RequestInit,
    getToken: TokenProvider
  ): Promise<Response> {
    const performFetch = async (token: string | null) => {
      if (!token) throw new UnauthorizedError('No access token available');
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      });
    };

    let token = await getToken();
    let response = await performFetch(token);

    if (response.status === 401) {
      console.log('[GoogleDrive] 401 detected, attempting token refresh...');
      token = await getToken(); // getToken should handle the refresh logic
      response = await performFetch(token);
    }

    return response;
  },

  /**
   * Find a folder by name or create it if it doesn't exist on Google Drive.
   */
  async findOrCreateFolder(folderName: string, getToken: TokenProvider, parentFolderId?: string): Promise<string> {
    console.log(`[GoogleDrive] Searching for folder: ${folderName}`);
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const url = `${DRIVE_API_URL}?q=${encodeURIComponent(query)}`;
    const response = await this.fetchWithRetry(url, {}, getToken);

    if (!response.ok) {
      const errorData = await response.json();
      if (response.status === 401) throw new UnauthorizedError();
      console.error('[GoogleDrive] findOrCreateFolder Search Failed:', errorData);
      throw new Error(`Folder search failed: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      console.log(`[GoogleDrive] Folder found: ${data.files[0].id}`);
      return data.files[0].id;
    }

    console.log(`[GoogleDrive] Folder not found, creating: ${folderName}`);
    const metadata: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const createResponse = await this.fetchWithRetry(DRIVE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    }, getToken);

    const folder = await createResponse.json();
    if (!createResponse.ok) {
      if (createResponse.status === 401) throw new UnauthorizedError();
      console.error('[GoogleDrive] Folder Creation Failed:', folder);
      throw new Error(`Failed to create remote folder: ${JSON.stringify(folder)}`);
    }

    console.log(`[GoogleDrive] Folder created successfully: ${folder.id}`);
    return folder.id;
  },

  /**
   * List all files within a specific Google Drive folder.
   */
  async listFilesInFolder(folderId: string, getToken: TokenProvider): Promise<DriveFile[]> {
    console.log(`[GoogleDrive] Listing files in remote folder ${folderId}...`);
    let allFiles: DriveFile[] = [];
    let pageToken: string | undefined = undefined;
    const query = `'${folderId}' in parents and trashed = false`;

    do {
      let url = `${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id, name, mimeType, size, modifiedTime, md5Checksum),nextPageToken&pageSize=1000`;
      if (pageToken) {
        url += `&pageToken=${pageToken}`;
      }
      console.log(`[GoogleDrive] Fetching page... (token: ${pageToken ? 'yes' : 'no'})`);

      const response = await this.fetchWithRetry(url, {}, getToken);

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401) throw new UnauthorizedError();
        console.error('[GoogleDrive] listFilesInFolder page fetch Failed:', errorData);
        throw new Error(`Failed to list remote files: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      if (data.files) {
        allFiles = allFiles.concat(data.files);
      }
      pageToken = data.nextPageToken;

    } while (pageToken);

    console.log(`[GoogleDrive] Found a total of ${allFiles.length} files in remote folder ${folderId}`);
    return allFiles;
  },

  /**
   * Get the MD5 checksum of a specific file by ID.
   */
  async getFileChecksum(fileId: string, getToken: TokenProvider): Promise<string | undefined> {
    const url = `${DRIVE_API_URL}/${fileId}?fields=md5Checksum`;
    const response = await this.fetchWithRetry(url, {}, getToken);
    if (!response.ok) return undefined;
    const data = await response.json();
    return data.md5Checksum;
  },

  /**
   * Upload a file to Google Drive using multipart upload.
   */
  async uploadFile(
    localFile: FileSystem.File,
    fileName: string,
    parentFolderId: string,
    getToken: TokenProvider,
    existingFileId?: string
  ): Promise<any> {
    if (!localFile.exists) throw new Error(`Local file does not exist: ${decodeURIComponent(localFile.uri)}`);

    console.log(`[GoogleDrive] Uploading ${fileName} (${existingFileId ? 'Update' : 'New'})...`);
    // Use modern base64() method
    const fileBase64 = await localFile.base64();
    const metadata: any = { name: fileName };

    // CRITICAL: parents field is NOT writable in update (PATCH) requests.
    if (!existingFileId) {
      metadata.parents = [parentFolderId];
    }

    const boundary = 'foo_bar_baz';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      fileBase64 +
      closeDelimiter;

    const url = existingFileId
      ? `${UPLOAD_API_URL}/${existingFileId}?uploadType=multipart`
      : `${UPLOAD_API_URL}?uploadType=multipart`;

    const response = await this.fetchWithRetry(url, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }, getToken);

    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) throw new UnauthorizedError();
      console.error('[GoogleDrive] Upload Failed:', result);
      throw new Error(`Upload failed: ${JSON.stringify(result)}`);
    }
    console.log(`[GoogleDrive] Upload successful: ${result.id}`);
    return result;
  },

  /**
   * Download a file from Google Drive.
   */
  async downloadFile(fileId: string, targetFile: FileSystem.File, getToken: TokenProvider): Promise<void> {
    const url = `${DRIVE_API_URL}/${fileId}?alt=media`;
    console.log(`[GoogleDrive] Downloading file ID: ${fileId} to ${decodeURIComponent(targetFile.uri)}...`);
    
    const performDownload = async (token: string | null) => {
      if (!token) throw new UnauthorizedError();
      return FileSystem.File.downloadFileAsync(url, targetFile, {
        headers: { Authorization: `Bearer ${token}` },
        idempotent: true,
      });
    };

    try {
      let token = await getToken();
      try {
        await performDownload(token);
      } catch (e: any) {
        // If downloadFileAsync throws on 401 (some versions do)
        if (e.message?.includes('401') || e.status === 401) {
          console.log('[GoogleDrive] 401 on download, retrying...');
          token = await getToken();
          await performDownload(token);
        } else {
          throw e;
        }
      }
    } catch (e: any) {
      console.warn(`[Sync] standard download failed, trying fallback:`, e);
      
      const response = await this.fetchWithRetry(url, {}, getToken);
      
      if (!response.ok) {
        if (response.status === 401) throw new UnauthorizedError();
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      // Writing directly to the file instance using synchronous write
      targetFile.write(new Uint8Array(buffer));
      console.log(`[GoogleDrive] Download successful via fallback buffer write`);
    }
  },

  /**
   * Safely delete a file from Google Drive.
   */
  async deleteRemoteFile(fileId: string, getToken: TokenProvider): Promise<void> {
    console.log(`[GoogleDrive] Deleting remote file ID: ${fileId}`);
    const response = await this.fetchWithRetry(`${DRIVE_API_URL}/${fileId}`, {
      method: 'DELETE',
    }, getToken);

    if (!response.ok && response.status !== 404) {
      if (response.status === 401) throw new UnauthorizedError();
      const error = await response.json();
      console.error('[GoogleDrive] Delete Failed:', error);
      throw new Error(`Failed to delete remote file: ${JSON.stringify(error)}`);
    }
    console.log(`[GoogleDrive] Delete successful`);
  },

  /**
   * Load or initialize a sync manifest for a directory.
   */
  async loadManifest(directory: FileSystem.Directory): Promise<Manifest> {
    try {
      // Find the manifest file in the directory list
      // Note: directory.list() is synchronous in SDK 54
      const entries = directory.list();
      const manifestFile = entries.find(e => e.name === MANIFEST_FILENAME);

      if (manifestFile instanceof FileSystem.File) {
        // Use modern text() method
        const content = await manifestFile.text();
        const parsed = JSON.parse(content);
        console.log(`[Sync] Loaded manifest with ${Object.keys(parsed.files || {}).length} entries`);
        return parsed;
      }
    } catch (e) {
      console.warn(`[Sync] Failed to load manifest:`, e);
    }
    return { files: {} };
  },

  /**
   * Save a sync manifest for a directory.
   */
  async saveManifest(directory: FileSystem.Directory, manifest: Manifest): Promise<void> {
    try {
      // Update top-level hash before saving
      manifest.md5Checksum = await calculateManifestHash(manifest);
      
      const entries = directory.list();
      let manifestFile = entries.find(e => e.name === MANIFEST_FILENAME) as FileSystem.File | undefined;

      if (!manifestFile || !(manifestFile instanceof FileSystem.File)) {
        // createFile is synchronous in SDK 54
        manifestFile = directory.createFile(MANIFEST_FILENAME, 'application/json');
      }

      manifestFile.write(JSON.stringify(manifest, null, 2));
      console.log(`[Sync] Saved manifest with ${Object.keys(manifest.files).length} entries. Manifest Hash: ${manifest.md5Checksum}`);
    } catch (e) {
      console.error(`[Sync] Failed to save manifest:`, e);
    }
  },

  /**
   * Main synchronization loop with robust SAF support and deletion tracking.
   */
  async syncDirectory(
    localUri: string,
    targetFolderName: string,
    getToken: TokenProvider,
    onProgress: (message: string) => void,
    parentDriveFolderId?: string,
    customIgnoreList: string[] = [],
    relativePath: string = '',
    existingDriveFolderId?: string
  ): Promise<string> {
    console.log(`[Sync] Starting sync for ${targetFolderName} (local: ${decodeURIComponent(localUri)})`);
    onProgress(`Syncing: ${targetFolderName}`);

    // 1. Remote Setup
    const driveFolderId = existingDriveFolderId || await this.findOrCreateFolder(targetFolderName, getToken, parentDriveFolderId);
    const remoteFiles = await this.listFilesInFolder(driveFolderId, getToken);
    const remoteMap = new Map(remoteFiles.map(f => [f.name, f]));

    // 2. Local Setup
    const localDir = new FileSystem.Directory(localUri);
    // SAF NOTE: We assume localDir exists because it was picked by the user or created by parent.

    let localEntries: (FileSystem.File | FileSystem.Directory)[] = [];
    try {
      localEntries = localDir.list();
    } catch (e) {
      console.warn(`[Sync] Could not list local directory:`, e);
    }
    const localMap = new Map(localEntries.map(e => [e.name, e]));
    console.log(`[Sync] ${targetFolderName}: Found ${localEntries.length} local items and ${remoteFiles.length} remote items.`);

    let currentIgnoreList = [...customIgnoreList];

    // 3. Root Level: Sync .sinkhole-ignore first and load patterns
    if (!parentDriveFolderId) {
      const localIgnore = localMap.get(IGNORE_FILENAME);
      const remoteIgnore = remoteMap.get(IGNORE_FILENAME);

      console.log(`[Sync] Root directory check for ${IGNORE_FILENAME}. Local: ${!!localIgnore}, Remote: ${!!remoteIgnore}`);

      if (localIgnore || remoteIgnore) {
        onProgress(`Processing ${IGNORE_FILENAME}...`);
        try {
          // Perform a minimal sync for the ignore file itself
          if (localIgnore instanceof FileSystem.File && remoteIgnore) {
            const localMtime = (localIgnore.modificationTime || 0) / 1000;
            const remoteMtime = new Date(remoteIgnore.modifiedTime!).getTime() / 1000;
            console.log(`[Sync] ${IGNORE_FILENAME} times: Local ${localMtime}, Remote ${remoteMtime}`);
            if (localMtime > remoteMtime + 2) {
              console.log(`[Sync] Uploading newer local ${IGNORE_FILENAME}`);
              await this.uploadFile(localIgnore, IGNORE_FILENAME, driveFolderId, getToken, remoteIgnore.id);
            } else if (remoteMtime > localMtime + 2) {
              console.log(`[Sync] Downloading newer remote ${IGNORE_FILENAME}`);
              await this.downloadFile(remoteIgnore.id, localIgnore, getToken);
            }
          } else if (localIgnore instanceof FileSystem.File) {
            console.log(`[Sync] Uploading new local ${IGNORE_FILENAME}`);
            await this.uploadFile(localIgnore, IGNORE_FILENAME, driveFolderId, getToken);
          } else if (remoteIgnore) {
            console.log(`[Sync] Downloading new remote ${IGNORE_FILENAME}`);
            const targetFile = localDir.createFile(IGNORE_FILENAME, remoteIgnore.mimeType || 'text/plain');
            await this.downloadFile(remoteIgnore.id, targetFile, getToken);
          }

          // Load patterns from the now-synced local file
          const freshLocalIgnore = localDir.list().find(e => e.name === IGNORE_FILENAME);
          if (freshLocalIgnore instanceof FileSystem.File) {
            const content = await freshLocalIgnore.text();
            onProgress(`Ignore File Content:\n${content}`); // LOG RAW CONTENT TO UI
            const patterns = content
              .split(/\r?\n/)
              .map(line => line.trim())
              .filter(line => line.length > 0 && !line.startsWith('#'));
            currentIgnoreList = [...currentIgnoreList, ...patterns];
            console.log(`[Sync] Loaded patterns: ${JSON.stringify(currentIgnoreList)}`);
            onProgress(`Loaded ${patterns.length} ignore patterns`);
          }
        } catch (e) {
          console.warn(`[Sync] Failed to process ${IGNORE_FILENAME}:`, e);
          onProgress(`Warning: Failed to load ${IGNORE_FILENAME}`);
        }
      }
    }

    // 4. Manifest Setup
    const manifest = await this.loadManifest(localDir);
    const newManifest: Manifest = { files: {} };

    // 5. Combine all names to process (Local + Remote + Manifest)
    const allNames = new Set([...localMap.keys(), ...remoteMap.keys(), ...Object.keys(manifest.files)]);
    console.log(`[Sync] ${targetFolderName}: Total unique names to process: ${allNames.size}`);

    for (const name of allNames) {
      // Skip already processed ignore file at root, or any ignored files/folders
      if (!parentDriveFolderId && name === IGNORE_FILENAME) {
        // ...
        // We still want it in the manifest so it's tracked
        const local = localMap.get(name);
        const remote = remoteMap.get(name);
        if (remote) {
          const mtime = local instanceof FileSystem.File ? (local.modificationTime || 0) / 1000 : 0;
          newManifest.files[name] = { 
            id: remote.id, 
            localMtime: mtime, 
            remoteMtime: new Date(remote.modifiedTime!).getTime() / 1000, 
            size: local instanceof FileSystem.File ? local.size || 0 : 0, 
            isDir: false 
          };
        }
        continue;
      }

      const local = localMap.get(name);
      const remote = remoteMap.get(name);
      const inManifest = manifest.files[name];

      // Pre-calculate common values if they exist
      const localMtime = (local instanceof FileSystem.File) ? (local.modificationTime || 0) / 1000 : 0;
      const localSize = (local instanceof FileSystem.File) ? (local.size || 0) : 0;
      const remoteMtime = remote ? new Date(remote.modifiedTime!).getTime() / 1000 : 0;
      const remoteSize = remote ? parseInt(remote.size || '0') : 0;

      const isRemoteDir = remote?.mimeType === 'application/vnd.google-apps.folder';
      const isLocalDir = local instanceof FileSystem.Directory;
      const isDir = isRemoteDir || isLocalDir;

      if (isIgnored(name, isDir, relativePath, currentIgnoreList)) continue;

      try {
        // --- DELETION HANDLING ---

        // 1. Local Deletion: Existed in manifest, now missing locally, but still exists on Drive.
        if (inManifest && !local && remote) {
          onProgress(`Deleting remote (local deletion detected): ${name}`);
          await this.deleteRemoteFile(remote.id, getToken);
          continue;
        }

        // 2. Remote Deletion: Existed in manifest, now missing on Drive, but still exists locally.
        if (inManifest && local && !remote) {
          onProgress(`Deleting local (remote deletion detected): ${name}`);
          if (local instanceof FileSystem.File) local.delete();
          else (local as FileSystem.Directory).delete();
          continue;
        }

        // 3. Both Deleted: Cleanup (nothing to do, manifest entry won't be in newManifest)
        if (inManifest && !local && !remote) {
          continue;
        }

        // 4. Type mismatch / Conflict handling (Local exists, Remote exists, but they are different types)
        if (local && remote && isLocalDir !== isRemoteDir) {
          onProgress(`Type mismatch conflict for ${name}. Prioritizing Remote.`);
          if (isLocalDir) (local as FileSystem.Directory).delete();
          else (local as FileSystem.File).delete();
          // Force local to null so it's treated as "Remote Only" in next step
          localMap.delete(name);
          // Refresh local state will be handled below
        }

        // --- DIRECTORY SYNC ---
        if (isRemoteDir || isLocalDir) {
          const currentPath = relativePath ? `${relativePath}/${name}` : name;
          console.log(`[Sync] Processing directory: '${currentPath}'`);
          onProgress(`Processing directory: ${name}`);
          let subDir = local instanceof FileSystem.Directory ? local : null;
          
          if (!subDir && isRemoteDir) {
            onProgress(`Creating local directory: ${name}`);
            // createDirectory is synchronous in SDK 54
            subDir = localDir.createDirectory(name);
          }

          if (subDir) {
            // FAST COMPARISON OPTIMIZATION
            if (inManifest?.isDir && inManifest?.hash && inManifest?.manifestId) {
               const remoteManifestHash = await this.getFileChecksum(inManifest.manifestId, getToken);
               const localSubManifest = await this.loadManifest(subDir);
               const localManifestHash = localSubManifest.md5Checksum;

               if (remoteManifestHash === inManifest.hash && localManifestHash === inManifest.hash) {
                  console.log(`[Sync] Fast-skipping directory: ${currentPath}`);
                  onProgress(`Skipping (no changes): ${name}`);
                  newManifest.files[name] = inManifest;
                  continue;
               }
            }

            console.log(`[Sync] Recursing into directory: '${currentPath}'`);
            const subDriveId = await this.syncDirectory(
              subDir.uri, 
              name, 
              getToken, 
              onProgress, 
              driveFolderId,
              currentIgnoreList,
              relativePath ? `${relativePath}/${name}` : name,
              remote?.id
            );

            // After sync, reload manifest to get its hash and ID
            const updatedSubManifest = await this.loadManifest(subDir);
            const remoteManifestFile = updatedSubManifest.files[MANIFEST_FILENAME];

            newManifest.files[name] = { 
              id: subDriveId, 
              localMtime: 0, 
              remoteMtime: 0, 
              size: 0, 
              isDir: true,
              hash: updatedSubManifest.md5Checksum,
              manifestId: remoteManifestFile?.id
            };
            continue;
          } else if (isRemoteDir) {
             // Fallback if local directory creation failed for some reason, but we have a remote ID
             onProgress(`Warning: Could not create or access local directory ${name}. Skipping its contents.`);
             newManifest.files[name] = { id: remote!.id, localMtime: 0, remoteMtime: 0, size: 0, isDir: true };
             continue;
          }
        }

        // --- FILE SYNC ---
        // Skip Google Workspace files (Docs, Sheets, etc.)
        if (remote?.mimeType.startsWith('application/vnd.google-apps.')) continue;

        let finalId = remote?.id;
        let finalLocalMtime = 0;
        let finalRemoteMtime = 0;
        let finalSize = 0;
        let finalHash = inManifest?.hash;

        if (local instanceof FileSystem.File && remote) {
          // Both exist: check for updates
          // (Using pre-calculated localMtime, remoteMtime, localSize, remoteSize)

          // Check if either has changed since last sync (using manifest)
          const baseLocalMtime = inManifest?.localMtime ?? inManifest?.lastMtime ?? 0;
          const baseRemoteMtime = inManifest?.remoteMtime ?? inManifest?.lastMtime ?? 0;

          let hasLocalChanged = !inManifest || Math.abs(localMtime - baseLocalMtime) > 2 || localSize !== inManifest.size;
          let hasRemoteChanged = !inManifest || Math.abs(remoteMtime - baseRemoteMtime) > 2 || remoteSize !== inManifest.size;

          // CONTENT HASHING OPTIMIZATION
          if (hasLocalChanged || hasRemoteChanged) {
            // If size matches but timestamp changed, verify with hash
            if (localSize === remoteSize) {
              const localHash = await calculateLocalHash(local);
              const remoteHash = remote.md5Checksum;

              // If content matches, we don't need to transfer
              if (localHash === remoteHash) {
                console.log(`[Sync] Content match for ${name} (Hash: ${localHash}). Skipping transfer.`);
                hasLocalChanged = false;
                hasRemoteChanged = false;
                finalHash = localHash;
              } else {
                finalHash = localHash;
              }
            }
          }

          if (hasLocalChanged && !hasRemoteChanged) {
            onProgress(`Uploading update: ${name}`);
            const res = await this.uploadFile(local, name, driveFolderId, getToken, remote.id);
            finalId = res.id || remote.id;
            finalHash = res.md5Checksum || await calculateLocalHash(local);

            // Re-fetch local metadata to get actual modification time after upload (if changed)
            const freshLocal = new FileSystem.File(local.uri);
            finalLocalMtime = (freshLocal.modificationTime || 0) / 1000;
            finalRemoteMtime = new Date(res.modifiedTime || remote.modifiedTime!).getTime() / 1000;
            finalSize = freshLocal.size || 0;
          } else if (hasRemoteChanged && !hasLocalChanged) {
            onProgress(`Downloading update: ${name}`);
            await this.downloadFile(remote.id, local, getToken);

            // Re-fetch local metadata to get ACTUAL modification time after download
            const freshLocal = new FileSystem.File(local.uri);
            finalLocalMtime = (freshLocal.modificationTime || 0) / 1000;
            finalRemoteMtime = remoteMtime;
            finalSize = freshLocal.size || 0;
            finalHash = remote.md5Checksum;
          } else if (hasLocalChanged && hasRemoteChanged) {
            // Conflict (LWW)
            if (localMtime > remoteMtime) {
              onProgress(`Conflict (LWW): Uploading local version of ${name}`);
              const res = await this.uploadFile(local, name, driveFolderId, getToken, remote.id);

              const freshLocal = new FileSystem.File(local.uri);
              finalLocalMtime = (freshLocal.modificationTime || 0) / 1000;
              finalRemoteMtime = new Date(res.modifiedTime || remote.modifiedTime!).getTime() / 1000;
              finalSize = freshLocal.size || 0;
              finalHash = res.md5Checksum || await calculateLocalHash(local);
            } else {
              onProgress(`Conflict (LWW): Downloading remote version of ${name}`);
              await this.downloadFile(remote.id, local, getToken);

              const freshLocal = new FileSystem.File(local.uri);
              finalLocalMtime = (freshLocal.modificationTime || 0) / 1000;
              finalRemoteMtime = remoteMtime;
              finalSize = freshLocal.size || 0;
              finalHash = remote.md5Checksum;
            }
          } else {
            // No changes
            finalId = remote.id;
            finalLocalMtime = localMtime;
            finalRemoteMtime = remoteMtime;
            finalSize = localSize;
            if (!finalHash) finalHash = remote.md5Checksum || await calculateLocalHash(local);
          }

        } else if (local instanceof FileSystem.File) {
          // Local Only (New file): Only if it's NOT in the manifest
          if (!inManifest) {
            onProgress(`Uploading new: ${name}`);
            const res = await this.uploadFile(local, name, driveFolderId, getToken);
            finalId = res.id;
            finalHash = res.md5Checksum || await calculateLocalHash(local);

            const freshLocal = new FileSystem.File(local.uri);
            finalLocalMtime = (freshLocal.modificationTime || 0) / 1000;
            finalRemoteMtime = new Date(res.modifiedTime || new Date().toISOString()).getTime() / 1000;
            finalSize = freshLocal.size || 0;
          } else {
            // It was in manifest but is missing on Drive. Already handled in deletion logic.
          }

        } else if (remote) {
          // Remote Only (New file): Only if it's NOT in the manifest
          if (!inManifest) {
            onProgress(`Downloading new: ${name}`);
            // createFile is synchronous in SDK 54
            const targetFile = localDir.createFile(name, remote.mimeType || 'application/octet-stream');
            await this.downloadFile(remote.id, targetFile, getToken);

            const freshLocal = new FileSystem.File(targetFile.uri);
            finalLocalMtime = (freshLocal.modificationTime || 0) / 1000;
            finalRemoteMtime = remoteMtime;
            finalSize = freshLocal.size || 0;
            finalId = remote.id;
            finalHash = remote.md5Checksum;
          } else {
            // It was in manifest but is missing locally. Already handled in deletion logic.
          }
        }

        if (finalId) {
          newManifest.files[name] = { 
            id: finalId, 
            localMtime: finalLocalMtime, 
            remoteMtime: finalRemoteMtime, 
            size: finalSize, 
            isDir: false,
            hash: finalHash
          };
        }
      } catch (err: any) {
        if (err instanceof UnauthorizedError) {
          throw err; // Re-throw to stop the entire sync process immediately
        }
        console.error(`[Sync Error] Failed to sync ${name}:`, err);
        onProgress(`Error: ${name} - ${err.message}`);
        if (inManifest) newManifest.files[name] = inManifest;
      }
    }

    await this.saveManifest(localDir, newManifest);
    return driveFolderId;
  },
};

