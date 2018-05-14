#!/usr/bin/env bash

tar cvJf /tmp/packedvc.tar.xz build_tools assets src package.json package-lock.json main.js tsconfig.json && cp /tmp/packedvc.tar.xz .
