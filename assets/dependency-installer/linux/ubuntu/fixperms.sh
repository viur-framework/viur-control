#!/bin/bash

find out/viur-control-linux-x64/resources -type d -exec chmod o+rx {} \;
find out/viur-control-linux-x64/resources -type f -exec chmod o+r {} \;
