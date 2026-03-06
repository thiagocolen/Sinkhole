<p align="center">
  <img src="./assets/Gemini_Generated_Image_tnrkectnrkectnrk.png" width="600" height="600" alt="Sinkhole Logo" />
</p>

# Sinkhole

**Sinkhole** is a lightweight, secure, and privacy-focused synchronization bridge between your Android device and Google Drive. Built with React Native and Expo, it provides a seamless way to keep local folders in sync with the cloud using a manifest-based tracking system.

## 🚀 The Core Idea

The name "Sinkhole" represents a one-way path that everything eventually falls into—in this case, your data securely landing in your private cloud storage. Unlike complex sync tools, Sinkhole focuses on a "local-first" approach, ensuring your files are always accessible offline while maintaining a perfect mirror on Google Drive.

## 💎 Free Obsidian Sync Alternative

One of the primary use cases for Sinkhole is providing a **free alternative to Obsidian Sync**.

Obsidian users on Android often struggle to sync their vaults with Google Drive because the official Google Drive app does not "mount" folders in a way that Obsidian can easily read. Sinkhole bridges this gap:

1. **Sync your Vault:** Point Sinkhole to your Obsidian Vault folder on your Android device.
2. **Mirror to Cloud:** Sinkhole mirrors your entire vault (including configuration and plugins) to a dedicated `SinkholeFolder` on Google Drive.
3. **Cross-Platform:** Since it's on Google Drive, you can access the same vault on your PC/Mac using the Google Drive Desktop client, effectively achieving a full sync loop for free.

## 🛠 How It Works

### Storage Access Framework (SAF)

Sinkhole uses Android's **Storage Access Framework**. This means the app only has access to the specific folder you explicitly grant permission to. It doesn't need broad "Manage External Storage" permissions, keeping your other data private.

### Two-Way Synchronization

The sync engine uses a `.sync-manifest.json` file to track the state of your files.

* **New Files:** Detected locally or remotely and transferred accordingly.
* **Modifications:** Sinkhole uses a **Last Write Wins (LWW)** strategy based on modification timestamps to resolve conflicts.
* **Deletions:** If you delete a file locally, Sinkhole identifies it via the manifest and removes it from Google Drive (and vice versa).

### Secure Authentication

The app uses **Google OAuth 2.0** via the `react-native-google-signin` library. Your credentials never leave your device; the app only requests the minimum "Drive" scope required to manage its own folder.

## ✨ Features

* **Manifest-based Tracking:** Accurate synchronization that understands deletions and moves.
* **Theme Support:** Toggle between Light, Dark, and System modes.
* **Detailed Logs:** Real-time visibility into the synchronization process.
* **Landscape Optimization:** A responsive UI that works great on tablets and foldable devices.
* **Battery Efficient:** No background services; sync only when you want to.

---

## 📖 User Guide

Follow these steps to get started with Sinkhole:

1. **Install the app:** Download and install the Sinkhole APK on your Android device.
2. **Open the app:** Launch Sinkhole from your app drawer.
3. **Choose a folder:** Select an existing local Android folder you want to sync, or create a new one.
4. **Sync Now:** Click the **SYNC NOW** button to start the initial synchronization.
5. **Check Google Drive:** Open your Google Drive (web or mobile) and look for a new folder at the root called `Sinkhole`.
6. **Enjoy seamless sync:** You now have a synced folder between your Android device and any desktop device running the Google Drive application.

---

## 🔑 Personal API Configuration

If you are building this app yourself or using a fork, you **must** use your own Google Drive and Google API credentials. Because Sinkhole is a private tool, it is not "verified" by Google for public use.

### 1. Create a Google Cloud Project

* Go to the [Google Cloud Console](https://console.cloud.google.com/).
* Create a new project (e.g., "My Sinkhole").

### 2. Enable Google Drive API

* In the Library section, search for **Google Drive API** and click **Enable**.

### 3. Configure OAuth Consent Screen

* Set the User Type to **External**.
* Add your own email address as a **Test User** (this is critical, as the app will be in "Testing" mode).
* Add the `.../auth/drive` scope to allow the app to manage files.

### 4. Generate Android OAuth Client ID

* Go to **Credentials** -> **Create Credentials** -> **OAuth client ID**.
* Select **Android** as the Application type.
* Enter your package name (e.g., `com.yourname.sinkhole`).
* Provide your **SHA-1 certificate fingerprint**.
  * For debug: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey`
  * For release: Use the SHA-1 from your production keystore.

### 5. Download google-services.json

* After creating the Android Client ID, download the `google-services.json` file.
* Place it in the root of the project directory.

---

## 👨‍💻 Developer Guide

If you want to contribute or build the APK yourself, follow these steps.

### Prerequisites

1. **Node.js:** Install the latest LTS version.
2. **Java SDK (JDK):** **OpenJDK 17** is required for React Native 0.81+.
    * **Recommendation:** Use [Microsoft Build of OpenJDK 17](https://learn.microsoft.com/en-us/java/openjdk/download) for Windows.
    * **Environment Variable:** Ensure `JAVA_HOME` is set to your JDK installation path and `%JAVA_HOME%\bin` is in your `Path`.
3. **Android Studio:** Required for the Android SDK, NDK, and Emulator.

### Setup

1. **Clone the Repository:**

    ```bash
    git clone https://github.com/your-username/sinkhole.git
    cd sinkhole
    ```

2. **Install Dependencies:**

    ```bash
    npm install
    ```

3. **Google Services Configuration:**
    * Go to the [Google Cloud Console](https://console.cloud.google.com/).
    * Create a new project.
    * Enable the **Google Drive API**.
    * Configure the **OAuth Consent Screen**.
    * Create an **Android OAuth Client ID** (using your debug/release SHA-1 certificate).
    * Download the `google-services.json` and place it in the project root (refer to `google-services.json.example`).

### Building the APK

To generate a local build for your Android device:

**Debug Build (Runs on device/emulator with Dev Tools):**

```bash
npx expo run:android
```

**Release APK (Optimized, standalone file):**

```bash
npm run build:apk
```

*The resulting APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.*

---

## ⚖️ License

This project is private and intended for personal use and education. Check `package.json` for dependency licenses.
