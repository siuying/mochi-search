// # index.js
// A simple full text search engine based on sqlite3 and Mozilla Porter Stemmer.
//

import sqlite from 'sqlite3'
import mozporter from 'sqlite3-mozporter'
import invariant from 'invariant'
const debug = require('debug')('search')

export default class MochiSearch {
  /**
   * ## Constructor
   * Create a new instance.
   *
   * @param {string} filename Filename to the underlying sqlite database, or ":memory:" for memory based database.
   * @param {function} callback A function that will be called when initialization completed.
   */
  constructor(filename, callback) {
    debug("open database")
    this.database = mozporter(new sqlite.Database(filename));
    this.database.serialize(() => {
      this.database.run(`CREATE VIRTUAL TABLE IF NOT EXISTS ig_search USING FTS4 (id, doc_id, field, value, tokenize=mozporter)`);
      if (callback) {
        callback(null, this);
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
  index(id, doc) {
    invariant(id, "id cannot be nil");
    invariant(doc, "doc cannot be nil");

    return new Promise((resolve, reject) => {
      this.database.serialize(() => {
        this.database.run(`begin transaction`);
        this.database.run(`delete from ig_search where doc_id = ?`, id);
        var stmt = this.database.prepare("insert into ig_search (doc_id, field, value) values (?, ?, ?)");
        Object.keys(doc).forEach((key) => {
          const value = doc[key];
          stmt.run(id, key, value);
        });
        stmt.finalize();
        this.database.run(`commit transaction`);
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
  get(id) {
    invariant(id, "id cannot be nil");

    return new Promise((resolve, reject) => {
      this.database.serialize(() => {
        this.database.all(`SELECT field, value FROM ig_search WHERE doc_id = ?`, id, (error, rows) => {
          if (error) {
            reject(error);
            return
          }

          resolve(docWithResultSet(rows, id));
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
  search(options) {
    const {query, field, fetchIdOnly} = Object.assign({}, {field: null, fetchIdOnly: false}, options);
    invariant(query, "query cannot be null");
    return new Promise((resolve, reject) => {
      let sql = "";
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

      let processor = fetchIdOnly ? docIdsWithResultSet : docsWithResultSet;
      let callback = (error, result) => {
        if (error) {
          reject(error);
          return
        }
        resolve(processor(result));
      };
      if (!field) {
        debug(sql, query);
        this.database.serialize(() => {
          this.database.all(sql, query, callback);
        });
      } else {
        debug(sql, field, query);
        this.database.serialize(() => {
          this.database.all(sql, field, query, callback);
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
  delete(id) {
    invariant(id, "id cannot be nil");

    return new Promise((resolve, reject) => {
      this.database.serialize(() => {
        this.database.run(`delete from ig_search where doc_id = ?`, id, (error, result) => {
          if (error) {
            reject(error);
            return
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
  count() {
    return new Promise((resolve, reject) => {
      this.database.get(`select count(distinct doc_id) as count from ig_search`, (error, result) => {
        if (error) {
          reject(error);
          return
        }

        resolve(result.count);
        return
      });
    });
  }

  /**
   * ## MochiSearch#close
   * Close database
   */
  close() {
    return new Promise((resolve, reject) => {
      this.database.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

}

/**
 * a filter that convert rows of results into a document.
 */
function docWithResultSet(rows, id) {
  return rows.reduce((map, row) => {
    map[row.field] = row.value
    map['id'] = id
    return map
  } , {})
}

/**
 * a filter that convert rows of results into array of document objects.
 */
function docsWithResultSet(rows) {
  const objects = rows.reduce((map, row) => {
    let docId = row.doc_id
    let field = row.field
    let value = row.value

    let doc = map[docId]
    if (!doc) {
      doc = {id: docId}
      map[docId] = doc
    }
    doc[field] = value
    return map
  }, {})
  return Object.keys(objects).map(k => objects[k]);
}

/**
 * a filter that convert rows of results into array of document ids.
 */
function docIdsWithResultSet(rows) {
  const resultSet = rows.reduce((set, row) => {
    set.add(row.doc_id)
    return set
  }, new Set());
  return Array.from(resultSet);
}
