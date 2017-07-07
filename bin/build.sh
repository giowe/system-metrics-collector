#!/bin/bash

MACHINE_TYPE=`uname -m`
eval "nexe -i ${PWD}/../main.js -o ${PWD}/../out/sfcw_linux_${MACHINE_TYPE} --bundle"
