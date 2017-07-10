# cloudwatch-client

### What is CloudWatch Client?
CloudWatch Client is a tool that allows you to collect system information and upload them on Amazon S3.
CloudWatch is only compatible with Linux.
We recommend you to use [metrics2xlsx](https://www.npmjs.com/package/metrics2xlsx) to visualize these data.

### How to use it
This tool is available both for [Go](https://github.com/giowe/cloudwatch-client/tree/go) and [JavaScript](https://github.com/giowe/cloudwatch-client).

##### 1. Go
You need to install Go first.
Please follow this [instructions](https://golang.org/doc/install)
```shell
go build -o build/cwc src/main/main.go
```
##### 2. Node
```shell
npm install -g cloudwatch-client
```
### Configuration
Before starting using this tool you have to create a configuration file called .cwc in your Home folder.
This file is structured like this
```
{
  "id": "customer-pc-1",
  "customerId": "customer name",
  "bucket": "s3-bucket",
  "aws": {
    "accessKeyId": "",
    "secretAccessKey": "",
    "region": ""
  }
}
```
### Flags
Otherwise you can run this tool with several flags (flags overcome config values)
   - ```--accessKeyId```  Sets aws access key id.
   - ```--secretAccessKey``` Sets aws secret access key.
   - ```--bucket``` Sets s3 bucket name.
   - ```--id``` Sets an unique id which identify your device.
   - ```--customerId``` Sets the customer id. It will be used to identify your customers.

### How to run it
##### 1. Go
Go builds the executable file named 'cwc' into 'build' directory.
##### 2. Node
You can simply run it by writing:
```shell
cwc
```