/**
 * This ensures that a connection is made to the
 * test databases
 */
var nativeMongoConnection = require('../../lib/native-mongo-connection').get(true, function(){}),
    mongoose = require('gebo-mongoose-connection').get(true);

var fs = require('fs'),
    nconf = require('nconf'),
    path = require('path');


nconf.file({ file: 'gebo.json' });

exports.onLoad = {
    tearDown: function(callback) {
        var files = fs.readdirSync(__dirname + '/../../schemata');

        files.forEach(function(file) {
            if (require.cache[path.resolve(__dirname + '/../../schemata/' + file)]) {
              delete require.cache[path.resolve(__dirname + '/../../schemata/' + file)]
            }
        });
        callback();
    },

    'Load every file in the schemata folder': function(test) {
        test.expect(2);
        var schemata = require('../../schemata');
        test.equal(typeof schemata.gebo, 'function');
        test.equal(typeof schemata.agent, 'function');
        test.done();
    },
};

/**
 * add
 */
exports.add = {

    tearDown: function(callback) {
        var files = fs.readdirSync(__dirname + '/../../schemata');

        files.forEach(function(file) {
            if (require.cache[path.resolve(__dirname + '/../../schemata/' + file)]) {
              delete require.cache[path.resolve(__dirname + '/../../schemata/' + file)]
            }
        });
        callback();
    },

    'Add a gebo schema function': function(test) {
        test.expect(3);

        var schemata = require('../../schemata');
        test.equal(schemata.test1, undefined);

        var testSchema = require('./mocks/test1');
        schemata.add('test1', testSchema);

        test.equal(typeof schemata.test1, 'function');
        var db = new schemata.test1();
        test.equal(typeof db, 'object');

        test.done();
    },

    'Add a collection of gebo schemata': function(test) {
        test.expect(6);

        var schemata = require('../../schemata');
        test.equal(schemata.test1, undefined);
        test.equal(schemata.test2, undefined);

        var testSchemata = require('./mocks');
        schemata.add(testSchemata);

        test.equal(typeof schemata.test1, 'function');
        var db = new schemata.test1();
        test.equal(typeof db, 'object');
        test.equal(typeof schemata.test2, 'function');
        db = new schemata.test2();
        test.equal(typeof db, 'object');

        test.done();
    },

    'Throw an error if function provided has no name': function(test) {
        test.expect(2);

        var schemata = require('../../schemata');
        test.equal(schemata.test1, undefined);

        var testSchema = require('./mocks/test1');

        try {
            schemata.add(testSchema);
            test.ok(false, 'This should throw an error');
        }
        catch(err) {
            test.equal(err.message, 'This schema needs a name');
        }

        test.done();
    },
};

/**
 * remove
 */
exports.remove = {

    tearDown: function(callback) {
        var files = fs.readdirSync(__dirname + '/../../schemata');

        files.forEach(function(file) {
            if (require.cache[path.resolve(__dirname + '/../../schemata/' + file)]) {
              delete require.cache[path.resolve(__dirname + '/../../schemata/' + file)]
            }
        });
        callback();
    },

    'Remove a single action': function(test) {
        test.expect(7);

        var schemata = require('../../schemata');
        test.equal(schemata.test, undefined);

        var testSchema = require('./mocks/test1');
        schemata.add('test1', testSchema);
        schemata.add('test2', testSchema);

        test.equal(typeof schemata.test1, 'function');
        var db = new schemata.test1();
        test.equal(typeof new schemata.test1(), 'object');
        test.equal(typeof schemata.test2, 'function');
        db = new schemata.test2();
        test.equal(typeof db, 'object');

        schemata.remove('test1');
        test.equal(schemata.test1, undefined);
        test.equal(typeof schemata.test2, 'function');

        test.done();
    },
};

