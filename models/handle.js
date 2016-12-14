const fs       = require('fs');
const crypto   = require('crypto');
const moment   = require('moment');
const Promise  = require('bluebird');
const cheerio  = require('cheerio');
const request  = require('request');
const db       = require('./db').connection;
const andify   = require('../utils').andify;
const settings = require('../utils').settings;

module.exports = {
  add(handle) {
    return new Promise((resolve, reject) => {
      db.query('INSERT IGNORE INTO `handles` SET ?', {handle}, (err, result) => {
        err ? reject(err) : resolve({id: result.insertId});
      });
    });
  },
  remove(cond) {
    return new Promise((resolve, reject) => {
      db.query('DELETE FROM `handles` WHERE ?', cond, (err, data) => {
        err ? reject(err) : resolve();
      });
    });
  },
  getAll(order='id') {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM `handles` ORDER BY ' + order + ' DESC', (err, data) => {
        err ? reject(err) : resolve(data);
      });
    });
  },
  getCond(cond) {
    return new Promise((resolve, reject) => {
      cond = andify(cond);

      if (cond.query !== undefined) {
        db.query('SELECT * FROM `handles` WHERE ' + cond.query, (err, data) => {
          if (err) reject(err);
          else if (data.length === 0) resolve(null);
          else if (data.length === 1) resolve(data[0]);
          else resolve(data);
        });
      } else {
        db.query('SELECT * FROM `handles` WHERE ?', cond, (err, data) => {
          if (err) reject(err);
          else if (data.length === 0) resolve(null);
          else if (data.length === 1) resolve(data[0]);
          else resolve(data);
        });
      }
    });
  },
  update(vals, id) {
    return new Promise((resolve, reject) => {
      db.query('UPDATE `handles` SET ? WHERE ?', [vals, {id}], (err, result) => {
        resolve({err: err, result: result});
      });
    });
  },
  incVal(key, value, handle) {
    value = Number(value);
    return new Promise((resolve, reject) => {
      this.getVal(key, handle).then(previous => {
        previous += value;
        db.query('UPDATE `handles` SET ? WHERE ?', [{[key]: previous}, {handle}], (err, data) => {
          if (err) reject(err);
          else if (data.length === 0) resolve(null);
          else resolve(previous);
        });
      });
    });
  },
  getVal(key, handle) {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM `handles` WHERE ?', {handle}, (err, data) => {
        if (err) reject(err);
        else if (data.length === 0) resolve(null);
        else resolve(data[0][key]);
      });
    });
  },
  setVal(key, value, handle) {
    return new Promise((resolve, reject) => {
      db.query('UPDATE `handles` SET ? WHERE ?', [{[key]: value}, {handle}], (err, data) => {
        if (err) reject(err);
        else if (data.length === 0) resolve(null);
        else resolve();
      });
    });
  },
  getTemplate(handle) {
    return new Promise((resolve, reject) => {
      this.getCond({handle}).then(handle => {
        if (handle === null) return resolve({});
        fs.readFile(`./data/templates/${handle.id}`, 'utf8', (err, template) => {
          resolve({template});
        });
      });
    });
  },
  fetchTemplate(handle, cb) {
    this.getCond({handle}).then(handle => {
      request(`https://twitter.com/${handle.handle}`, (err, response, body) => {
        $ = cheerio.load(body, {
          normalizeWhitespace: true
        });

        // Empty time line and remove extraneous info
        $('.Grid-cell .u-lg-size2of3').empty();
        $('.Grid-cell .u-size1of3').remove();
        $('link[rel="preload"]').remove();
        $('script[async]').remove();
        $('#init-data').remove();
        $('#global-nav-moments').remove();
        $('.pull-right').remove();
        $('.ProfileNav-item--userActions').remove();

        // Replace favicon
        $('meta[name="msapplication-TileImage"]').remove();
        $('link[rel="mask-icon"]').remove();
        $('link[rel="shortcut icon"]').remove();
        $('link[rel="apple-touch-icon"]').remove();
        $('head').append(`<link rel="icon" type="image/png" href="img/favicon.png" sizes="196x196">`);

        // Replace home link
        $('a[data-nav="home"]').attr('href', settings.general.basehref);

        // Fix stream with proper div
        $('.Grid-cell .u-lg-size2of3').append(`
    <div id="timeline" class="ProfileTimeline ">
      <div class="stream">
       <ol class="stream-items js-navigable-stream" id="stream-items-id">
       </ol>
      </div>
    </div>`);

        // Insert pagination
        $("ol.stream-items").prepend(`
          <li class="js-stream-item stream-item stream-item" data-item-type="tweet">
            <div id="deadbirdPagination" style="
              /* margin: auto; */
              margin-top: 15px;
              text-align: center;
              padding-bottom: 15px;
              border-bottom: #CCC 1px solid;
            ">
            <div id="deadbirdPaginationControl">
            </div>
            <div id="deadbirdPaginationStat"></div>
          </div>
        </li>`
        );


        // Extract profile pic and replace with local version
        let profileImage = $('.ProfileAvatar-image').attr('src');
        let ext = profileImage.match(/400x400(.*)/)[1];
        $('.ProfileAvatar-image').attr('src', `profileImg/${handle.id}${ext}`);

        fs.writeFile(`./data/templates/${handle.id}`, $.html(), () => {
          let dl = request(profileImage).pipe(fs.createWriteStream(`./data/profileImg/${handle.id}${ext}`));
          this.update({template: 1, ext}, handle.id).then(() => {
            dl.on('finish', () => {
              cb();
            });
          });
        });
      });
    });
  }
};
