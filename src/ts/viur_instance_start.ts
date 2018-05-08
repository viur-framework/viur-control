"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import {ProjectInterface} from "./mainWindowRenderer";
import WriteStream = NodeJS.WriteStream;
const $ = require('jquery');
const path = require('path');
const {spawn} = require('child_process');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const ipc = require('electron').ipcRenderer;

const settingsStorage = new ElectronStorage({"name": "settings"});

const defaultFlagsTpl = "--admin_port ${adminPort} --port ${serverPort} --log_level debug --storage_path ../storage/ -A ${applicationId} .";

module.exports["defaultFlagsTpl"] = defaultFlagsTpl;

function startLocalInstance(project: ProjectInterface, applicationId: string, fromWindowId: number) {
  console.log("startLocalInstance", project, applicationId, fromWindowId);

  let output = $(".output");
  let userPasswordRegex = /.*Username: (.*?), Password: (.*)/g;
  let userScrolled = false;
  let ignoreScroll = false;

  function scrollHandler(event: any) {
    if (!ignoreScroll) {
      let scrollTop = event.currentTarget.scrollTop;
      let height = event.currentTarget.scrollHeight;
      let factor = (scrollTop / height);
      userScrolled = factor < 0.65;
      console.log(event, factor, userScrolled);
    } else {
      ignoreScroll = false;
    }
  }

  function handleOutput(stringBuffer: any, findPassword = false) {
    let text = stringBuffer.toString();
    if (findPassword) {
      let credentials = userPasswordRegex.exec(text);
      if (credentials && credentials.length > 0) {
        // we have to go over main.js as a proxy.
        // This context does not want to send ipc messages to its parent window :(
        ipc.send("credentials-found", applicationId, credentials[1], credentials[2]);
      }
    }

    text = text.split("\n");
    let intermediateData : Array<string> = [];
    for (let line of text) {
      line = line.replace(
        "DEBUG", '<span class="loglevel debug">DEBUG</span>').replace(
        "INFO", '<span class="loglevel info">INFO</span>').replace(
        "ERROR", '<span class="loglevel error">ERROR</span>').replace(
        "WARNING", '<span class="loglevel warning">WARNING</span>');
      intermediateData.push(`<p class="output-line">${line}</p>`);
    }

    let result : string = intermediateData.join("");
    if (result) {
      $(output).append(result);
      if (!userScrolled) {
        ignoreScroll = true;
        $(output)[0].scrollTop = $(output)[0].scrollHeight;
      }
    }
    $(output).append(text);
  }

  let activeAppengineDirectory;
  for (let appengineDirectory of project.appengineDirectories) {
    if (appengineDirectory.checked === true) {
      activeAppengineDirectory = appengineDirectory.value;
    }
  }
  if (!activeAppengineDirectory) {
    activeAppengineDirectory = project.appengineDirectories[0].value;
  }

  let projectPath = path.join(project.absolutePath, activeAppengineDirectory);
  let cmdTemplate;

  let serverPort = project.serverPort;
  let adminPort = project.adminPort;
  let gcloudPath = settingsStorage.get("gcloud_tool_path");
  let devserverPath;
  if (gcloudPath) {
    devserverPath = path.join(gcloudPath, "dev_appserver.py");
  } else {
    devserverPath = "dev_appserver.py";
  }

  if (project.custom_devserver_cmd) {
    let result = project.custom_devserver_cmd;
    result = result.replace("${adminPort}", adminPort.toString()).replace("${serverPort}", serverPort.toString()).replace("${applicationId}", applicationId);
    cmdTemplate = `${devserverPath} ${result}`;
  } else {
    cmdTemplate = `${devserverPath} --admin_port ${adminPort} --port ${serverPort} --log_level debug --storage_path ../storage/ -A ${applicationId} .`;
  }

  $(output).append(`<p class="output-line"><span class="loglevel info">current working directory: </span>${projectPath}</p><p class="output-line"><span class="loglevel info">used command: </span>${cmdTemplate}</p>`);
  $(output).on("scroll", scrollHandler);

  let proc = spawn(cmdTemplate, {"cwd": projectPath, "shell": true});
  ipc.send('local-devserver-started', project.internalId, proc.pid);
  let parentWindow = BrowserWindow.fromId(fromWindowId);
  parentWindow.webContents.send("local-devserver-started", project.internalId, proc.pid);

  $(".js-close").on("click", function () {
    parentWindow.send('local-devserver-minimized', project.internalId);
  });

  proc.stdout.on("data", (chunk: WriteStream) => {
    handleOutput(chunk, true);
  });

  proc.stderr.on("data", (chunk: WriteStream) => {
    handleOutput(chunk, true);
  });
}

ipc.on("start-instance", function (event: Event, project : ProjectInterface, applicationId: string, fromWindowId: number) {
  console.log("on start-instance", project, applicationId, fromWindowId);
  let title = `Instance: ${applicationId}`;
  $(".logo-title").text(title);
  let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
  let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
  $(".output").css(
    {
      "color": foregroundColor,
      "background-color": backgroundColor
    }
  );

  startLocalInstance(project, applicationId, fromWindowId);
});
