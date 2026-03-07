import * as FileSystem from 'expo-file-system';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const MANIFEST_FILENAME = '.sync-manifest.json';

// System/Trash files to ignore
const IGNORE_LIST = ['.DS_Store', 'thumbs.db', '.trash', MANIFEST_FILENAME];
const isIgnored = (name: string) => 
  IGNORE_LIST.includes(name) || name.startsWith('.trashed-');

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

interface ManifestEntry {
  id: string;
  lastMtime: number;
  size: number;
  isDir: boolean;
}

interface Manifest {
  files: Record<string, ManifestEntry>;
}

/**
 * Service to handle Google Drive API interactions with robust SAF support.
 */
export const GoogleDriveService = {
  /**
   * Find a folder by name or create it if it doesn't exist on Google Drive.
   */
  async findOrCreateFolder(folderName: string, accessToken: string, parentFolderId?: string): Promise<string> {
    console.log(`[GoogleDrive] Searching for folder: ${folderName}`);
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }
    
    const response = await fetch(`${DRIVE_API_URL}?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorData = await response.json();
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

    const createResponse = await fetch(DRIVE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    const folder = await createResponse.json();
    if (!createResponse.ok) {
      console.error('[GoogleDrive] Folder Creation Failed:', folder);
      throw new Error(`Failed to create remote folder: ${JSON.stringify(folder)}`);
    }
    
    console.log(`[GoogleDrive] Folder created successfully: ${folder.id}`);
    return folder.id;
  },

  /**
   * List all files within a specific Google Drive folder.
   */
  async listFilesInFolder(folderId: string, accessToken: string): Promise<DriveFile[]> {
    const query = `'${folderId}' in parents and trashed = false`;
    const response = await fetch(`${DRIVE_API_URL}?q=${encodeURIComponent(query)}&fields=files(id, name, mimeType, size, modifiedTime)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[GoogleDrive] listFilesInFolder Failed:', errorData);
      throw new Error(`Failed to list remote files: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const files = data.files || [];
    console.log(`[GoogleDrive] Found ${files.length} files in remote folder ${folderId}`);
    return files;
  },

  /**
   * Upload a file to Google Drive using multipart upload.
   */
  async uploadFile(
    localFile: FileSystem.File,
    fileName: string,
    parentFolderId: string,
    accessToken: string,
    existingFileId?: string
  ): Promise<any> {
    if (!localFile.exists) throw new Error(`Local file does not exist: ${localFile.uri}`);

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

    const response = await fetch(url, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('[GoogleDrive] Upload Failed:', result);
      throw new Error(`Upload failed: ${JSON.stringify(result)}`);
    }
    console.log(`[GoogleDrive] Upload successful: ${result.id}`);
    return result;
  },

  /**
   * Download a file from Google Drive.
   */
  async downloadFile(fileId: string, targetFile: FileSystem.File, accessToken: string): Promise<void> {
    const url = `${DRIVE_API_URL}/${fileId}?alt=media`;
    console.log(`[GoogleDrive] Downloading file ID: ${fileId} to ${targetFile.uri}...`);
    try {
      // Use static downloadFileAsync which is standard in SDK 54
      await FileSystem.File.downloadFileAsync(url, targetFile, {
        headers: { Authorization: `Bearer ${accessToken}` },
        idempotent: true,
      });
      console.log(`[GoogleDrive] Download successful via downloadFileAsync`);
    } catch (e) {
      console.warn(`[Sync] standard download failed, trying fallback:`, e);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const buffer = await response.arrayBuffer();
      // Writing directly to the file instance using synchronous write
      targetFile.write(new Uint8Array(buffer));
      console.log(`[GoogleDrive] Download successful via fallback buffer write`);
    }
  },

  /**
   * Safely delete a file from Google Drive.
   */
  async deleteRemoteFile(fileId: string, accessToken: string): Promise<void> {
    console.log(`[GoogleDrive] Deleting remote file ID: ${fileId}`);
    const response = await fetch(`${DRIVE_API_URL}/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404) {
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
      const entries = directory.list();
      let manifestFile = entries.find(e => e.name === MANIFEST_FILENAME) as FileSystem.File | undefined;
      
      if (!manifestFile || !(manifestFile instanceof FileSystem.File)) {
        // createFile is synchronous in SDK 54
        manifestFile = directory.createFile(MANIFEST_FILENAME, 'application/json');
      }
      
      manifestFile.write(JSON.stringify(manifest, null, 2));
      console.log(`[Sync] Saved manifest with ${Object.keys(manifest.files).length} entries`);
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
    accessToken: string,
    onProgress: (message: string) => void,
    parentDriveFolderId?: string
  ): Promise<string> {
    console.log(`[Sync] Starting sync for ${targetFolderName} (local: ${localUri})`);
    onProgress(`Syncing: ${targetFolderName}`);

    // 1. Remote Setup
    const driveFolderId = await this.findOrCreateFolder(targetFolderName, accessToken, parentDriveFolderId);
    const remoteFiles = await this.listFilesInFolder(driveFolderId, accessToken);
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

    // 3. Manifest Setup
    const manifest = await this.loadManifest(localDir);
    const newManifest: Manifest = { files: {} };

    // 4. Combine all names to process (Local + Remote + Manifest)
    const allNames = new Set([...localMap.keys(), ...remoteMap.keys(), ...Object.keys(manifest.files)]);
    console.log(`[Sync] ${targetFolderName}: Total unique names to process: ${allNames.size}`);

    for (const name of allNames) {
      if (isIgnored(name)) continue;

      const local = localMap.get(name);
      const remote = remoteMap.get(name);
      const inManifest = manifest.files[name];

      try {
        // --- DELETION HANDLING ---
        
        // 1. Local Deletion: Existed in manifest, now missing locally, but still exists on Drive.
        if (inManifest && !local && remote) {
          onProgress(`Deleting remote (local deletion detected): ${name}`);
          await this.deleteRemoteFile(remote.id, accessToken);
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
        const isRemoteDir = remote?.mimeType === 'application/vnd.google-apps.folder';
        const isLocalDir = local instanceof FileSystem.Directory;

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
          let subDir = local instanceof FileSystem.Directory ? local : null;
          if (!subDir && isRemoteDir) {
            onProgress(`Creating local directory: ${name}`);
            // createDirectory is synchronous in SDK 54
            subDir = localDir.createDirectory(name);
          }

          if (subDir || isRemoteDir) {
            const subDriveId = await this.syncDirectory(
              subDir ? subDir.uri : "", 
              name, 
              accessToken, 
              onProgress, 
              driveFolderId
            );
            newManifest.files[name] = { id: subDriveId, lastMtime: 0, size: 0, isDir: true };
            continue;
          }
        }

        // --- FILE SYNC ---
        // Skip Google Workspace files (Docs, Sheets, etc.)
        if (remote?.mimeType.startsWith('application/vnd.google-apps.')) continue;

        let finalId = remote?.id;
        let finalMtime = 0;
        let finalSize = 0;

        if (local instanceof FileSystem.File && remote) {
          // Both exist: check for updates
          const localMtime = (local.modificationTime || 0) / 1000;
          const remoteMtime = new Date(remote.modifiedTime!).getTime() / 1000;
          const localSize = local.size || 0;
          const remoteSize = parseInt(remote.size || '0');

          // Check if either has changed since last sync (using manifest)
          const hasLocalChanged = !inManifest || Math.abs(localMtime - inManifest.lastMtime) > 2 || localSize !== inManifest.size;
          const hasRemoteChanged = !inManifest || Math.abs(remoteMtime - inManifest.lastMtime) > 2 || remoteSize !== inManifest.size;

          if (hasLocalChanged && !hasRemoteChanged) {
            onProgress(`Uploading update: ${name}`);
            const res = await this.uploadFile(local, name, driveFolderId, accessToken, remote.id);
            finalId = res.id || remote.id;
          } else if (hasRemoteChanged && !hasLocalChanged) {
            onProgress(`Downloading update: ${name}`);
            await this.downloadFile(remote.id, local, accessToken);
          } else if (hasLocalChanged && hasRemoteChanged) {
            // Conflict (LWW)
            if (localMtime > remoteMtime) {
              onProgress(`Conflict (LWW): Uploading local version of ${name}`);
              await this.uploadFile(local, name, driveFolderId, accessToken, remote.id);
            } else {
              onProgress(`Conflict (LWW): Downloading remote version of ${name}`);
              await this.downloadFile(remote.id, local, accessToken);
            }
          }
          
          finalId = remote.id;
          finalMtime = (local.modificationTime || 0) / 1000;
          finalSize = local.size || 0;

        } else if (local instanceof FileSystem.File) {
          // Local Only (New file): Only if it's NOT in the manifest
          if (!inManifest) {
            onProgress(`Uploading new: ${name}`);
            const res = await this.uploadFile(local, name, driveFolderId, accessToken);
            finalId = res.id;
            finalMtime = (local.modificationTime || 0) / 1000;
            finalSize = local.size || 0;
          } else {
            // It was in manifest but is missing on Drive. Already handled in deletion logic.
          }

        } else if (remote) {
          // Remote Only (New file): Only if it's NOT in the manifest
          if (!inManifest) {
            onProgress(`Downloading new: ${name}`);
            // createFile is synchronous in SDK 54
            const targetFile = localDir.createFile(name, remote.mimeType || 'application/octet-stream');
            await this.downloadFile(remote.id, targetFile, accessToken);
            finalMtime = (targetFile.modificationTime || 0) / 1000;
            finalSize = targetFile.size || 0;
            finalId = remote.id;
          } else {
            // It was in manifest but is missing locally. Already handled in deletion logic.
          }
        }

        if (finalId) {
          newManifest.files[name] = { id: finalId, lastMtime: finalMtime, size: finalSize, isDir: false };
        }
      } catch (err: any) {
        console.error(`[Sync Error] Failed to sync ${name}:`, err);
        onProgress(`Error: ${name} - ${err.message}`);
        if (inManifest) newManifest.files[name] = inManifest;
      }
    }

    await this.saveManifest(localDir, newManifest);
    return driveFolderId;
  },
};
