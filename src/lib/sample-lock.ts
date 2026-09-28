/**
 * 内置示例 package-lock.json（lockfileVersion 3）
 * 特意覆盖：MIT/Apache/CC-BY 宽松项、GPL/AGPL 传递依赖、LGPL 直接依赖、
 * GPL 开发依赖、未知/专有许可、同包多版本、可选依赖、SPDX OR 表达式。
 */
const sampleLock = {
  name: 'shipment-app',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {
      name: 'shipment-app',
      version: '1.0.0',
      dependencies: {
        react: '^18.3.1',
        express: '^4.19.2',
        'data-pipeline': '^2.1.0',
        'pdf-utils': '^1.4.0',
        'webfont-pack': '^6.5.2',
        'vendor-sdk': '^2.0.0',
      },
      devDependencies: {
        'gulp-gpl-plugin': '^3.2.0',
      },
    },
    'node_modules/react': {
      version: '18.3.1',
      license: 'MIT',
      dependencies: { 'loose-envify': '^1.1.0' },
    },
    'node_modules/loose-envify': {
      version: '1.4.0',
      license: 'MIT',
      dependencies: { 'js-tokens': '^3.0.0 || ^4.0.0' },
    },
    'node_modules/js-tokens': {
      version: '4.0.0',
      licenses: [{ type: 'MIT', url: 'https://github.com/lydell/js-tokens' }],
    },
    'node_modules/express': {
      version: '4.19.2',
      license: 'MIT',
      dependencies: { 'icon-lib': '^2.4.0' },
    },
    'node_modules/icon-lib': {
      version: '2.4.0',
      license: 'MIT',
    },
    'node_modules/data-pipeline': {
      version: '2.1.0',
      license: 'Apache-2.0',
      dependencies: {
        'legacy-toolkit': '^0.9.3',
        'agpl-queue': '^1.2.0',
        'mystery-lib': '^0.3.1',
        'icon-lib': '^1.9.0',
        'binary-blob': '^0.0.7',
      },
      optionalDependencies: {
        'fast-native': '^0.4.2',
      },
    },
    'node_modules/data-pipeline/node_modules/icon-lib': {
      version: '1.9.0',
      license: 'MIT',
    },
    'node_modules/legacy-toolkit': {
      version: '0.9.3',
      license: 'GPL-3.0-only',
    },
    'node_modules/agpl-queue': {
      version: '1.2.0',
      license: 'AGPL-3.0-only',
    },
    'node_modules/mystery-lib': {
      version: '0.3.1',
      // 未声明 license —— 模拟无法识别许可证的包
    },
    'node_modules/binary-blob': {
      version: '0.0.7',
      license: 'SEE LICENSE IN LICENSE',
    },
    'node_modules/fast-native': {
      version: '0.4.2',
      optional: true,
    },
    'node_modules/pdf-utils': {
      version: '1.4.0',
      license: { type: 'LGPL-3.0-only' },
      dependencies: { 'spdx-multi': '^1.0.0' },
    },
    'node_modules/spdx-multi': {
      version: '1.0.0',
      license: '(MIT OR GPL-3.0-only)',
    },
    'node_modules/webfont-pack': {
      version: '6.5.2',
      license: 'CC-BY-4.0',
      dependencies: { 'share-icons': '^1.1.0' },
    },
    'node_modules/share-icons': {
      version: '1.1.0',
      license: 'CC-BY-SA-4.0',
    },
    'node_modules/vendor-sdk': {
      version: '2.0.0',
      license: 'UNLICENSED',
    },
    'node_modules/gulp-gpl-plugin': {
      version: '3.2.0',
      license: 'GPL-2.0-only',
      dev: true,
    },
  },
};

export const SAMPLE_LOCK_TEXT = JSON.stringify(sampleLock, null, 2);
