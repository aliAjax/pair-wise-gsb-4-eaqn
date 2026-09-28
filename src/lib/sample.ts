/**
 * 内置示例：一份虚构的 package-lock.json（v3 扁平格式）。
 * 特意覆盖：闭源下的 GPL/AGPL 阻断、未知许可证、弱 Copyleft 复核、
 * 直接/传递依赖、dev-only、同包多版本路径、optional 二进制等场景。
 */
export const SAMPLE_LOCK = JSON.stringify(
  {
    name: 'closed-source-app',
    version: '2.1.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'closed-source-app',
        version: '2.1.0',
        dependencies: {
          express: '^4.19.2',
          'internal-accounts': '^1.4.0',
          'pdf-renderer': '^0.9.3',
          'native-crypto': '^3.0.1',
          debug: '^4.3.5',
          'dual-icons': '^2.4.0',
        },
        optionalDependencies: {
          sharp: '^0.33.4',
        },
        devDependencies: {
          'mock-server': '^1.2.0',
        },
      },
      'node_modules/express': {
        version: '4.19.2',
        resolved: 'https://registry.npmjs.org/express/-/express-4.19.2.tgz',
        license: 'MIT',
        dependencies: { debug: '^4.3.5', lodash: '^4.17.21' },
      },
      'node_modules/debug': {
        version: '4.3.5',
        resolved: 'https://registry.npmjs.org/debug/-/debug-4.3.5.tgz',
        license: 'MIT',
      },
      'node_modules/internal-accounts': {
        version: '1.4.0',
        license: 'UNLICENSED',
      },
      'node_modules/pdf-renderer': {
        version: '0.9.3',
        license: 'AGPL-3.0-only',
        dependencies: { 'font-pack': '^1.0.0' },
      },
      'node_modules/font-pack': {
        version: '1.0.0',
        license: 'OFL-1.1',
      },
      'node_modules/native-crypto': {
        version: '3.0.1',
        license: 'GPL-2.0-only',
        dependencies: { 'libgpl-helper': '^2.0.0', 'mp-utils': '^1.2.0' },
      },
      'node_modules/libgpl-helper': {
        version: '2.0.0',
        license: 'GPL-3.0-or-later WITH Classpath-exception-2.0',
      },
      'node_modules/mp-utils': {
        version: '1.2.0',
        license: 'MPL-2.0',
      },
      'node_modules/mock-server': {
        version: '1.2.0',
        dev: true,
        license: 'GPL-3.0-only',
        dependencies: { lodash: '^3.10.1' },
      },
      // lodash 旧版本嵌在 mock-server 下
      'node_modules/mock-server/node_modules/lodash': {
        version: '3.10.1',
        license: 'MIT',
      },
      'node_modules/lodash': {
        version: '4.17.21',
        license: 'MIT',
      },
      'node_modules/dual-icons': {
        version: '2.4.0',
        license: '(MIT OR GPL-2.0-only)',
      },
      'node_modules/legacy-magic': {
        version: '0.1.7',
      },
      'node_modules/sharp': {
        version: '0.33.4',
        license: 'Apache-2.0',
        optionalDependencies: { 'sharp-win32-x64': '^0.33.4' },
      },
      'node_modules/sharp-win32-x64': {
        version: '0.33.4',
        license: 'Apache-2.0',
        optional: true,
        os: ['win32'],
      },
    },
  },
  null,
  2,
);

export const SAMPLE_NAME = 'sample-package-lock.json';
