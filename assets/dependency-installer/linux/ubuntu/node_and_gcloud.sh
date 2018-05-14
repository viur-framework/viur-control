#!/bin/bash

export CLOUD_SDK_REPO="cloud-sdk-$(lsb_release -c -s)"
echo "deb http://packages.cloud.google.com/apt $CLOUD_SDK_REPO main" | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
sudo apt-get update
sudo apt-get install -y google-cloud-sdk google-cloud-sdk-app-engine-python google-cloud-sdk-app-engine-python-extras
curl -sL https://deb.nodesource.com/setup_9.x | sudo -E bash - && sudo -E apt-get install -y nodejs
sudo npm install -g less
sudo -H pip install "git+https://github.com/pyjs/pyjs.git#egg=pyjs"
gcloud config configurations create viur-control-default
gcloud config set app/promote_by_default false
gcloud auth login
