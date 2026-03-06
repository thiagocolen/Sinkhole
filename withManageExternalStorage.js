const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withManageExternalStorage(config) {
  return withAndroidManifest(config, async (config) => {
    let androidManifest = config.modResults;
    const manifest = androidManifest.manifest;
    const mainApplication = manifest.application[0];

    // 1. Ensure permissions are in the manifest
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const permissionsToAdd = [
      'android.permission.MANAGE_EXTERNAL_STORAGE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ];

    permissionsToAdd.forEach((permissionName) => {
      const hasPermission = manifest['uses-permission'].some(
        (p) => p.$['android:name'] === permissionName
      );
      if (!hasPermission) {
        manifest['uses-permission'].push({
          $: { 'android:name': permissionName },
        });
      }
    });

    // 2. Add legacy storage flag to the <application> tag
    if (!mainApplication.$) {
      mainApplication.$ = {};
    }
    mainApplication.$['android:requestLegacyExternalStorage'] = 'true';

    return config;
  });
};