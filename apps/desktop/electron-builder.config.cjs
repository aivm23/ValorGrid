const { version, productName } = require('../../package.json');

module.exports = {
  appId: 'com.valorgrid.app',
  productName,
  artifactName: '${productName}-Setup-${version}-${arch}.${ext}',
  directories: {
    output: '../../local/artifacts/desktop',
  },
  files: [
    'main.js',
    'installer/**/*',
    '../server/**/*',
    '../../apps/web/**/*',
    '../../assets/brand/valorgrid-logo.png',
    '../../assets/brand/valorgrid-logo.ico',
    '../../apps/server/node_modules/**/*',
  ],
  extraResources: [
    {
      from: '../../assets/brand/valorgrid-logo.ico',
      to: 'assets/brand/valorgrid-logo.ico',
    },
  ],
  win: {
    icon: '../../assets/brand/valorgrid-logo.ico',
    signAndEditExecutable: false,
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
  },
  nsis: {
    installerIcon: '../../assets/brand/valorgrid-logo.ico',
    uninstallerIcon: '../../assets/brand/valorgrid-logo.ico',
    installerHeaderIcon: '../../assets/brand/valorgrid-logo.ico',
    include: 'installer/installer.nsh',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: productName,
  },
};