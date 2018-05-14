#!/usr/bin/env bash

for i in 16 32 48 64 128 256; do convert build_tools/appIcons/icon-vc.svg -resize "${i}>" -transparent white "build_tools/appIcons/icon-vc-${i}.png"; done
