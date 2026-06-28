const baseConfig = require('./karma.conf.js');

module.exports = function (config) {
  baseConfig(config);
  config.set({
    client: {
      jasmine: {},
      clearContext: false,
      args: ['journeyIntegration'],
    },
  });
};
