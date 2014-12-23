'use strict';

module.exports = function() {

    exports.actions = require('./actions')();
    exports.schemata = require('./schemata')();

    return exports;
  }();
