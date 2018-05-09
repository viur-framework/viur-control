'use strict';
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import WriteStream = NodeJS.WriteStream;
const $ = require('jquery');

const fs = require('fs');
const async = require('async');
const request = require('request');
const progress = require('request-progress');
const ipc = require('electron').ipcRenderer;
const renderer = require('mustache');
const {spawn, spawnSync} = require('child_process');
const Storage = require('electron-store');
const settingsStorage = new Storage({"name": "settings"});
const _ = require('underscore');
const yauzl = require("yauzl");
const os = require('os');
const path = require('path');
const Transform = require('stream').Transform;
let wizardStepsTemplate = fs.readFileSync("assets/templates/wizard_step.mustache").toString();

export const docDummy = "1";

/**
 * Here we'are building a dependency installation wizard for viur-control.
 *
 * Which software should be installed depends on the operating system and which tools are already installed.
 *
 * For now we only provide an installer for windows, but perhaps we also take mac os and linux into account in the future.
 *
 * The data for the installer gets provided by an json file.
 *
 * Each tool is described in a so called step. Each step may need downloading some files, installation cmd and post installation configuration.
 *
 * We bind each to the appropriate functions in a sequence.
 *
 * Only checkInstall is mandatory for each step, the other funcs depend on the steps' data.
 */

function setupUI() {
  console.log("setupUi");
  if (!fs.existsSync("depencencyCache")) {
    fs.mkdirSync("depencencyCache");
  }

  let installStepsFile;
  if (os.platform === "win32") {
    installStepsFile = "assets/dependency-installer/windows/installer_steps_windows.json";
  } else if (os.platform === "darwin") {
    installStepsFile = "assets/dependency-installer/darwin/installer_steps_darwin.json";
  } else {
    // TODO: add linux installer step files for major distros
    return;
  }

  fs.readFile(installStepsFile, (err: string, data: string) => {
    let wizardData = JSON.parse(data);
    let steps = wizardData.steps;
    let currentPath = process.env["PATH"];

    function amendPath(envAdditionals: Array<string>) {
      let splitted: any = currentPath.split(";");
      for (let addPath of envAdditionals) {
        if (!splitted.includes(addPath)) {
          splitted.push(addPath);
        }
      }
      currentPath = splitted.join(";");
    }

    function checkInstall(lastStepResult: boolean, callback: any) {
      let step = this;
      let outputDiv = $(".js-check-step-output");
      $(".js-check-section").removeClass("hidden");
      $(".progress-bar-content").css("width", "0%");
      $(".js-showable-sections").addClass("hidden");
      $(".js-current-step-name").text(step.name);
      $(outputDiv).text(`calling '${step.checking.cmd}'...\n`);
      console.log("");

      let checkingCmd = step.checking.cmd;
      let output, regex, regexResult, result;

      console.log("Check install of step %s", step.name);
      let env = process.env;
      env.PATH = currentPath;
      let proc = spawnSync(checkingCmd, {shell: true, env: env});
      if (step.checking.stdoutRegex) {
        output = proc.stdout.toString();
        console.log("before appending stdout check data", output);
        // $(outputDiv).append(output);
        regex = new RegExp(step.checking.stdoutRegex, 'g');
        regexResult = regex.exec(output);
        result = (!!regexResult);
        if (result) {
          step.needsInstallation = false;
          $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-check").text("OK");
          $(outputDiv).append(`tool already installed - no further action needed here!\n`);
          callback(null, null);
        } else {
          $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-warning").text("missing");
          $(outputDiv).append(`tool needs installation!\n`);
          step.needsInstallation = true;
          callback(null, null);
        }
      } else {
        output = proc.stderr.toString();
        console.log("before appending stderr check data", output);
        // $(outputDiv).append(output);
        regex = new RegExp(step.checking.stderrRegex, 'g');
        regexResult = regex.exec(output);
        result = (!!regexResult);
        if (result) {
          console.log("No need to install %s", step.name);
          $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-check").text("OK");
          $(outputDiv).append(`tool already installed - no further action needed here!\n`);
          step.needsInstallation = false;
          callback(null, null);
        } else {
          console.log("Actions required for %s", step.name);
          $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-warning").text("missing");
          $(outputDiv).append(`tool needs installation!\n`);
          step.needsInstallation = true;
          callback(null, null);
        }
      }
    }

    function download(result: any, callback: any) {
      let step = this;
      let url = step.download.url;
      let dest = step.download.dest;
      console.log("download before start", step, url, dest);
      let alreadyDownloaded = fs.existsSync(dest);
      let progressBar = $(".progress-bar-content");
      $(".js-check-section").addClass("hidden");
      if (!step.needsInstallation || alreadyDownloaded) {
        console.log("no need to download %s", this.name);
        $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-download-step").addClass("icon-check").text("OK");
        $(progressBar).css("width", `100%`);
        callback(null, null);
        return;
      }

      $(".js-current-step-name").text(step.name);
      $(".js-download-section").removeClass("hidden");

      let destStream = fs.createWriteStream(dest);
      progress(request(url), {
        throttle: 50
      })
          .on('progress', function (state: any) {
            let myProgress = state.percent * 100;
            console.log("download progress %s %%", myProgress);
            $(progressBar).css("width", `${myProgress}%`);
          })
          .on('error', function (err: string) {
            console.log("downloading error for ${step.name}: %s", err);
            callback(err, "downloading error");
          })
          .on('end', function () {
            console.log(`downloading ${step.name} finished`);
            destStream.end();
            $(progressBar).css("width", `100%`);
            $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-download-step").addClass("icon-check").text("OK");
            callback(null, null);
          })
          .pipe(destStream);
    }

    function unpack(result: any, callback: any) {
      let step = this;
      let destDir = step.unpack.directory.replace("%HOMEDIR%", os.homedir());
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir);
      } else if (fs.existsSync(step.install.directory.replace("%HOMEDIR%", os.homedir()))) {
        $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-unpack-step").addClass("icon-check").text("OK");
        callback(null, null);
        return;
      }

      function mkdirp(dir: any, cb: any) {
        if (dir === ".") return cb();
        fs.stat(dir, function (err: any) {
          if (err == null) return cb(); // already exists

          let parent = path.dirname(dir);
          mkdirp(parent, function () {
            fs.mkdir(dir, cb);
          });
        });
      }

      yauzl.open(step.download.dest, {lazyEntries: true}, function (err: any, zipfile: any) {
        if (err) throw err;

        // track when we've closed all our file handles
        let handleCount = 0;

        function incrementHandleCount() {
          handleCount++;
        }

        function decrementHandleCount() {
          handleCount--;
          if (handleCount === 0) {
            $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-unpack-step").addClass("icon-check").text("OK");
            callback(null, null);
            return;
          }
        }

        incrementHandleCount();
        zipfile.on("close", function () {
          decrementHandleCount();
        });

        zipfile.readEntry();
        zipfile.on("entry", function (entry: any) {
          if (/\/$/.test(entry.fileName)) {
            // directory file names end with '/'
            mkdirp(path.join(destDir, entry.fileName), function () {
              if (err) throw err;
              zipfile.readEntry();
            });
          } else {
            // ensure parent directory exists
            mkdirp(path.join(destDir, path.dirname(entry.fileName)), function () {
              zipfile.openReadStream(entry, function (err: any, readStream: any) {
                if (err) throw err;
                let destFilename = path.join(destDir, entry.fileName);

                let filter = new Transform();
                filter._transform = function (chunk: any, encoding: any, cb: any) {
                  cb(null, chunk);
                };
                filter._flush = function (cb: any) {
                  cb();
                  zipfile.readEntry();
                };

                // pump file contents
                let writeStream = fs.createWriteStream(destFilename);
                incrementHandleCount();
                writeStream.on("close", decrementHandleCount);
                readStream.pipe(filter).pipe(writeStream);
              });
            });
          }
        });
      });
    }

    function install(result: any, callback: any) {
      let step = this;
      if (!step.needsInstallation) {
        console.log("no need to install %s", this.name);
        $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-install-step").addClass("icon-check").text("OK");
        callback(null, true);
        return;
      }

      let cmd = step.install.cmd;
      let args = step.install.args;
      let env = process.env;
      env.PATH = currentPath;
      let options = {shell: true, env: env, cwd: ""};
      let directory = step.install.directory;
      if (directory) {
        directory = options.cwd = directory.replace("%HOMEDIR%", os.homedir());
      }

      let proc : any;
      console.log(`starting proc with ${cmd}, ${directory}, ${args}, ${options}`);
      if (args) {
        cmd = path.join(directory, cmd);
        proc = spawn(cmd, args, options);
      } else {
        proc = spawn(cmd, options);
      }

      proc.stdout.on("data", (chunk: WriteStream) => {
      	let data = chunk.toString();
        if (step.install.inputNeeded && data.indexOf(step.install.inputNeeded.output) !== -1) {
          proc.stdin.write(step.install.inputNeeded.stdinFeed);
        }
        console.log(`${cmd} stdout output ${chunk}`);
      });

      proc.stderr.on("data", (chunk: WriteStream) => {
        console.log(`${cmd} stdout output ${chunk}`);
      });

      proc.on('close', (code: number) => {
        console.log(`${cmd} return code ${code}`);
        if (step.install.addEnv) {
          amendPath(step.install.addEnv);
        }
        $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-install-step").addClass("icon-check").text("OK");
        proc = null;
        callback(null, null);
      });

      proc.on('error', (error: string) => {
        console.log(`${cmd} error ${error}`);
        // callback(error, null);
      });
    }

    function postInstall(result: string, callback: any) {
      let env = process.env;
      env.PATH = currentPath;
      let proc = spawnSync(this.postInstall, {shell: true, env: env});
      console.log(`postInstall ${this.name} status = ${proc.status}`);
      console.log(`postInstall ${this.name} stdout: ${proc.stdout.toString()}`);
      console.log(`postInstall ${this.name} stderr: ${proc.stderr.toString()}`);
      callback(null, null);
    }

    let jobs: Array<any> = [];
    // we do it that way to hopefully have some time file locks are released before trying to access the downloaded files.
    for (let step of steps) {
      jobs.push(_.bind(checkInstall, step));
      if (step.download) {
        jobs.push(_.bind(download, step));
      }
      if (step.unpack) {
        jobs.push(_.bind(unpack, step));
      }
      if (step.install) {
        jobs.push(_.bind(install, step));
      }
      if (step.postInstall) {
        jobs.push(_.bind(postInstall, step));
      }
    }

    let tmp = renderer.render(wizardStepsTemplate, wizardData);
    $(".list-group").html(tmp);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $(".inline-output").css(
        {
          "color": foregroundColor,
          "background-color": backgroundColor
        }
    );
    $(".js-close").on("click", window.close);

    setTimeout(function () {
      async.seq(...jobs)(true, function (err: string, data: string) {
        console.log("callback", err, data);
      })
    }, 2500);
  });
}

ipc.on("start-wizard", function (event: Event) {
  setupUI();
});
