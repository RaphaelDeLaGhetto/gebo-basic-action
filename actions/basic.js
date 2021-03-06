'use strict';

var mongo = require('mongodb'),
    GridStore = mongo.GridStore,
    utils = require('../lib/utils'),
    generalUtils = require('gebo-utils'),
    q = require('q'),
    fs = require('fs-extra'),
    nconf = require('nconf'),
    winston = require('winston');

module.exports = function() {

    // Logging stuff
    nconf.file({ file: './gebo.json' });
    var logLevel = nconf.get('logLevel');
    var logger = new (winston.Logger)({ transports: [ new (winston.transports.Console)({ colorize: true }) ] });

    var agentDb = require('../schemata/agent')(),
        geboDb = require('../schemata/gebo')(),
        nativeConnection = require('../lib/native-mongo-connection');

    /**
     * Get the collection specified in the verified object parameter
     *
     * @param Object
     *
     * @return promise
     */
    var _getCollection = function(verified) {
        var deferred = q.defer();
        if (verified.admin || verified.read || verified.write || verified.execute) { 
          nativeConnection.get(function(conn) {
                conn.collection(verified.resource, function(err, collection) {
                    if (err) {
                      deferred.resolve({ error: err });
                    }
                    else {
                      deferred.resolve(collection);
                    }
                  });
            });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise;
      };
    exports.getCollection = _getCollection;
    
    /**
     * Save JSON to the given collection 
     *
     * @param Object
     * @param Object
     *
     * @return promise
     */
    var _save = function(verified, message) {
        var deferred = q.defer();

        if (verified.admin || verified.write) { 
          _getCollection(verified).
              then(function(collection) {
                    utils.saveFileToDb(message.file, collection).
                       then(function(file) {
                            if (message.content && message.content.data) {
                              if (message.content.data._id) {
                                message.content.data._id = new mongo.ObjectID(message.content.data._id + '');
                              }

                              // If there's a file attached to this message,
                              // link it to the data being saved
                              if (file) {
                                message.content.data.fileId = file.fileId;
                              }

                              collection.save(message.content.data, { safe: true },
                                      function(err, ack) {
                                          if (err) {
                                            deferred.resolve({ error: err });
                                          }
                                          else {
                                            deferred.resolve(ack);
                                          }
                                        });
                            }
                            else {
                              if (file) {
                                deferred.resolve(file.fileId);
                              }
                              else {
                                deferred.resolve();
                              }
                            }
                          }).
                        catch(function(err) {
                            deferred.resolve({ error: err });
                          });
                    }).
                  catch(function(err) {
                      deferred.resolve({ error: err });
                    });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise;
      };
    exports.save = _save;

    /**
     * Copy JSON from a user's profile
     *
     * @param Object
     * @param Object
     */
    var _cp = function(verified, message) {
        var deferred = q.defer();

        if (verified.admin || verified.read) { 
          _getCollection(verified).
              then(function(collection) {

                    // Make sure an ID was specified 
                    if (message.content && message.content.id) {
                      var id = _transformId(message.content.id);

                      // DEFAULT_ROOT_CONNECTION is expected to equal 'fs'
                      if (collection.collectionName === GridStore.DEFAULT_ROOT_COLLECTION) {

                        var store = new GridStore(collection.db, id, 'r');
                        store.open(function(err, file) {
                            if (err) {
                              deferred.resolve({ error: err });
                            }
                            else {
                              deferred.resolve(file);
                            }
                          });
                      }
                      else {
                        collection.findOne({ '_id': id }, function(err, doc) {
                            if (err) {
                              deferred.resolve({ error: err });
                            }
                            else {
                              deferred.resolve(doc);
                            }                           
                          });
                      }
                    }
                    else {
                      deferred.reject('You need to specify the ID of the document you want to copy');
                    }
                }).
              catch(function(err) {
                    deferred.resolve({ error: err });
                });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise;
      };
    exports.cp = _cp;

    /**
     * Remove a doc from a user's profile
     *
     * @param Object
     * @param Object
     */
    var _rm = function(verified, message) {
        var deferred = q.defer();

        if (verified.admin || verified.write) { 
          _getCollection(verified).
              then(function(collection) {
                      // The requesting agent may only want to delete a file
                      // from GridStore.
                      // If this is the case, DEFAULT_ROOT_CONNECTION is expected to equal 'fs'
                      if (collection.collectionName === GridStore.DEFAULT_ROOT_COLLECTION) {
                        new GridStore(collection.db, new mongo.ObjectID(message.content.id), 'r').open(function(err, gridStore) {
                           if (err) {
                             deferred.resolve({ error: err });
                           }
                           gridStore.unlink(function(err, results) {
                               if (err) {
                                 deferred.resolve({ error: err });
                               }
                               else {
                                 deferred.resolve(results);
                               }
                             });
                          });
                      }
                      else {
                        // Does this collection exist?
                        collection.count(function(err, count) {
                            if (count === 0) {
                              deferred.resolve({ error: 'Collection: ' + verified.resource + ' does not exist' });
                            }
                            else {
                              var id = message.content.id;
                              if (typeof id === 'string') {
                                id = new mongo.ObjectID(message.content.id);
                              }
  
                              // Ugh, this has to be done so that any files attached
                              // to the document will be removed too
                              collection.findOne({ '_id': id }, function(err, doc) {
                                  if (err) {
                                    deferred.resolve({ error: err });
                                  }
                                  else {
                                    collection.remove({ _id: id },
                                        function(err, ack) {
                                            if (err || ack === 0) {
                                              deferred.resolve({ error: 'Could not delete document: ' + message.content.id });
                                            }
                                            else {
                                              // Check for an attached file.
                                              // Remove it from the database
                                              if (doc.fileId) {
                                                  new GridStore(collection.db, doc.fileId, 'r').open(function(err, gridStore) {
                                                      if (err) {
                                                        deferred.resolve({ error: err });
                                                      }
                                                      gridStore.unlink(function(err, results) {
                                                          if (err) {
                                                            deferred.resolve({ error: err });
                                                          }
                                                          else {
                                                            deferred.resolve(results);
                                                          }
                                                        });
                                                  });
                                              }
                                              else {
                                                deferred.resolve();
                                              }
                                            }
                                      });
                                  }
                                });
  
                            }
                          });
                      }
                    }).
                  catch(function(err) {
                        deferred.resolve({ error: err });
                    });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
 
        return deferred.promise;
      };
    exports.rm = _rm;

    /**
     * Remove a collection from the user's profile
     *
     * @param Object
     *
     * @return promise
     */
    var _rmdir = function(verified) {
        var deferred = q.defer();

        if (verified.admin || verified.execute) { 
          _getCollection(verified).
              then(function(collection) {
                      // Does this collection exist?
                      collection.count(function(err, count) {
                          if (count === 0) {
                            deferred.resolve({ error: 'Collection: ' + verified.resource + ' does not exist' });
                          }
                          else {
                            collection.drop(
                                function(err, ack) {
                                    if (err || ack === 0) {
                                      deferred.resolve({ error: 'Could not delete collection: ' + verified.resource });
                                    }
                                    else {
                                      deferred.resolve();
                                    }
                                  });
                          }
                        });
                    }).
              catch(function(err) {
                    deferred.resolve({ error: err });
                });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise;
      };
    exports.rmdir = _rmdir;

    /**
     * Return a list of documents contained in the app's collection
     *
     * @param Object
     * @param Object
     *
     * @return promise
     */
    var _ls = function(verified, message) {
        var deferred = q.defer();
        if (verified.admin || verified.read) { 
          _getCollection(verified).
              then(function(collection) { 

                    /**
                     * Get search parameters
                     */
                    var criteria = {};
                    if (message && message.content.criteria) {
                      criteria = message.content.criteria;
                      Object.keys(criteria).forEach(function(key) {
                          criteria[key] = _transformId(criteria[key]);
                      });
                    }

                    var fields = ['name', '_id'];
                    if (message && message.content.fields) {
                      fields = message.content.fields;
                    }

                    var cursor = collection.find(criteria, fields);

                    // Were any options set?
                    if (message && message.content.options) {

                      if (message.content.options.sort) {
                        cursor = cursor.sort(message.content.options.sort);
                      }
 
                      if(message.content.options.skip) {
                        cursor = cursor.skip(message.content.options.skip);
                      }

                      if(message.content.options.limit) {
                        cursor = cursor.limit(message.content.options.limit);
                      }
                    }

                    cursor.toArray(
                        function(err, docs) {
                            if (err) {
                              deferred.resolve({ error: err });
                            }
                            else {
                              deferred.resolve(docs);
                            }
                          });
                }).
              catch(function(err) {
                    deferred.resolve({ error: err });
                });
        }
        else {
          deferred.reject('You are not allowed access to that resource');
        }
        return deferred.promise;
      };
    exports.ls = _ls;
    
    /**
     * Return a list of collections in this gebo's database
     *
     * @param Object
     * @param Object
     *
     * @return promise
     */
    function _lsCollections(verified, message) {
        var deferred = q.defer();
        if (verified.admin || verified.read) {
          nativeConnection.get(function(client) {
            client.collectionNames(function(err, names) {
                if (err) {
                  deferred.resolve({ error: err });
                }
                else {
                  var cleanNames = [];
                  names.forEach(function(item) {
                      item = item.name.replace(
                                agentDb.connection.name + '.', ''); 
                      if (message.content &&
                          message.content.flag &&
                          message.content.flag.toLowerCase() === 'all') {
                        cleanNames.push(item);
                      }
                      else if(item !== 'system.indexes' &&
                              item !== 'conversations' &&
                              item !== 'registrants' &&
                              item !== 'files' &&
                              item !== 'tokens' &&
                              item !== 'socialcommitments' &&
                              item !== 'permissions' &&
                              item !== 'keys' &&
                              item !== 'friendos'){
                        cleanNames.push(item);
                      }
                    });
                  deferred.resolve(cleanNames);
                }
              });
            });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise;
      };
    exports.lsCollections = _lsCollections;

    /**
     * This adds a new agent for this gebo to represent
     *
     * @param Object
     * @param Object
     */
    var _registerAgent = function(verified, message) {
        var deferred = q.defer();

        if (verified.admin || verified.execute) {

          geboDb.registrantModel.findOne({ email: message.content.newAgent.email }, function(err, registrant) {
              if (registrant) {
                deferred.resolve({ error: 'That email address has already been registered' });
              }
              else {
                var agent = new geboDb.registrantModel(message.content.newAgent);
                agent.save(function(err, agent) {
                    if (err) {
                      deferred.resolve({ error: err });
                    }
                    else {
                      deferred.resolve(agent);
                    }
                  });
              }
            });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise; 
      };
    exports.registerAgent = _registerAgent;

    /**
     * Remove an agent from the gebo agent's database
     *
     * @param Object
     * @param Object
     */
    var _deregisterAgent = function(verified, message) {
        var deferred = q.defer();

        if (verified.admin || verified.execute) {
          geboDb.registrantModel.remove({ email: message.content.email }, function(err, ack) {
                  if (err) {
                    deferred.resolve({ error: err });
                  }
                  else {
                    deferred.resolve(ack);
                  }
                });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise; 
      };
    exports.deregisterAgent = _deregisterAgent;

    /**
     * This adds a new friendo to the registrant's
     * database
     *
     * @param Object
     * @param Object
     */
    var _friendo = function(verified, message) {
        var deferred = q.defer();

        if (verified.admin || verified.write) {
          agentDb.friendoModel.findOneAndUpdate(
                          { email: message.content.email }, message.content, { upsert: true },
                          function(err, friendo) {
                                  if (err) {
                                    deferred.resolve({ error: { code: 500, message: err} });
                                  }
                                  else {
                                    deferred.resolve(friendo);
                                  }
                            });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise; 
      };
    exports.friendo = _friendo;

    /**
     * Remove a friendo from this registrant's database
     *
     * @param Object
     * @param Object
     */
    var _defriendo = function(verified, message) {
        var deferred = q.defer();

        if (verified.write) {
          agentDb.friendoModel.remove({ email: message.content.email }, function(err, ack) {
                  if (err) {
                    deferred.resolve({ error: err });
                  }
                  else {
                    deferred.resolve(ack);
                  }
                });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise; 
      };
    exports.defriendo = _defriendo;

    /**
     * Change the access level to the requested
     * resource
     *
     * @param Object
     * @param Object
     *
     * @return promise
     */
    exports.grantAccess = function(verified, message) {
        var deferred = q.defer();
        if (verified.admin || verified.write) {
          agentDb.friendoModel.findOne({ email: message.content.friendo }, function(err, friendo) {
                  if (err) {
                    deferred.resolve({ error: err });
                  }
                  else {
                    var index = generalUtils.getIndexOfObject(friendo.permissions, 'resource', message.content.permission.resource);
                    if (index > -1) {
                      friendo.permissions.splice(index, 1);
                    }

                    friendo.permissions.push({
                            resource: message.content.permission.resource,
                            read: message.content.permission.read,
                            write: message.content.permission.write,
                            execute: message.content.permission.execute,
                        });

                    friendo.save(function(err, savedFriend) {
                            if (err) {
                              deferred.resolve({ error: err });
                            }
                            else {
                              deferred.resolve(savedFriend);
                            }
                      });
                  }
            });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
 
        return deferred.promise;
      };

    /**
     * certificate
     */
    exports.certificate = function(verified, message) {
        var deferred = q.defer();
        if (verified.admin || verified.write) {
          generalUtils.getPrivateKeyAndCertificate().
            then(function(pair) {
                var data = {
                        public: pair.certificate,
                        private: pair.privateKey,
                        email: message.content.email
                    };

                agentDb.keyModel.findOneAndUpdate({ email: message.content.email }, data, { upsert: true },
                    function(err, key) {
                        if (err) {
                          deferred.resolve({ error: err });
                        }
                        else {
                          _friendo(verified, message).
                                then(function(friendo) {
                                    deferred.resolve(key.public);
                                  }).
                                catch(function(err) {
                                    deferred.resolve({ error: err });
                                  });
                        }
                      });
              }).
            catch(function(err) {
                deferred.resolve({ error: err });
              });
        }
        else {
          deferred.reject('You are not permitted to request or propose that action');
        }
        return deferred.promise; 
      };

    /**
     * Mongo IDs can be just about anything, but if they're
     * 12 or 24 char hex strings, they need to be converted
     * to ObjectIds. If not, they can be left alone.
     */
    function _transformId(id) {
        if (/^[0-9a-fA-F]{12,24}$/.test(id) && !(id instanceof mongo.ObjectID)) {
          return new mongo.ObjectID(id)
        }
        return id;
      };
    exports.transformId = _transformId;
    
    return exports;
  };

