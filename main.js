'use strict';

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { argv } = require('yargs');
const { exec } = require('child_process');
const readFile = require('./readFileT.js');
const accessKeyId = null;
const secretAccessKey = null;
const region = null;

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
  new Promise((resolve, reject) => {
    readFile('/proc/net/dev', 'UTF-8', (err, data) => {
      if(err) return reject(err);
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
    exec('/bin/df -k -l -P', (err, out, code) => {
      if(err) return reject(err);
      resolve(out, code);
    });
  }),
  new Promise((resolve, reject) => {
    readFile('/proc/cpuinfo', 'UTF-8', (err, data) => {
      if(err) return reject(err);
      resolve(data);
    });
  })
];

Promise.all(promises).then(values => {
  const ram = values[1].data;
  const cpu = values[2].data.split(/[\r\n]/);
  const disk = values[3].split(/[\r\n]/);
  const time = Date.now().valueOf();
  const cpuInfo = values[4].data;
  const net = values[0].data.split(/[\r\n]/);

  const cpuResult = {
    time: values[2].time,
    total: null,
    cpus: []
  };

  const cores = cpuInfo.length - 1;
  cpuResult.info = {
    cores,
    speed: []
  };

  cpuResult.info.speed = _findMultipleValuesFromText(cpuInfo, 'cpu MHz', ':').map(value => {
    return parseInt(value);
  });

  cpuResult.info.cores = cpuResult.info.speed.length;

  cpu.some((line, index) => {
    if(!line.startsWith('cpu')) return true;
    const [cpuName, user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice] = line.replace(/\s+/, ' ').split(/ /g);
    const result = {
      cpuName,
      user: parseInt(user),
      nice: parseInt(nice),
      system: parseInt(system),
      idle: parseInt(idle),
      iowait: parseInt(iowait),
      irq: parseInt(irq),
      softirq: parseInt(softirq),
      steal: parseInt(steal),
      guest: parseInt(guest),
      guest_nice: parseInt(guest_nice)
    };

    if(index === 0) {
      cpuResult.total = result;
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
      capacity: parseInt(line[4]),
      used: parseInt(line[2]),
      available: parseInt(line[3])
    });

  });

  const netResult = [];

  net.forEach((line, index) => {
    if(index < 2) return;
    const split = line.trim().split(/\s+/);
    if(split.length < 11) return;
    netResult.push({
      name: split[0].substring(0, split[0].length-1),
      bytes_in: parseInt(split[1]),
      packets_in: parseInt(split[2]),
      bytes_out: parseInt(split[9]),
      packets_out: parseInt(split[10])
    });
  });

  const out = {
    id: argv.id || config.id, //todo aggiungi caricato da file di ubuntu,
    time,
    cpu: cpuResult,
    memory: {
      time: values[1].time,
      MemTotal: parseInt(_findSingleValueFromText(ram, 'MemTotal', ':').slice(0, -2)),
      MemFree: parseInt(_findSingleValueFromText(ram, 'MemFree', ':').slice(0, -2)),
      MemAvailable: parseInt(_findSingleValueFromText(ram, 'MemAvailable', ':').slice(0, -2))
    },
    disk: diskResult,
    network: netResult
  };

  //console.log(JSON.stringify(out));

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
  } else if(accessKeyId) {
    return new AWS.S3({
      accessKeyId,
      secretAccessKey,
      region
    });
  } else {
    return new AWS.S3();
  }
}


function _findValueIndexesFromText(text, key, separator, reg = new RegExp(key)) {
  let startIndex = text.search(reg);
  if(startIndex === -1) {
    return [-1, -1];
  }
  startIndex += key.length;
  let index = startIndex;

  while(text.length > index && text[index] !== '\n') {
    if(text[index] === separator){
      startIndex = index + 1;
    }
    index++;
  }

  return [startIndex, index];
}

function _findSingleValueFromText(text, key, separator) {
  const [startIndex, index] = _findValueIndexesFromText(text, key, separator);
  return text.substring(startIndex, index).trim();
}

function _findMultipleValuesFromText(text, key, separator, reg = new RegExp(key), results = []) {
  const [startIndex, index] = _findValueIndexesFromText(text, key, separator, reg);
  if(startIndex === -1) {
    return results;
  }

  results.push(text.substring(startIndex, index).trim());

  return _findMultipleValuesFromText(text.substring(index + 1), key, separator, reg, results);
}
