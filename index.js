'use strict';

module.exports = function() {

    exports.actions = require('./actions')();
    exports.schemata = require('./schemata');
    exports.nativeMongoConnection = require('./lib/native-mongo-connection');

    return exports;
  }();
