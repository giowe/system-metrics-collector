# system-metrics-collector
[![NPM version][npm-image]][npm-url] [![Downloads][downloads-image]][npm-url] [![Dependency Status][dependencies-image]][npm-url] [![Gandalf Status][gandalf-image]][gandalf-url]

[npm-url]: https://www.npmjs.com/package/system-metrics-collector
[npm-image]: http://img.shields.io/npm/v/system-metrics-collector.svg?style=flat
[downloads-image]: https://img.shields.io/npm/dm/system-metrics-collector.svg?style=flat-square
[dependencies-url]: href="https://david-dm.org/giowe/system-metrics-collector
[dependencies-image]: https://david-dm.org/giowe/system-metrics-collector.svg
[gandalf-url]: https://www.youtube.com/watch?v=Sagg08DrO5U
[gandalf-image]: http://img.shields.io/badge/gandalf-approved-61C6FF.svg

# system-metrics-collector

### What is System Metrics Collector?
System Metrics Collector is a tool that allows you to collect system information and upload them on a S3 bucket.
System Metrics Collector is only compatible with Linux.
We recommend you to use [metrics2xlsx](https://www.npmjs.com/package/metrics2xlsx) to visualize these data.

### How to use it
This tool is available both for [Go](https://github.com/giowe/cloudwatch-client/tree/go) and [NodeJs](https://github.com/giowe/cloudwatch-client).

##### 1. Go
You need to install Go first.
Please follow this [instructions](https://golang.org/doc/install).
Then you can write this command to build this tool:
```shell
go get
go build -o build/smc main.go
```
##### 2. Node
```shell
npm install -g system-metrics-collector
```
### Configuration
Before starting using this tool you have to create a configuration file called .smc in your Home folder.
This file is structured like this
```
{
  "id": "customer-pc-1",
  "customerId": "customer name",
  "bucket": "bucket name",
  "cloudWatchEnabledStats": ["DiskUtilization", "DiskSpaceUsed", "DiskSpaceAvailable", "MemoryUtilization", "MemoryAvailable", "MemoryUsed", "SwapUsed", "SwapUtilization", "NetworkUtilization", "CPUUtilization"],
  "aws": {
    "accessKeyId": "",
    "secretAccessKey": "",
    "region": ""
  }
}
```
If you are using go you can generate the default config running
```shell
./smc generateConfig [fullpath]
```
The full path also includes the file name. Example: /home/ec2-user/.smcrc
### Flags
Otherwise you can run this tool with several flags (flags overcome config values)
   - ```--bucket``` Sets s3 bucket name.
   - ```--id``` Sets an unique id which identify your device.
   - ```--customerId``` Sets the customer id. It will be used to identify your customers.
   - ```--configPath``` Sets the config path (It includes file name).
   - ```--lastDataPath``` Sets last data Path (It includes file name).
### How to run it
##### 1. Go
Go builds the executable file named 'smc' into 'build' directory.
##### 2. Node
You can simply run it by writing:
```shell
smc
```
