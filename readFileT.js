'use strict';
const { readFile } = require('fs');
module.exports = new Proxy(readFile, {
  apply: (readFile, that, args) => {
    const cb = args.pop();
    readFile(...args, (err, data) => {
      if (err) return cb(err);
      cb(null, {
        time: Date.now(),
        data
      });
    });
    return Date.now();
  }
});
