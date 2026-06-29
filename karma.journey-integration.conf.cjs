const baseConfig = require('./karma.conf.js');

module.exports = function (config) {
  baseConfig(config, {
    browsers: ['ChromeHeadless'],
    browserNoActivityTimeout: 120000,
    browserDisconnectTimeout: 10000,
    browserDisconnectTolerance: 1,
    client: {
      args: ['journeyIntegration'],
    },
  });
};
