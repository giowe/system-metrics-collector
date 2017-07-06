'use strict';

const AWS = require('aws-sdk');
const { argv } = require('yargs');
const exec = require('exec');
const sys = require('systeminformation');

const config = {

};
try {
  Object.assign(config, require('~/.sfcwrc'));
} catch(ignore) {}


const out = {
  id: argv.id || config.id, //todo aggiungi caricato da file di ubuntu,
  cpu: null,
  memory: null,
  disk: null,
  network: null
};

const s3 = new AWS.S3(); //todo passare parametri se esistono
s3.upload({
  Bucket: 'bucket',
  Key: `${out.id}_millisec in unix time`,
  ContentType: 'application/json',
  Body: JSON.stringify(out)
});
