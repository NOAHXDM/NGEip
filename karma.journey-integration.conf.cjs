const baseConfig = require('./karma.conf.js');

module.exports = function (config) {
  baseConfig(config, {
    browsers: ['ChromeHeadlessNoSandbox'],
    browserNoActivityTimeout: 120000,
    failOnEmptyTestSuite: true,
    files: [
      { pattern: 'firestore.rules', watched: false, served: true, included: false },
    ],
    client: {
      args: ['journeyIntegration'],
    },
  });
};
