'use strict';

const config = require('./config');
const createApp = require('./app');
const migrate = require('../scripts/migrate');

migrate()
  .then(() => {
    createApp().listen(config.port, () => {
      console.log(`Healthville tracker running at ${config.appUrl} (port ${config.port})`);
    });
  })
  .catch((err) => {
    console.error('Could not start:', err);
    process.exit(1);
  });
