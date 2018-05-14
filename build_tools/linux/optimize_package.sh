#!/bin/bash

pushd out/viur-control-linux-x64/resources
find . -type d -exec chmod o+rx {} \;
find . -type f -exec chmod o+r {} \;
pushd app
rm -rf .idea src build_tools label_icons gulpfile.js convert.sh TODO.md start.sh .gitignore label-icons
popd
popd
