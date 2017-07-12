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
	"compress/gzip"
)

type Config struct {
	Id string         `json:"id"`
	CustomerId string `json:"customerId"`
	Bucket  string `json:"bucket"`
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
	Network *map[string]NetworkResult
}

type CustomError struct {
	error string
}

func (cError CustomError) Error() string {
	return cError.error
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

	bucket := flag.String("bucket", config.Bucket, "Sets the bucket name")
	idFlag := flag.String("id", config.Id, "Sets an unique id which identify your device.")
	customerIdFlag := flag.String("customer", config.CustomerId, "Sets the customer id. It will be used to identify each customer.")
	configPath := flag.String("configPath", path.Join(homeDir, ".smcrc"), "Sets the config path")
	flag.Parse()

	config.Bucket = *bucket
	config.Id = *idFlag
	config.CustomerId = *customerIdFlag

	file, err := os.Open(*configPath)
	check(err)
	defer file.Close()

	decoder := json.NewDecoder(file)
	err = decoder.Decode(&config)
	check(err)
	return
}

func getLastKey() (*string, error) {
	usr, err := user.Current()
	check(err)
	homeDir := usr.HomeDir

	dat, err := ioutil.ReadFile(path.Join(homeDir, ".smclastdata"))
	if(err != nil) {
		return nil,err
	} else {
		result := string(dat)
		return &result,err
	}
}

func writeLastKey(key string) {
	usr, err := user.Current()
	check(err)
	homeDir := usr.HomeDir

	err = ioutil.WriteFile(path.Join(homeDir, ".smclastdata"), []byte(key), 0644)
	check(err)
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
	if indexes == nil {
		return []string{}
	}
	textLen := len(text)
	results := make([]string, 0, len(indexes))
	for _,index := range indexes {
		startIndex := index[1]
		endIndex := index[1]
		for textLen > endIndex && text[endIndex] != '\n' {
			if text[endIndex] == separator  {
				startIndex = endIndex + 1
			}
			endIndex++
		}
		results = append(results, strings.TrimSpace(text[startIndex:endIndex]))
	}
	return results
}

func findSingleValueFromText(text string, key string, separator byte) (string,error) {
	result := findMultipleValuesFromText(text, key, separator)
	if result == nil || len(result) < 1 {
		return "",CustomError {error: "Unable to find a value with key " + key + ". findSingleValueFromText func"}
	} else {
		return result[0],nil
	}
}

func convertStringArrayToFloat(array []string) []float64{
	results := make([]float64, 0, len(array))
	for _, stringa := range array {
		value,err := strconv.ParseFloat(stringa, 64)
		check(err)
		results = append(results, value)
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

	memFreeRaw,err := findSingleValueFromText(ram, "MemFree", ':')
	check(err)
	memFree := parseInt(SubstringRight(memFreeRaw, 3))

	memTotalRaw,err := findSingleValueFromText(ram, "MemTotal", ':')
	check(err)
	memTotal := parseInt(SubstringRight(memTotalRaw, 3))

	cachedRaw,err := findSingleValueFromText(ram, "Cached", ':')
	check(err)
	Cached := parseInt(SubstringRight(cachedRaw, 3))

	buffersRaw,err := findSingleValueFromText(ram, "Buffers", ':')
	check(err)
	Buffers := parseInt(SubstringRight(buffersRaw, 3))
	memAvailable := memFree + Cached + Buffers

	cpuLines := strings.SplitN(cpu, "\n", -1)
	var cpuTotal CpuInfo
	cpus := make([] CpuInfo, 0, numCpus)
	for index, line := range cpuLines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "cpu") {
			continue
		}

		rows := strings.Fields(line)

		if len(rows) < 8 {
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
		}

		if len(rows) > 8 {
			cpuInfo.Steal = parseInt(rows[8])
			cpuInfo.Guest = parseInt(rows[9])
			cpuInfo.GuestNice = parseInt(rows[10])
		}

		if index == 0 {
			cpuTotal = cpuInfo
		} else {
			cpus = append(cpus, cpuInfo)
		}
	}

	netResult := make(map[string]NetworkResult)
	for index, line := range net {
		if index < 2 {
			continue
		}

		split := strings.Split(line, ":")
		if len(split) < 2 {
			continue
		}

		netName := strings.TrimSpace(split[0])
		values := strings.TrimSpace(line[len(split[0])+1:])

		rows := strings.Fields(values)
		if len(rows) <= 9 {
			continue
		}

		netResult[netName] = NetworkResult {
			Name:       netName,
			BytesIn:    parseInt(rows[0]),
			PacketsIn:  parseInt(rows[1]),
			BytesOut:   parseInt(rows[8]),
			PacketsOut: parseInt(rows[9]),
		}
	}

	disksResult := make([]DiskResult, 0, len(disk) - 2)

	for index, line := range disk {
		if index == 0 {
			continue
		}

		line = strings.TrimSpace(line)
		rows := strings.Fields(line)

		if len(rows) <= 5 {
			continue
		}

		disksResult = append(disksResult, DiskResult{
			Name: rows[0],
			MountPoint: rows[5],
			Capacity: parseInt(SubstringRight(rows[4], 1)),
			Used: parseInt(rows[2]),
			Available: parseInt(rows[3]),
		})
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
		Network: &netResult,
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

	key := config.CustomerId + "/" + config.Id + "/" + config.CustomerId + "_" + config.Id + "_" + strconv.Itoa(int(unixTime)) + ".json.gz"

	uploader := s3manager.NewUploader(sess)

	var b bytes.Buffer
	w := gzip.NewWriter(&b)
	_,err = w.Write([]byte(string(s3Json)))
	check(err)
	w.Close()

	var res = new(s3manager.UploadOutput)

	metadata := make(map[string]*string)
	lastKey,err := getLastKey()
	if err == nil {
		metadata["PreviousKey"] = lastKey
	}

	res,err = uploader.Upload(&s3manager.UploadInput{
		Bucket: &config.Bucket,

		Key: &key,

		Body: bytes.NewReader(b.Bytes()),

		Metadata: metadata,
	})

	writeLastKey(key)

	check(err)
	fmt.Println("Metric uploaded to " + res.Location)
}
