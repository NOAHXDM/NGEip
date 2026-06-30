const path = require('path');

const baseSettings = {
  basePath: '',
  frameworks: ['jasmine', '@angular-devkit/build-angular'],
  plugins: [
    require('karma-jasmine'),
    require('karma-chrome-launcher'),
    require('karma-jasmine-html-reporter'),
    require('karma-coverage'),
    require('@angular-devkit/build-angular/plugins/karma'),
  ],
  client: {
    jasmine: {},
    clearContext: false,
  },
  files: [],
  customLaunchers: {
    ChromeHeadlessNoSandbox: {
      base: 'ChromeHeadless',
      flags: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  jasmineHtmlReporter: {
    suppressAll: true,
  },
  coverageReporter: {
    dir: path.join(__dirname, './coverage/angular-eip'),
    subdir: '.',
    reporters: [
      { type: 'html' },
      { type: 'text-summary' },
    ],
  },
  reporters: ['progress', 'kjhtml'],
  browserDisconnectTimeout: 10000,
  browserDisconnectTolerance: 1,
  restartOnFileChange: true,
};

module.exports = function configureKarma(config, overrides = {}) {
  config.set({
    ...baseSettings,
    ...overrides,
    plugins: [
      ...baseSettings.plugins,
      ...(overrides.plugins ?? []),
    ],
    files: [
      ...(baseSettings.files ?? []),
      ...(overrides.files ?? []),
    ],
    reporters: [
      ...(baseSettings.reporters ?? []),
      ...(overrides.reporters ?? []),
    ],
    client: {
      ...baseSettings.client,
      ...(overrides.client ?? {}),
      jasmine: {
        ...baseSettings.client.jasmine,
        ...(overrides.client?.jasmine ?? {}),
      },
    },
  });
};
