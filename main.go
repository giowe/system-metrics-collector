package main

import (
  "os"
  "os/user"
  "log"
  "path"
  "encoding/json"
  "io/ioutil"
  "fmt"
  "os/exec"
  "bytes"
  "regexp"
)

type Config struct {
  Id string         `json:"id"`
  CustomerId string `json:"customerId"`
  Bucket string     `json:"bucket"`
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

  file, err := os.Open(path.Join(homeDir, ".sfcwrc"))
  check(err)
  defer file.Close()

  decoder := json.NewDecoder(file)
  err = decoder.Decode(&config)
  check(err)

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

func findValueIndexesFromText(text string, key string, separator string) (startIndex int, endIndex int) {
  r, err := regexp.Compile(key)
  check(err)
  fmt.Println(r.FindAllString(text, -1))
  return 1, 1
}

func main() {
  //config := getConfig()
  net := getFile("/proc/net/dev")
  ram := getFile("/proc/meminfo")
  cpu := getFile("/proc/stat")
  cpuInfo := getFile("/proc/cpuinfo")
  disk := cmd("/bin/df", "-klP")

  fmt.Println(net)
  fmt.Println(ram)
  fmt.Println(cpu)
  fmt.Println(cpuInfo)
  fmt.Println(disk)

  findValueIndexesFromText(cpu, "cpu MHz", ":")
}
