'use strict';

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { argv } = require('yargs');
const { exec } = require('child_process');
const si = require('systeminformation');
const readFile = require('./readFileT.js');

const config = {
  /*id: null,
  customerId: null,
  bucket: null,
  aws: {
    accessKeyId: null,
    secretAccessKey: null,
    region: null
  }*/
};

try {
  Object.assign(config, JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.sfcwrc'), 'UTF-8')));
} catch(ignore) {
  console.log(`Can't find config file at ${path.join(process.env.HOME, '.sfcwrc')}`);
}

if(argv.customerId) config.customerId = argv.customerId;
if(argv.id) config.id = argv.id;
if(argv.bucket) config.bucket = argv.bucket;

const promises = [
  new Promise(resolve => {
    si.networkInterfaces(ifaces => {
      const result = [];
      ifaces.forEach(iface => {
        si.networkStats(iface, (data) => {
          result.push(data);
        });
      });
      resolve(result);
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
    exec('/bin/df -k -l -P', (err, out, code) => {
      if(err) return reject(err);
      resolve(out, code);
    });
  })
];

Promise.all(promises).then(values => {
  const ram = values[1].data.replace(/ /g, '').split(/\r|\n/);
  const cpu = values[2].data.split(/\r|\n/);
  const disk = values[3].split(/\r|\n/);
  const time = Date.now().valueOf();

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
      mountPoint: line[5],
      capacity: line[4],
      used: line[2],
      available: line[3]
    });

  });

  const out = {
    id: argv.id || config.id || 'please set an id', //todo aggiungi caricato da file di ubuntu,
    cpu: cpuResult,
    memory: {
      time: values[1].time,
      MemTotal: ram[0].substring(9, ram[0].length-2),
      MemFree: ram[1].substring(8, ram[1].length-2),
      MemAvailable: ram[2].substring(13, ram[2].length-2)
    },
    disk: diskResult,
    network: values[0]
  };

  const s3 = _initializeS3(config, argv);
  s3.upload({
    Bucket: config.bucket,
    Key: `${config.customerId}/${out.id}/${config.customerId}_${out.id}_${time}`,
    ContentType: 'application/json',
    Body: JSON.stringify(out)
  }, (err, result) => {
    if(err) return console.log(err);
    console.log(result);
  });
});


function _initializeS3(config, argv) {
  if(config.aws) {
    return new AWS.S3(config.aws);
  } else {
    return new AWS.S3();
  }
}
