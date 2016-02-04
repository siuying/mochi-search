'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // # index.js
// A simple full text search engine based on sqlite3 and Mozilla Porter Stemmer.
//

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _sqlite = require('sqlite3');

var _sqlite2 = _interopRequireDefault(_sqlite);

var _sqlite3Mozporter = require('sqlite3-mozporter');

var _sqlite3Mozporter2 = _interopRequireDefault(_sqlite3Mozporter);

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var debug = require('debug')('search');

var MochiSearch = function () {
  /**
   * ## Constructor
   * Create a new instance.
   *
   * @param {string} filename Filename to the underlying sqlite database, or ":memory:" for memory based database.
   * @param {function} callback A function that will be called when initialization completed.
   */

  function MochiSearch(filename, callback) {
    var _this = this;

    _classCallCheck(this, MochiSearch);

    debug("open database");
    this.database = (0, _sqlite3Mozporter2.default)(new _sqlite2.default.Database(filename));
    this.database.serialize(function () {
      _this.database.run('CREATE VIRTUAL TABLE IF NOT EXISTS ig_search USING FTS4 (id, doc_id, field, value, tokenize=mozporter)');
      if (callback) {
        callback(null, _this);
      }
    });
  }

  /**
   * ## MochiSearch#index
   *
   * Index a document with given ID.
   * @param {integer} id document ID.
   * @param {object} doc document to be index, should be a simple object that have no nested keys.
   * @return {Promise} return a promise resolved when index is completed.
   */

  _createClass(MochiSearch, [{
    key: 'index',
    value: function index(id, doc) {
      var _this2 = this;

      (0, _invariant2.default)(id, "id cannot be nil");
      (0, _invariant2.default)(doc, "doc cannot be nil");

      return new Promise(function (resolve, reject) {
        _this2.database.serialize(function () {
          _this2.database.run('begin transaction');
          _this2.database.run('delete from ig_search where doc_id = ?', id);
          var stmt = _this2.database.prepare("insert into ig_search (doc_id, field, value) values (?, ?, ?)");
          Object.keys(doc).forEach(function (key) {
            var value = doc[key];
            stmt.run(id, key, value);
          });
          stmt.finalize();
          _this2.database.run('commit transaction');
          resolve();
        });
      });
    }

    /**
     * ## MochiSearch#get
     *
     * Get an indexed document by ID
     * @param {integer} id document ID.
     * @return {Promise} return a promise when resolved, result is the corresponding document.
     */

  }, {
    key: 'get',
    value: function get(id) {
      var _this3 = this;

      (0, _invariant2.default)(id, "id cannot be nil");

      return new Promise(function (resolve, reject) {
        _this3.database.serialize(function () {
          _this3.database.all('SELECT field, value FROM ig_search WHERE doc_id = ?', id, function (error, rows) {
            if (error) {
              reject(error);
              return;
            }

            resolve(docWithResultSet(rows));
          });
        });
      });
    }

    /**
     * ## MochiSearch#search
     *
     * Search a document by query.
     *
     * @param {object} options an object that can have following keys: ``query``, ``field``, ``fetchIdOnly``
     * @return {Promise} return a promise when resolved, contain array of objects or ids (depends on fetchIdOnly options)
     */

  }, {
    key: 'search',
    value: function search(options) {
      var _this4 = this;

      var _Object$assign = Object.assign({}, { field: null, fetchIdOnly: false }, options);

      var query = _Object$assign.query;
      var field = _Object$assign.field;
      var fetchIdOnly = _Object$assign.fetchIdOnly;

      (0, _invariant2.default)(query, "query cannot be null");
      return new Promise(function (resolve, reject) {
        var sql = "";
        if (fetchIdOnly) {
          sql += "SELECT doc_id FROM ig_search \n";
          sql += "JOIN ( SELECT distinct doc_id, rank(matchinfo(ig_search), 1) AS rank FROM ig_search ";
        } else {
          sql += "SELECT doc_id, field, value FROM ig_search \n";
          sql += "JOIN ( SELECT doc_id, rank(matchinfo(ig_search), 1) AS rank FROM ig_search ";
        }
        if (!field) {
          sql += "WHERE value MATCH ? ";
        } else {
          sql += "WHERE field = ? AND value MATCH ? ";
        }
        sql += "ORDER BY rank DESC ) \nAS ranktable USING(doc_id) \n";
        sql += "ORDER BY ranktable.rank DESC \n";

        var processor = fetchIdOnly ? docIdsWithResultSet : docsWithResultSet;
        var callback = function callback(error, result) {
          if (error) {
            reject(error);
            return;
          }
          resolve(processor(result));
        };
        if (!field) {
          debug(sql, query);
          _this4.database.serialize(function () {
            _this4.database.all(sql, query, callback);
          });
        } else {
          debug(sql, field, query);
          _this4.database.serialize(function () {
            _this4.database.all(sql, field, query, callback);
          });
        }
      });
    }

    /**
     * ## MochiSearch#delete
     *
     * Delete a document from index.
     *
     * @return {Promise} return a promise to resolve when the document is deleted.
     */

  }, {
    key: 'delete',
    value: function _delete(id) {
      var _this5 = this;

      (0, _invariant2.default)(id, "id cannot be nil");

      return new Promise(function (resolve, reject) {
        _this5.database.serialize(function () {
          _this5.database.run('delete from ig_search where doc_id = ?', id, function (error, result) {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      });
    }

    /**
     * ## MochiSearch#count
     *
     * Count number of document indexed.
     *
     * @return {Promise} return a promise when resolved, return the number of document indexed.
     */

  }, {
    key: 'count',
    value: function count() {
      var _this6 = this;

      return new Promise(function (resolve, reject) {
        _this6.database.get('select count(distinct doc_id) as count from ig_search', function (error, result) {
          if (error) {
            reject(error);
            return;
          }

          resolve(result.count);
          return;
        });
      });
    }

    /**
     * ## MochiSearch#close
     * Close database
     */

  }, {
    key: 'close',
    value: function close() {
      var _this7 = this;

      return new Promise(function (resolve, reject) {
        _this7.database.close(function (error) {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }]);

  return MochiSearch;
}();

/**
 * a filter that convert rows of results into a document.
 */

exports.default = MochiSearch;
function docWithResultSet(rows) {
  return rows.reduce(function (map, row) {
    map[row.field] = row.value;
    return map;
  }, {});
}

/**
 * a filter that convert rows of results into array of document objects.
 */
function docsWithResultSet(rows) {
  var objects = rows.reduce(function (map, row) {
    var docId = row.doc_id;
    var field = row.field;
    var value = row.value;

    var doc = map[docId];
    if (!doc) {
      doc = {};
      map[docId] = doc;
    }
    doc[field] = value;
    return map;
  }, {});
  return Object.keys(objects).map(function (k) {
    return objects[k];
  });
}

/**
 * a filter that convert rows of results into array of document ids.
 */
function docIdsWithResultSet(rows) {
  var resultSet = rows.reduce(function (set, row) {
    set.add(row.doc_id);
    return set;
  }, new Set());
  return Array.from(resultSet);
}