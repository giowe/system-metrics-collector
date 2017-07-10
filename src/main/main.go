package main

import (
	"os"
	"os/user"
	"log"
	"path"
	"encoding/json"
	"io/ioutil"
	"os/exec"
	"bytes"
	"regexp"
	"strings"
	"strconv"
	"time"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"flag"
	"fmt"
)

type Config struct {
	Id string         `json:"id"`
	CustomerId string `json:"customerId"`
	Bucket string     `json:"bucket"`
	AwsCredentials AwsCredentials `json:"aws"`
}

type AwsCredentials struct {
	AccessKeyID string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	SessionToken string `json:"sessionToken"`
	Region string `json:"region"`
}

type CpuInfo struct {
	CpuName   string
	User      int
	Nice      int
	System    int
	Idle      int
	Iowait    int
	Irq       int
	Softirq   int
	Steal     int
	Guest     int
	GuestNice int
}

type CpuResult struct {
	Speed []float64
	NumCpus int
	TotalCpuUsage CpuInfo
	CpusUsage []CpuInfo
}

type RamResult struct {
	MemTotal int
	MemFree int
	MemAvailable int
}

type DiskResult struct {
	Name string
	MountPoint string
	Capacity int
	Used int
	Available int
}

type NetworkResult struct {
	Name       string
	BytesIn    int
	PacketsIn  int
	BytesOut   int
	PacketsOut int
}

type MetricsResult struct {
	Id string
	Time int64
	Cpu      CpuResult
	Memory      RamResult
	Disks    []DiskResult
	Network []NetworkResult
}

func check(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func getConfig() (config Config) {
	usr, err := user.Current()
	check(err)

	homeDir := usr.HomeDir

	file, err := os.Open(path.Join(homeDir, ".cwc"))
	check(err)
	defer file.Close()

	decoder := json.NewDecoder(file)
	err = decoder.Decode(&config)
	check(err)

	config.AwsCredentials.AccessKeyID = *flag.String("accessKeyId", config.AwsCredentials.AccessKeyID, "Sets aws access key id.")
	config.AwsCredentials.SecretAccessKey = *flag.String("secretAccessKey", config.AwsCredentials.SecretAccessKey, "Sets aws secret access key.")
	config.Bucket = *flag.String("bucket", config.Bucket, "Sets s3 bucket name.")
	config.Id = *flag.String("id", config.Bucket, "Sets an unique id which identify your device.")
	config.CustomerId = *flag.String("customer", config.Bucket, "Sets the customer id. It will be used to identify each customer.")
	return
}

func getFile(path string) string {
	f, err := ioutil.ReadFile(path)
	check(err)
	return string(f)
}

func cmd(command string, args ...string) string {
	cmd := exec.Command(command, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	check(err)
	return out.String()
}

func findMultipleValuesFromText(text string, key string, separator byte) []string {
	r, err := regexp.Compile(key)
	check(err)
	indexes := r.FindAllStringIndex(text, -1)
	textLen := len(text)
	results := make([]string, len(indexes))
	for i, index := range indexes {
		startIndex := index[1]
		endIndex := index[1]
		for textLen > endIndex && text[endIndex] != '\n' {
			if text[endIndex] == separator  {
				startIndex = endIndex + 1
			}
			endIndex++
		}
		results[i] = strings.TrimSpace(text[startIndex:endIndex])
	}
	return results
}

func convertStringArrayToFloat(array []string) []float64{
	results := make([]float64, len(array))
	for index, stringa := range array {
		results[index],_ = strconv.ParseFloat(stringa, 64)
	}
	return results
}

func parseInt(stringa string) int {
	result,err := strconv.Atoi(stringa)
	check(err)
	return result
}

func SubstringRight(stringa string, amount int) string {
	return stringa[0:len(stringa)-amount]
}

func main() {
	config := getConfig()

	net := strings.Split(getFile("/proc/net/dev"), "\n")
	ram := getFile("/proc/meminfo")
	cpu := getFile("/proc/stat")
	cpuInfo := getFile("/proc/cpuinfo")
	disk := strings.Split(cmd("/bin/df", "-klP"), "\n")
	unixTime := time.Now().Unix() * 1000

	cpuSpeed := convertStringArrayToFloat(findMultipleValuesFromText(cpuInfo, "cpu MHz", ':'))
	numCpus := len(cpuSpeed)

	memAvailable := parseInt(SubstringRight(findMultipleValuesFromText(ram, "MemAvailable", ':')[0], 3))
	memFree := parseInt(SubstringRight(findMultipleValuesFromText(ram, "MemFree", ':')[0], 3))
	memTotal := parseInt(SubstringRight(findMultipleValuesFromText(ram, "MemTotal", ':')[0], 3))

	cpuLines := strings.SplitN(cpu, "\n", -1 )
	var cpuTotal CpuInfo
	cpus := make([] CpuInfo, numCpus)
	for index, line := range cpuLines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "cpu") {
			continue
		}

		rows := strings.Fields(line)

		if len(rows) <= 10 {
			continue
		}

		cpuInfo := CpuInfo{
			CpuName:   rows[0],
			User:      parseInt(rows[1]),
			Nice:      parseInt(rows[2]),
			System:    parseInt(rows[3]),
			Idle:      parseInt(rows[4]),
			Iowait:    parseInt(rows[5]),
			Irq:       parseInt(rows[6]),
			Softirq:   parseInt(rows[7]),
			Steal:     parseInt(rows[8]),
			Guest:     parseInt(rows[9]),
			GuestNice: parseInt(rows[10]),
		}

		if index == 0 {
			cpuTotal = cpuInfo
		} else {
			cpus[index-1] = cpuInfo
		}
	}

	netResult := make([]NetworkResult, len(net) - 3)
	for index, line := range net {
		if index < 2 {
			continue
		}
		line = strings.TrimSpace(line)
		rows := strings.Fields(line)
		if len(rows) <= 10 {
			continue
		}
		netResult[index - 2] = NetworkResult{
			Name:       SubstringRight(rows[0], 1),
			BytesIn:    parseInt(rows[1]),
			PacketsIn:  parseInt(rows[2]),
			BytesOut:   parseInt(rows[9]),
			PacketsOut: parseInt(rows[10]),
		}
	}

	disksResult := make([]DiskResult, len(disk) - 2)

	for index, line := range disk {
		if index == 0 {
			continue
		}

		line = strings.TrimSpace(line)
		rows := strings.Fields(line)

		if len(rows) <= 5 {
			continue
		}

		disksResult[index - 1] = DiskResult{
			Name: rows[0],
			MountPoint: rows[5],
			Capacity: parseInt(SubstringRight(rows[4], 1)),
			Used: parseInt(rows[2]),
			Available: parseInt(rows[3]),
		}
	}

	metricsResult := &MetricsResult{
		Id: config.Id,
		Time: unixTime,
		Cpu: CpuResult{
			Speed: cpuSpeed,
			NumCpus: numCpus,
			CpusUsage: cpus,
			TotalCpuUsage:cpuTotal,
		},
		Memory: RamResult{
			MemAvailable:memAvailable,
			MemFree:memFree,
			MemTotal:memTotal,
		},
		Network: netResult,
		Disks: disksResult,
	}

	s3Json, err := json.Marshal(metricsResult)
	check(err)

	awsConfig := aws.NewConfig()
	if config.AwsCredentials.Region != "" {
		awsConfig.Region = &config.AwsCredentials.Region
	}

	if config.AwsCredentials.AccessKeyID != "" && config.AwsCredentials.SecretAccessKey != "" {
		awsConfig.Credentials = credentials.NewStaticCredentials(config.AwsCredentials.AccessKeyID, config.AwsCredentials.SecretAccessKey, config.AwsCredentials.SessionToken)
	}

	sess := session.Must(session.NewSession(awsConfig))

	key := config.CustomerId + "/" + config.Id + "/" + config.CustomerId + "_" + config.Id + "_" + strconv.Itoa(int(unixTime))

	uploader := s3manager.NewUploader(sess)

	var res = new(s3manager.UploadOutput)
	res,err = uploader.Upload(&s3manager.UploadInput{
		Bucket: &config.Bucket,

		Key: &key,

		Body: strings.NewReader(string(s3Json)),
	})

	check(err)
	fmt.Println("Metric uploaded to " + res.Location)
}
