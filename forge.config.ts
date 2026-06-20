import type { ForgeConfig } from '@electron-forge/shared-types';

import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { VitePlugin } from '@electron-forge/plugin-vite';

// DMG 需要 appdmg 原生模块，CI 中不稳定，通过环境变量控制
// 本地构建 DMG: ENABLE_DMG=1 npm run make
const enableDmg = process.env.ENABLE_DMG === '1';

const makers: any[] = [
  {
    name: '@glockx/electron-forge-maker-nsis',
    config: {
      getAppBuilderConfig: () => ({
        publish: null,
        nsis: {
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          artifactName: '${productName} Setup ${version} ${arch}.${ext}'
        }
      })
    }
  },
  new MakerZIP({}, ['darwin']),
  new MakerDeb({
    options: {
      name: 'brainhole',
      productName: 'Brainhole',
    },
  }),
];

if (enableDmg) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MakerDMG } = require('@electron-forge/maker-dmg');
  makers.push(new MakerDMG({ name: 'Brainhole' }));
}

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Brainhole',
    executableName: 'brainhole',
    asar: {
      unpack: '{**/*.node,**/node_modules/pdf-parse/**/*}',
    },
    icon: './assets/icon',
    extraResource: [
      './funasr',
      './graphrag',
      './mineru'
    ]
  },
  rebuildConfig: {},
  makers,
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.config.ts',
        },
      ],
    }),
  ],
};

export default config;