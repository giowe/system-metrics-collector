'use strict';

const AWS = require('aws-sdk');
const { argv } = require('yargs');
const exec = require('exec');
const si = require('systeminformation');
const readFile = require('./readFileT.js');
const accessKeyId = null;
const secretAccessKey = null;
const region = null;

const config = {
  /*aws: {
    accessKeyId: null,
    secretAccessKey: null,
    region: null
  }*/
};

try {
  Object.assign(config, require('~/.sfcwrc'));
} catch(ignore) {}

const promises = [
  new Promise(resolve => {
    if(config.id) return resolve(config.id);
    si.system((data) => {
      resolve(data);
    });
  }),
  new Promise((resolve, reject) => {
    readFile('/proc/meminfo', 'UTF-8', (err, data) => {
      if(err) return reject(err);
      resolve(data);
    });
  }),
  new Promise((resolve, reject) => {
    readFile('/proc/stat', 'UTF-8', (err, data) => {
      if(err) return reject(err);
      resolve(data);
    });
  }),
  new Promise((resolve, reject) => {
    exec(['/bin/df', '-k', '-l', '-P'], (err, out, code) => {
      if(err) return reject(err);
      console.log(out);
      resolve(out, code);
    });
  })
];

Promise.all(promises).then(values => {
  const ram = values[1].data.replace(/ /g, '').split(/\r|\n/);
  const cpu = values[2].data.split(/\r|\n/);
  const disk = values[3].split(/\r|\n/);

  const cpuResult = {
    time: values[2].time,
    avg: null,
    cpus: []
  };

  cpu.some((line, index) => {
    if(!line.startsWith('cpu')) return true;
    const [cpuName, user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice] = line.replace(/\s+/, ' ').split(/ /g);
    const result = { cpuName, user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice };

    if(index === 0) {
      cpuResult.avg = result;
    } else {
      cpuResult.cpus.push(result);
    }
  });

  const diskResult = [];

  disk.forEach((line, index) => {
    if (index === 0) return;
    line = line.split(/\s+/);
    if(line.length < 6) return;

    diskResult.push({
      name: line[0],
      capacity: line[5],
      used: line[2],
      available: line[3]
    });

  });

  const out = {
    id: argv.id || config.id || values[0], //todo aggiungi caricato da file di ubuntu,
    cpu: cpuResult,
    memory: {
      time: values[1].time,
      MemTotal: ram[0].substring(9, ram[0].length-2),
      MemFree: ram[1].substring(8, ram[1].length-2),
      MemAvailable: ram[2].substring(13, ram[2].length-2)
    },
    disk: diskResult,
    network: null
  };

  console.log(JSON.stringify(out));

  /*const s3 = _initializeS3(config, argv);

  s3.upload({
    Bucket: 'bucket',
    Key: `${out.id}_${time}`,
    ContentType: 'application/json',
    Body: JSON.stringify(out)
  });*/
});


function _initializeS3(config, argv) {
  if(config.aws) {
    return new AWS.S3(new AWS.config(config.aws));
  } else if(accessKeyId) {
    return new AWS.S3(new AWS.config({
      accessKeyId,
      secretAccessKey,
      region
    }));
  } else {
    return new AWS.S3();
  }
}
