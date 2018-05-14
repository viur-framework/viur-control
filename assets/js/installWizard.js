'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const $ = require('jquery');
const fs = require('fs');
const async = require('async');
const request = require('request');
const progress = require('request-progress');
const electron = require('electron');
const remote = electron.remote;
const ipc = electron.ipcRenderer;
const renderer = require('mustache');
const { spawn, spawnSync } = require('child_process');
const Storage = require('electron-store');
const settingsStorage = new Storage({ "name": "settings" });
const _ = require('underscore');
const yauzl = require("yauzl");
const os = require('os');
const path = require('path');
const Transform = require('stream').Transform;
exports.docDummy = "1";
function setup_wizard(customPath) {
    let finalPath = customPath ? customPath : remote.getGlobal('process').env['frozenAppPath'];
    let wizardStepsTemplate = fs.readFileSync(path.join(finalPath, "assets/templates/wizard_step.mustache")).toString();
    console.log("setupUi", finalPath);
    if (!fs.existsSync("distfiles")) {
        fs.mkdirSync("distfiles");
    }
    let installStepsFile;
    if (os.platform === "win32") {
        installStepsFile = path.join(finalPath, "assets/dependency-installer/windows/installer_steps_windows.json");
    }
    else if (os.platform === "darwin") {
        installStepsFile = path.join(finalPath, "assets/dependency-installer/darwin/installer_steps_darwin.json");
    }
    else {
        installStepsFile = path.join(finalPath, "assets/dependency-installer/linux/ubuntu/installer_steps_ubuntu.json");
    }
    fs.readFile(installStepsFile, (err, data) => {
        let wizardData = JSON.parse(data);
        let steps = wizardData.steps;
        let currentPath = process.env["PATH"];
        function amendPath(envAdditionals) {
            let splitted = currentPath.split(";");
            for (let addPath of envAdditionals) {
                if (!splitted.includes(addPath)) {
                    splitted.push(addPath);
                }
            }
            currentPath = splitted.join(";");
        }
        function checkInstall(lastStepResult, callback) {
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
            let proc = spawnSync(checkingCmd, { shell: true, env: env });
            if (step.checking.stdoutRegex) {
                output = proc.stdout.toString();
                console.log("before appending stdout check data", output);
                regex = new RegExp(step.checking.stdoutRegex, 'g');
                regexResult = regex.exec(output);
                result = (!!regexResult);
                if (result) {
                    step.needsInstallation = false;
                    $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-check").text("OK");
                    $(outputDiv).append(`tool already installed - no further action needed here!\n`);
                    callback(null, null);
                }
                else {
                    $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-warning").text("missing");
                    $(outputDiv).append(`tool needs installation!\n`);
                    step.needsInstallation = true;
                    callback(null, null);
                }
            }
            else {
                output = proc.stderr.toString();
                console.log("before appending stderr check data", output);
                regex = new RegExp(step.checking.stderrRegex, 'g');
                regexResult = regex.exec(output);
                result = (!!regexResult);
                if (result) {
                    console.log("No need to install %s", step.name);
                    $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-check").text("OK");
                    $(outputDiv).append(`tool already installed - no further action needed here!\n`);
                    step.needsInstallation = false;
                    callback(null, null);
                }
                else {
                    console.log("Actions required for %s", step.name);
                    $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-check-step").addClass("icon-warning").text("missing");
                    $(outputDiv).append(`tool needs installation!\n`);
                    step.needsInstallation = true;
                    callback(null, null);
                }
            }
        }
        function download(result, callback) {
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
                .on('progress', function (state) {
                let myProgress = state.percent * 100;
                console.log("download progress %s %%", myProgress);
                $(progressBar).css("width", `${myProgress}%`);
            })
                .on('error', function (err) {
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
        function unpack(result, callback) {
            let step = this;
            let destDir = step.unpack.directory.replace("%HOMEDIR%", os.homedir());
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir);
            }
            else if (fs.existsSync(step.install.directory.replace("%HOMEDIR%", os.homedir()))) {
                $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-unpack-step").addClass("icon-check").text("OK");
                callback(null, null);
                return;
            }
            function mkdirp(dir, cb) {
                if (dir === ".")
                    return cb();
                fs.stat(dir, function (err) {
                    if (err == null)
                        return cb();
                    let parent = path.dirname(dir);
                    mkdirp(parent, function () {
                        fs.mkdir(dir, cb);
                    });
                });
            }
            yauzl.open(step.download.dest, { lazyEntries: true }, function (err, zipfile) {
                if (err)
                    throw err;
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
                zipfile.on("entry", function (entry) {
                    if (/\/$/.test(entry.fileName)) {
                        mkdirp(path.join(destDir, entry.fileName), function () {
                            if (err)
                                throw err;
                            zipfile.readEntry();
                        });
                    }
                    else {
                        mkdirp(path.join(destDir, path.dirname(entry.fileName)), function () {
                            zipfile.openReadStream(entry, function (err, readStream) {
                                if (err)
                                    throw err;
                                let destFilename = path.join(destDir, entry.fileName);
                                let filter = new Transform();
                                filter._transform = function (chunk, encoding, cb) {
                                    cb(null, chunk);
                                };
                                filter._flush = function (cb) {
                                    cb();
                                    zipfile.readEntry();
                                };
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
        function install(result, callback) {
            let step = this;
            if (!step.needsInstallation) {
                console.log("no need to install %s", this.name);
                $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-install-step").addClass("icon-check").text("OK");
                callback(null, true);
                return;
            }
            let cmd = step.install.cmd.replace("${{frozenAppPath}}", finalPath);
            let args = step.install.args;
            let env = process.env;
            env.PATH = currentPath;
            let options = { shell: true, env: env, cwd: "" };
            let directory = step.install.directory;
            if (directory) {
                directory = options.cwd = directory.replace("%HOMEDIR%", os.homedir());
            }
            let proc;
            console.log(`starting proc with ${cmd}, ${directory}, ${args}, ${options}`);
            if (args) {
                cmd = path.join(directory, cmd);
                proc = spawn(cmd, args, options);
            }
            else {
                proc = spawn(cmd, options);
            }
            proc.stdout.on("data", (chunk) => {
                let data = chunk.toString();
                if (step.install.inputNeeded && data.indexOf(step.install.inputNeeded.output) !== -1) {
                    proc.stdin.write(step.install.inputNeeded.stdinFeed);
                }
                console.log(`${cmd} stdout output ${chunk}`);
            });
            proc.stderr.on("data", (chunk) => {
                console.log(`${cmd} stdout output ${chunk}`);
            });
            proc.on('close', (code) => {
                console.log(`${cmd} return code ${code}`);
                if (step.install.addEnv) {
                    amendPath(step.install.addEnv);
                }
                $(`li.list-group-item[data-step-id="${step.step}"]`).find(".js-install-step").addClass("icon-check").text("OK");
                proc = null;
                callback(null, null);
            });
            proc.on('error', (error) => {
                console.log(`${cmd} error ${error}`);
            });
        }
        function postInstall(result, callback) {
            let env = process.env;
            env.PATH = currentPath;
            let proc = spawnSync(this.postInstall, { shell: true, env: env });
            console.log(`postInstall ${this.name} status = ${proc.status}`);
            console.log(`postInstall ${this.name} stdout: ${proc.stdout.toString()}`);
            console.log(`postInstall ${this.name} stderr: ${proc.stderr.toString()}`);
            callback(null, null);
        }
        let jobs = [];
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
        $(".inline-output").css({
            "color": foregroundColor,
            "background-color": backgroundColor
        });
        $(".js-close").on("click", window.close);
        setTimeout(function () {
            async.seq(...jobs)(true, function (err, data) {
                console.log("callback", err, data);
            });
        }, 2500);
    });
}
exports.setup_wizard = setup_wizard;
try {
    ipc.on("start-wizard", function (event) {
        setup_wizard();
    });
}
catch (err) {
    console.log(err);
}
//# sourceMappingURL=installWizard.js.map