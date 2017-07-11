'use strict';

const fs = require('fs');
const path = require('path');
const { argv } = require('yargs');
const { exec } = require('child_process');
const { readFile } = require('fs');
const AWS = require('aws-sdk');
const config = {};
const zlib = require('zlib');

try {
  Object.assign(config, JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.smc'), 'UTF-8')));
} catch(ignore) {
  console.log(`Can't find config file at ${path.join(process.env.HOME, '.smc')}`);
}

if(argv.customerId) config.customerId = argv.customerId;
if(argv.id) config.id = argv.id;

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
  const ram = values[1];
  const cpu = values[2].split(/[\r\n]/);
  const disk = values[3].split(/[\r\n]/);
  const time = Date.now().valueOf();
  const cpuInfo = values[4];
  const net = values[0].split(/[\r\n]/);

  const cpuResult = {
    Speed: [],
    NumCpus: cpuInfo.length - 1,
    CpusUsage: [],
    TotalCpuUsage: null
  };

  cpuResult.Speed = _findMultipleValuesFromText(cpuInfo, 'cpu MHz', ':').map(value => {
    return parseInt(value);
  });

  cpuResult.NumCpus = cpuResult.Speed.length;

  cpu.some((line, index) => {
    if(!line.startsWith('cpu')) return true;
    const [cpuName, user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice] = line.replace(/\s+/, ' ').split(/ /g);
    const result = {
      CpuName: cpuName,
      User: parseInt(user),
      Nice: parseInt(nice),
      System: parseInt(system),
      Idle: parseInt(idle),
      Iowait: parseInt(iowait),
      Irq: parseInt(irq),
      Softirq: parseInt(softirq),
      Steal: parseInt(steal),
      Guest: parseInt(guest),
      GuestNice: parseInt(guest_nice)
    };

    if(index === 0) {
      cpuResult.TotalCpuUsage = result;
    } else {
      cpuResult.CpusUsage.push(result);
    }
  });

  const diskResult = [];

  disk.forEach((line, index) => {
    if (index === 0) return;
    line = line.split(/\s+/);
    if(line.length < 6) return;

    diskResult.push({
      Name: line[0],
      MountPoint: line[5],
      Capacity: parseInt(line[4]),
      Used: parseInt(line[2]),
      Available: parseInt(line[3])
    });

  });

  const netResult = [];

  net.forEach((line, index) => {
    if(index < 2) return;
    const split = line.trim().split(/\s+/);
    if(split.length < 11) return;
    netResult.push({
      Name: split[0].substring(0, split[0].length-1),
      BytesIn: parseInt(split[1]),
      PacketsIn: parseInt(split[2]),
      BytesOut: parseInt(split[9]),
      PacketsOut: parseInt(split[10])
    });
  });

  const out = {
    Id: argv.id || config.id,
    Time: time,
    Cpu: cpuResult,
    Memory: {
      MemTotal: parseInt(_findSingleValueFromText(ram, 'MemTotal', ':').slice(0, -2)),
      MemFree: parseInt(_findSingleValueFromText(ram, 'MemFree', ':').slice(0, -2)),
      MemAvailable: parseInt(_findSingleValueFromText(ram, 'MemAvailable', ':').slice(0, -2))
    },
    Disks: diskResult,
    Network: netResult
  };

  //console.log(JSON.stringify(out));

  const s3 = _initializeS3(config, argv);

  s3.upload({
    Bucket: config.bucket,
    Key: `${config.customerId}/${out.Id}/${config.customerId}_${out.Id}_${time}`,
    ContentType: 'application/json',
    Body: zlib.deflateSync(JSON.stringify(out))
  }, (err, result) => {
    if(err) return console.log(err);
    console.log(result);
  });
});

function _initializeS3(config) {
  if(config.aws) {
    return new AWS.S3(config.aws);
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
