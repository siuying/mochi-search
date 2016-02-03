'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

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

var docWithResultSet = function docWithResultSet(rows) {
  return rows.reduce(function (map, row) {
    map[row.field] = row.value;
    return map;
  }, {});
};

var docsWithResultSet = function docsWithResultSet(rows) {
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
};

var docIdsWithResultSet = function docIdsWithResultSet(rows) {
  var resultSet = rows.reduce(function (set, row) {
    set.add(row.doc_id);
    return set;
  }, new Set());
  return Array.from(resultSet);
};

var SimpleSearch = (function () {
  function SimpleSearch(filename, callback) {
    var _this = this;

    _classCallCheck(this, SimpleSearch);

    debug("create database");
    this.database = (0, _sqlite3Mozporter2.default)(new _sqlite2.default.Database(filename));
    this.database.serialize(function () {
      _this.database.run('CREATE VIRTUAL TABLE IF NOT EXISTS ig_search USING FTS4 (id, doc_id, field, value, tokenize=mozporter)');
      if (callback) {
        callback(null, _this);
      }
    });
  }

  // Index a document with given ID

  _createClass(SimpleSearch, [{
    key: 'index',
    value: function index(id, doc, callback) {
      var _this2 = this;

      (0, _invariant2.default)(id, "id cannot be nil");
      (0, _invariant2.default)(doc, "doc cannot be nil");

      this.database.serialize(function () {
        _this2.database.run('delete from ig_search where doc_id = ?', id);
        var stmt = _this2.database.prepare("insert into ig_search (doc_id, field, value) values (?, ?, ?)");
        Object.keys(doc).forEach(function (key) {
          var value = doc[key];
          stmt.run(id, key, value);
        });
        stmt.finalize();
        if (callback) callback();
      });
    }

    // Get an indexed document by ID

  }, {
    key: 'get',
    value: function get(id, callback) {
      var _this3 = this;

      (0, _invariant2.default)(id, "id cannot be nil");
      this.database.serialize(function () {
        _this3.database.all('SELECT field, value FROM ig_search WHERE doc_id = ?', id, function (error, rows) {
          if (error) {
            callback(error);
            return;
          }

          callback(null, docWithResultSet(rows));
        });
      });
    }
  }, {
    key: 'search',
    value: function search(options, callback) {
      var _this4 = this;

      var _Object$assign = Object.assign({}, { field: null, fetchIdOnly: false }, options);

      var query = _Object$assign.query;
      var field = _Object$assign.field;
      var fetchIdOnly = _Object$assign.fetchIdOnly;

      (0, _invariant2.default)(query, "query cannot be null");

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

      var queryCallback = null;
      if (fetchIdOnly) {
        queryCallback = function queryCallback(error, result) {
          if (error) {
            callback(error);
            return;
          }

          callback(null, docIdsWithResultSet(result));
        };
      } else {
        queryCallback = function queryCallback(error, result) {
          if (error) {
            callback(error);
            return;
          }

          callback(null, docsWithResultSet(result));
        };
      }

      if (!field) {
        debug(sql, query);
        this.database.serialize(function () {
          _this4.database.all(sql, query, queryCallback);
        });
      } else {
        debug(sql, field, query);
        this.database.serialize(function () {
          _this4.database.all(sql, field, query, queryCallback);
        });
      }
    }

    // Count number of document indexed

  }, {
    key: 'count',
    value: function count(callback) {
      this.database.get('select count(distinct doc_id) as count from ig_search', function (error, result) {
        if (error) {
          callback(error);
          return;
        }

        callback(null, result.count);
        return;
      });
    }

    // close database

  }, {
    key: 'close',
    value: function close(callback) {
      // clean up statemenets
      Object.keys(this.statements).forEach(function (s) {
        return s.finalize();
      });

      // clonse database
      this.database.close(callback);
    }
  }]);

  return SimpleSearch;
})();

exports.default = SimpleSearch;