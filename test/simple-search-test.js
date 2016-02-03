import SimpleSearch from '../src'
import {expect} from 'chai'
const debug = require('debug')('search')

describe("SimpleSearch", () => {
  describe("#index", () => {
    it("should index document", (done) => {
      const search = new SimpleSearch(":memory:", (error, search) => {
        search.index(1, {title: "hello world", content: "this message is a hello world message"});
        search.index(2, {title: "urgent: serious", content: "This mail is seen as a more serious mail"});
        search.index(3, {title: "這是中文標題", content: "這是一封中文電郵的內容！"});
        search.count().then((result) => {
          expect(result).to.equal(3);
          done();
        })
      });
    });
  });

  describe("#get", () => {
    it("should return document by id", (done) => {
      const search = new SimpleSearch(":memory:", (error, search) => {
        search.index(1, {title: "hello world", content: "this message is a hello world message"});
        search.index(2, {title: "urgent: serious", content: "This mail is seen as a more serious mail"});
        search.index(3, {title: "這是中文標題", content: "這是一封中文電郵的內容！"});
        search.get(3).then((result) => {
          expect(result).to.deep.equal({title: "這是中文標題", content: "這是一封中文電郵的內容！"});
          done();
        })
      });
    });
  });

  describe("#search", () => {
    it("should search chinese (fetch document)", (done) => {
      const search = new SimpleSearch(":memory:", (error, search) => {
        search.index(1, {title: "hello world", content: "this message is a hello world message"});
        search.index(2, {title: "urgent: serious", content: "This mail is seen as a more serious mail"});
        search.index(3, {title: "這是中文標題", content: "這是一封中文電郵的內容！"});
        search.search({query: "中文", fetchIdOnly: false}).then((result) => {
          expect(result.length).to.equal(1);
          expect(result[0]).to.deep.equal({title: "這是中文標題", content: "這是一封中文電郵的內容！"});
          done();
        })
      });
    })

    it("should search chinese (fetch id only)", (done) => {
      const search = new SimpleSearch(":memory:", (error, search) => {
        search.index(1, {title: "hello world", content: "this message is a hello world message"});
        search.index(2, {title: "urgent: serious", content: "This mail is seen as a more serious mail"});
        search.index(3, {title: "這是中文標題", content: "這是一封中文電郵的內容！"});
        search.search({query: "中文", fetchIdOnly: true}).then(result => {
          expect(error).to.not.exist;
          expect(result).to.deep.equal([3]);
          done();
        });
      });
    });
  });
});
