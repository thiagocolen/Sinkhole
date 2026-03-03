# prompts

## ignore

* Local Development (Your PC): 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
* Expo Cloud (EAS): D6:F4:47:FF:E1:8E:C6:0B:79:10:B5:7E:93:C2:2F:74:1F:CD:24:0C

## prompt01

* user journey:
  1. open app
  2. click login button
  3. go to google choose account page
  4. choose account
  5. go to google consent page
  6. click continue
  7. a long loading screen and
  8. go to google.com page, but should return to the app
  9. and the connected/disconnected status still disconnected

* task:
  1. ask permission before change any file
  2. explain what is wrong and why
  3. explain what is the best way to fix it
  4. ask permission before fix it

## prompt02

* user journey:
  1. open app
  2. click login button
  3. get error DEVELOPER_ERROR: Follow troubleshooting instructions at <https://react-native-google-signin.github.io/docs/troubleshooting>

* task:
  1. consult the related documentation
  2. ask permission before change any file
  3. explain what is wrong and why
  4. explain what is the best way to fix it
  5. ask permission before fix it

* related documentation:
  * <https://react-native-google-signin.github.io/docs/troubleshooting#developer_error>
  * <https://react-native-google-signin.github.io/docs/setting-up/get-config-file>

### response02  

The `DEVELOPER_ERROR` is a configuration mismatch between your app and the Google Cloud/Firebase Console. I've identified several potential issues: missing `google-services.json` and `GoogleService-Info.plist` files, a mismatch between the `webClientId` in `App.tsx` and the `client_secret` file, and a possible missing SHA-1 fingerprint registration for your development build. To fix this, you should download the configuration files from your console, add them to your project root, update `app.json` to include them, verify your `WEB_CLIENT_ID` is a "Web application" type, and ensure your debug SHA-1 is registered. I'll explain this to the user now.

#### Diagnosis of `DEVELOPER_ERROR`

The `DEVELOPER_ERROR` (Code 10) indicates a configuration mismatch between your local application and the Google Cloud / Firebase Console. Based on the documentation and my analysis of your project, here is what is wrong:

1. **Missing Native Configuration Files:** Your project is missing the mandatory `google-services.json` (for Android) and `GoogleService-Info.plist` (for iOS). These files provide the native SDK with the project credentials it needs.
2. **Plugin Configuration:** In `app.json`, the `@react-native-google-signin/google-signin` plugin is listed but not configured with the paths to the required credential files.
3. **Client ID Mismatch:** There is a discrepancy between the `WEB_CLIENT_ID` in `App.tsx` (`...k33dp239dl...`) and the one found in the `client_secret_...json` file (`...pusv95fln2...`). `GoogleSignin.configure` **must** use a Client ID of type **"Web application"**, even on Android/iOS.
4. **SHA-1 Fingerprint:** For Android, the SHA-1 of your signing key (the debug key used by the Expo Development Client) must be registered in the Google Cloud Console. Without this, Google will reject the sign-in request with `DEVELOPER_ERROR`.

#### Proposed Fix Strategy

The best way to fix this is to align your project with the official configuration requirements:

1. **Download Credentials:** Obtain the `google-services.json` and `GoogleService-Info.plist` from your Firebase or Google Cloud Console.
2. **Register SHA-1:** Ensure the SHA-1 fingerprint of your development build is registered in the console under the Android Client ID for `com.tsouza.gdrivesync`.
3. **Update `app.json`:** Configure the Expo plugin to link these files during prebuild.
4. **Verify `webClientId`:** Confirm which of your Client IDs is the "Web application" type and use it in `App.tsx`.

**May I have permission to update your `app.json` and `App.tsx` once you provide the necessary configuration files?**

*Note: If you have the `google-services.json` or `GoogleService-Info.plist` files available, please let me know or place them in the root directory so I can proceed with the configuration.*

## prompt03

* ignore all previous instructions
* do nothing, ask permission before change anything
* read this terminal output:

  ```powershell
    ★ eas-cli@18.0.6 is now available.
    To upgrade, run:
    npm install -g eas-cli
    Proceeding with outdated version.

    √ Select platform » Android
    √ Which build profile do you want to configure? » development
    ✔ Using build profile: development
    Android Credentials   
    Project                 gd-api-consumer-app
    Application Identifier  com.tsouza.gdrivesync

    Push Notifications (FCM Legacy)
      None assigned yet

    Push Notifications (FCM V1): Google Service Account Key For FCM V1
      None assigned yet

    Submissions: Google Service Account Key for Play Store Submissions
      None assigned yet

    Configuration: Build Credentials wAbLnx3_2a (Default)
    Keystore
    Type                JKS
    Key Alias           34a956967e810547f0be7e401a31b8f6
    MD5 Fingerprint     14:16:AD:40:8A:A8:87:18:D6:99:1D:E4:9A:02:96:69
    SHA1 Fingerprint    D6:F4:47:FF:E1:8E:C6:0B:79:10:B5:7E:93:C2:2F:74:1F:CD:24:0C
    SHA256 Fingerprint  3B:EB:DD:CA:F6:45:37:55:59:1B:E2:60:BC:46:9F:2C:78:D8:17:86:28:6D:89:7B

    Configuration: Build Credentials GtUP8-Ofk4
    Keystore
      None assigned yet

    Configuration: Build Credentials XFxsifl7Zo
    Keystore
      None assigned yet

    ? What do you want to do? » - Use arrow-keys. Return to submit.
        Keystore: Manage everything needed to build your project
        Google Service Account
        Push Notifications (Legacy): Manage your FCM (Legacy) API Key
        credentials.json: Upload/Download credentials between EAS servers and your local json 
        Go back
    >   Exit
  ```

* information:
  1. stack: expo, react native and google authentication API,
  
* task:
  1. task: explain what is each option from the terminal output
  2. question: which is the better option?

## prompt04

* ignore all previous instructions
* do nothing, ask permission before change anything
* look at it:

  ```powershell

    overrideMethod @ installHook.js:1
    logNotImplementedError @ D:\_code-projects\gd-api-consumer-app\node_modules\@react-native-google-signin\google-signin\lib\module\signIn\GoogleSignin.web.js:6
    hasPlayServices @ D:\_code-projects\gd-api-consumer-app\node_modules\@react-native-google-signin\google-signin\lib\module\signIn\GoogleSignin.web.js:22
    handleLogin @ D:\_code-projects\gd-api-consumer-app\App.tsx:112
    onClick @ D:\_code-projects\gd-api-consumer-app\node_modules\react-native-web\dist\modules\usePressEvents\PressResponder.js:314
    executeDispatch @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:16368
    runWithFiberInDEV @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:1519
    processDispatchQueue @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:16418
    (anonymous) @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:17016
    batchedUpdates$1 @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:3262
    dispatchEventForPluginEventSystem @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:16572
    dispatchEvent @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:20658
    dispatchDiscreteEvent @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:20626
    <button>
    exports.createElement @ D:\_code-projects\gd-api-consumer-app\node_modules\react\cjs\react.development.js:1033
    createElement @ D:\_code-projects\gd-api-consumer-app\node_modules\react-native-web\dist\exports\createElement\index.js:24
    View @ D:\_code-projects\gd-api-consumer-app\node_modules\react-native-web\dist\exports\View\index.js:111
    react-stack-bottom-frame @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:23863
    renderWithHooks @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:5529
    updateForwardRef @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:8645
    beginWork @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:10861
    runWithFiberInDEV @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:1519
    performUnitOfWork @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:15132
    workLoopSync @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:14956
    renderRootSync @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:14936
    performWorkOnRoot @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:14419
    performWorkOnRootViaSchedulerTask @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:16216
    performWorkUntilDeadline @ D:\_code-projects\gd-api-consumer-app\node_modules\scheduler\cjs\scheduler.development.js:45
    <View>
    exports.createElement @ D:\_code-projects\gd-api-consumer-app\node_modules\react\cjs\react.development.js:1033
    TouchableOpacity @ D:\_code-projects\gd-api-consumer-app\node_modules\react-native-web\dist\exports\TouchableOpacity\index.js:90
    react-stack-bottom-frame @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:23863
    renderWithHooks @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:5529
    updateForwardRef @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:8645
    beginWork @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:10861
    runWithFiberInDEV @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:1522
    performUnitOfWork @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:15132
    workLoopSync @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:14956
    renderRootSync @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:14936
    performWorkOnRoot @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:14419
    performWorkOnRootViaSchedulerTask @ D:\_code-projects\gd-api-consumer-app\node_modules\react-dom\cjs\react-dom-client.development.js:16216
    performWorkUntilDeadline @ D:\_code-projects\gd-api-consumer-app\node_modules\scheduler\cjs\scheduler.development.js:45Understand this warning
    D:\_code-projects\gd-api-consumer-app\App.tsx:130 Login error details: {
      "code": "PLAY_SERVICES_NOT_AVAILABLE"
    }
    installHook.js:1 Full Login Error Object: Error: RNGoogleSignIn: you are calling a not-implemented method on web platform. Web support is only available to sponsors. 
    If you are a sponsor, please follow the installation instructions carefully to obtain the implementation.
        at throwNotImplementedError (D:\_code-projects\gd-api-consumer-app\node_modules\@react-native-google-signin\google-signin\lib\module\signIn\GoogleSignin.web.js:9:13)
        at Object.signIn (D:\_code-projects\gd-api-consumer-app\node_modules\@react-native-google-signin\google-signin\lib\module\signIn\GoogleSignin.web.js:17:3)
        at handleLogin (D:\_code-projects\gd-api-consumer-app\App.tsx:114:43)
  ```
  
* task:
  1. explain what is wrong
  2. the build and login should work on android device and web browser
