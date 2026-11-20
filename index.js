'use strict';

const app = require('./server/index.js');
if (typeof app.startServer === 'function') {
  app.startServer();
}
