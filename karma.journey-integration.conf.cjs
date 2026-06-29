const baseConfig = require('./karma.conf.js');

module.exports = function (config) {
  baseConfig(config, {
    browsers: ['ChromeHeadless'],
    browserNoActivityTimeout: 120000,
    files: [
      { pattern: 'firestore.rules', watched: false, served: true, included: false },
    ],
    client: {
      args: ['journeyIntegration'],
    },
  });
};
