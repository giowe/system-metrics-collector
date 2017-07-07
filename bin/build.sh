#!/bin/bash

MACHINE_TYPE=`uname -m`
eval "npm install"
ret_code=$?
if [ $ret_code != 0 ]; then
  echo "Npm install failed!"
  exit $ret_code
fi
eval "mkdir -p ${PWD}/out"
eval "nexe --bundle"
ret_code_nexe=$?
if [ $ret_code_nexe != 0 ]; then
  echo "Nexe compilation failed!"
  exit $ret_code_nexe
fi
echo "You can find the compiled file in ./out/sfcw_linux_${MACHINE_TYPE}"
