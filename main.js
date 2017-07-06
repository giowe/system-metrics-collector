'use strict';

const AWS = require('aws-sdk');
const { argv } = require('yargs');
const { exec } = require('child_process');
const si = require('systeminformation');
const readFile = require('./readFileT.js');
const accessKeyId = null;
const secretAccessKey = null;
const region = null;

const config = {
  id: null,
  clientId: null
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
  new Promise((resolve, reject) => {
    si.networkInterfaceDefault(iface => {
      si.networkStats(iface, (data) => {
        resolve(data);
      });
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

  const cpuResult = {
    time: values[2].time,
    avg: null,
    cpus: []
  };

  for (let index = 0; index < cpu.length; ++index) {
    const line = cpu[index];
    if(!line.startsWith('cpu')) break;
    const splittedLine = line.replace(/ {2}/g, ' ').split(/ /g);

    /*
     *
     user: normal processes executing in user mode
     nice: niced processes executing in user mode
     system: processes executing in kernel mode
     idle: twiddling thumbs
     iowait: waiting for I/O to complete
     irq: servicing interrupts
     softirq: servicing softirqs
     * */

    const result = {
      cpuName: splittedLine[0],
      user: splittedLine[1],
      nice: splittedLine[2],
      system: splittedLine[3],
      idle: splittedLine[4],
      iowait: splittedLine[5],
      irq: splittedLine[6],
      softirq: splittedLine[7],
      steal: splittedLine[8],
      guest: splittedLine[9],
      guest_nice: splittedLine[10]
    };

    if(index === 0) {
      cpuResult.avg = result;
    } else {
      cpuResult.cpus[index - 1] = result;
    }
  }

  const diskResult = [];

  for(let index = 1; index < disk.length; ++index) {
    const line = disk[index].split(/\s+/);
    if(line.length < 6) {
      continue;
    }
    diskResult[index - 1] = {
      name: line[0],
      capacity: line[5],
      used: line[2],
      available: line[3]
    };
  }

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

  //console.log(JSON.stringify(out));

  /*const s3 = initializeS3(config, argv);

  s3.upload({
    Bucket: 'bucket',
    Key: `${out.id}_${time}`,
    ContentType: 'application/json',
    Body: JSON.stringify(out)
  });*/
});


function initializeS3(config, argv) {
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
