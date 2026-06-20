const { version, productName } = require('../../package.json');

module.exports = {
  appId: 'com.valorgrid.app',
  productName,
  artifactName: '${productName}-Setup-${version}-${arch}.${ext}',
  directories: {
    output: 'local/artifacts/desktop',
  },
  files: [
    'apps/desktop/main.js',
    'apps/desktop/installer/**/*',
    'apps/server/server.js',
    'apps/server/src/**/*',
    'apps/web/index.html',
    'apps/web/src/**/*',
    'assets/brand/valorgrid-logo.png',
    'assets/brand/valorgrid-logo.ico',
    'node_modules/**/*.js',
    'node_modules/**/*.node',
    'node_modules/**/*.txt',
    '!node_modules/.cache/**/*',
  ],
  extraResources: [
    {
      from: 'assets/brand/valorgrid-logo.ico',
      to: 'assets/brand/valorgrid-logo.ico',
    },
  ],
  win: {
    icon: 'assets/brand/valorgrid-logo.ico',
    signAndEditExecutable: false,
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
  },
  nsis: {
    installerIcon: 'assets/brand/valorgrid-logo.ico',
    uninstallerIcon: 'assets/brand/valorgrid-logo.ico',
    installerHeaderIcon: 'assets/brand/valorgrid-logo.ico',
    include: 'apps/desktop/installer/installer.nsh',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: productName,
  },
};