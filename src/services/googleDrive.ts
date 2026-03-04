import * as FileSystem from 'expo-file-system';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

/**
 * Service to handle Google Drive API interactions.
 */
export const GoogleDriveService = {
  /**
   * Find a folder by name or create it if it doesn't exist.
   */
  async findOrCreateFolder(folderName: string, accessToken: string): Promise<string> {
    const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await fetch(`${DRIVE_API_URL}?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Create the folder if not found
    const createResponse = await fetch(DRIVE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    const folder = await createResponse.json();
    if (!folder.id) throw new Error(`Failed to create folder: ${JSON.stringify(folder)}`);
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

    const data = await response.json();
    return data.files || [];
  },

  /**
   * Upload a file to a specific Google Drive folder using Multipart upload.
   */
  async uploadFile(
    localUri: string,
    fileName: string,
    parentFolderId: string,
    accessToken: string,
    existingFileId?: string
  ): Promise<any> {
    const file = new FileSystem.File(localUri);
    if (!file.exists) throw new Error(`File does not exist: ${localUri}`);

    // Read file content as base64 using the new API
    const fileBase64 = await file.base64();

    const metadata: any = {
      name: fileName,
    };
    if (!existingFileId && parentFolderId) {
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
      ? `${UPLOAD_API_URL}/${existingFileId}?uploadType=multipart${parentFolderId ? `&addParents=${parentFolderId}` : ''}`
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
      console.error('[Upload Error] Details:', JSON.stringify(result, null, 2));
      throw new Error(`Upload failed: ${JSON.stringify(result)}`);
    }
    return result;
  },

  /**
   * Download a file from Google Drive to a local URI.
   */
  async downloadFile(fileId: string, localUri: string, accessToken: string): Promise<void> {
    const url = `${DRIVE_API_URL}/${fileId}?alt=media`;
    console.log(`[Download] Fetching ${fileId} to ${localUri}`);
    try {
      // Workaround for content:// URIs: download to memory and write as base64
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = this.arrayBufferToBase64(buffer);
      
      const file = new FileSystem.File(localUri);
      file.write(base64, {
        encoding: 'base64',
      });
    } catch (e) {
      console.error(`[Download Error] Failed to download ${fileId}:`, e);
      throw e;
    }
  },

  /**
   * Helper to convert ArrayBuffer to base64.
   */
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // Using a reliable way to encode base64 in React Native/Expo
    // Note: btoa might not handle large buffers well, but for standard markdown/small files it's okay.
    // For very large files, a more robust chunked approach would be needed.
    return btoa(binary);
  },

  /**
   * Scan local directory and sync with Drive.
   */
  async syncDirectory(
    directoryUri: string,
    targetFolderName: string,
    accessToken: string,
    onProgress: (message: string) => void
  ): Promise<void> {
    onProgress('Checking target folder on Drive...');
    const driveFolderId = await this.findOrCreateFolder(targetFolderName, accessToken);

    onProgress('Listing remote files...');
    const remoteFiles = await this.listFilesInFolder(driveFolderId, accessToken);
    const remoteFileMap = new Map(remoteFiles.map((f) => [f.name, f]));

    onProgress('Scanning local directory...');
    const directory = new FileSystem.Directory(directoryUri);
    const localEntries = directory.list();
    
    const localFileMap = new Map<string, FileSystem.File>();
    for (const entry of localEntries) {
      if (!(entry instanceof FileSystem.Directory)) {
        localFileMap.set(entry.name, entry as FileSystem.File);
      }
    }

    const allFileNames = new Set([...localFileMap.keys(), ...remoteFileMap.keys()]);

    for (const fileName of allFileNames) {
      const localFile = localFileMap.get(fileName);
      const remoteFile = remoteFileMap.get(fileName);

      // Skip remote folders and Google Workspace files (they need export, not download)
      if (remoteFile) {
        if (remoteFile.mimeType === 'application/vnd.google-apps.folder') {
          onProgress(`Skipping folder ${fileName}...`);
          continue;
        }
        if (remoteFile.mimeType.startsWith('application/vnd.google-apps.')) {
          onProgress(`Skipping Google Workspace file ${fileName} (Not supported yet)...`);
          continue;
        }
      }

      if (localFile && remoteFile) {
        // Bi-directional sync: compare modification times using modern File API
        // Convert local milliseconds to seconds to match remoteMtime unit
        const localMtime = (localFile.modificationTime || 0) / 1000;
        const remoteMtime = new Date(remoteFile.modifiedTime!).getTime() / 1000;

        // Use 2s tolerance for timestamp comparison
        if (localMtime > remoteMtime + 2) {
          onProgress(`Updating ${fileName} on Drive (Local is newer)...`);
          await this.uploadFile(localFile.uri, fileName, driveFolderId, accessToken, remoteFile.id);
        } else if (remoteMtime > localMtime + 2) {
          onProgress(`Downloading ${fileName} from Drive (Remote is newer)...`);
          await this.downloadFile(remoteFile.id, localFile.uri, accessToken);
        } else {
          onProgress(`Skipping ${fileName} (Up to date)`);
        }
      } else if (localFile) {
        // Only local: Upload to Drive
        onProgress(`Uploading new file ${fileName} to Drive...`);
        await this.uploadFile(localFile.uri, fileName, driveFolderId, accessToken);
      } else if (remoteFile) {
        // Only remote: Download to Local
        onProgress(`Downloading new file ${fileName} from Drive...`);
        // Ensure URI is correctly constructed
        const localUri = directoryUri.endsWith('/') ? `${directoryUri}${fileName}` : `${directoryUri}/${fileName}`;
        await this.downloadFile(remoteFile.id, localUri, accessToken);
      }
    }

    onProgress('Sync completed successfully!');
  },
};
