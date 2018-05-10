'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const moment = require('moment');
const $ = require('jquery');
const { exec, execSync, spawn } = require('child_process');
const electron = require('electron');
const ipc = electron.ipcRenderer;
const fs = require('fs');
const path = require('path');
const Storage = require('electron-store');
const settingsStorage = new Storage({ "name": "settings" });
const regionsStorage = new Storage({ "name": "regions" });
const domainMappingsStorage = new Storage({ "name": "domainMappings" });
const remote = electron.remote;
const BrowserWindow = remote.BrowserWindow;
const async = require('async');
const _ = require('underscore');
const { checkTaskOk } = require('./projectSpecFile');
const { verifyProjectStorageFile, verifyCredentialsFiles, verifyProjectSpecFiles, verifySettingsStorageFile } = require('./schemaVerifier');
const frozenAppPath = remote.getGlobal("process").env["frozenAppPath"];
let proc = null;
exports.docDummy = "1";
function outputHandler(text, loglevel = "info") {
    let output = $(".output");
    let lines = text.split("\n");
    if (loglevel) {
        for (let line of lines) {
            $(output).append(`<p class="output-line"><span class="loglevel ${loglevel}">${line}</span></p>`);
        }
    }
    else {
        for (let line of text) {
            $(output).append(`<p class="output-line">${line}</p>`);
        }
    }
    setImmediate(function () {
        $(output)[0].scrollTop = $(output)[0].scrollHeight;
    });
}
function startTask(result, callback) {
    let output = $(".output");
    const [fromWindowId, project, taskWithOptions] = this;
    const [task, selectedOptions] = taskWithOptions;
    let isLongRunning = task.longRunning;
    console.log("startHandler", project, task, selectedOptions);
    const projectPath = path.join(project.absolutePath, task.directory);
    let options = [];
    for (let argument of selectedOptions) {
        let name = argument.name;
        let value = argument.value;
        for (let taskArgument of task.taskArguments) {
            if (taskArgument.name === name) {
                for (let option of taskArgument.argumentOptions) {
                    console.log("taskArgument option", option);
                    if (option.value === value) {
                        if (option.longRunning) {
                            isLongRunning = true;
                        }
                        let flags = option.flags;
                        if (flags) {
                            options.push(...flags);
                            break;
                        }
                    }
                }
            }
        }
    }
    let cmd;
    if (options.length > 0) {
        cmd = `${task.cmd} ${options.join(" ")}`;
    }
    else {
        cmd = task.cmd;
    }
    let stopProcessBtn = $(".js-stop-process");
    if (isLongRunning) {
        $(stopProcessBtn).removeClass("hidden");
        $(stopProcessBtn).on("click", function () {
            if (proc) {
                proc.kill();
            }
        });
    }
    else {
        $(stopProcessBtn).addClass("hidden");
    }
    $(output).append(`<br/><p class="output-line"><span class="loglevel info">starting task: '${cmd}' in projectPath: '${projectPath}'</span></p>`);
    proc = exec(cmd, { "cwd": projectPath });
    proc.stdout.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stderr.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.on('close', function (code) {
        console.log('closing code: ' + code);
        $(output).append(`<p class="output-line"><span class="loglevel info">End of task: '${cmd}' in projectPath: '${projectPath}'</span></p>`);
        callback(null, true);
    });
}
ipc.on("start-handler", function (event, fromWindowId, project, tasksWithOptions) {
    $(".js-close").on("click", window.close);
    $(".logo-title").text("Run Tasks");
    console.log("start-handler", fromWindowId, project, tasksWithOptions);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $(".output").css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    let jobs = [];
    for (let taskWithOptions of tasksWithOptions) {
        jobs.push(_.bind(startTask, [fromWindowId, project, taskWithOptions]));
    }
    console.log("jobs", jobs);
    async.seq(...jobs)(true, function (err, foo) {
        console.log("result", foo);
        if (!err) {
            setTimeout(function () {
                window.close();
            }, 5000);
        }
    });
});
function onCheckTasks(event, parentWindowId, tasks, currentApplicationDirectory, debug = false) {
    $(".js-close").on("click", window.close);
    $(".logo-title").text("Check Tasks");
    console.log("start-handler", parentWindowId, tasks, currentApplicationDirectory);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $(".output").css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    let results = [];
    for (let task of tasks) {
        results.push(checkTaskOk(task, currentApplicationDirectory));
    }
    const fromWindow = BrowserWindow.fromId(parentWindowId);
    fromWindow.webContents.send('check-tasks-done', results);
    if (!debug) {
        setTimeout(function () {
            window.close();
        }, 5000);
    }
}
function onVerifyAll(event, parentWindowId, userDir, projectsPath, debug = false) {
    let output = $(".output");
    $(".js-close").on("click", window.close);
    $(".logo-title").text("Verify data schemata");
    outputHandler(`<br/>start of onVerifyAll: ${parentWindowId}, ${userDir}, ${projectsPath}, ${debug}`, "info");
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $(output).css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    verifySettingsStorageFile(userDir, outputHandler);
    verifyProjectStorageFile(userDir, outputHandler);
    verifyCredentialsFiles(projectsPath, outputHandler);
    verifyProjectSpecFiles(projectsPath, outputHandler);
    if (!debug) {
        setTimeout(function () {
            window.close();
        }, 10000);
    }
}
function onDeployApp(parentWindowId, absolutePath, applicationId, version, debug = false) {
    let cmdTemplate = `gcloud app deploy app.yaml --project ${applicationId} --version ${version} --no-promote --quiet`;
    proc = spawn(cmdTemplate, { "cwd": absolutePath, "shell": true });
    proc.stdout.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stderr.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.on('close', function (code) {
        outputHandler(`Deployment of app finished with status: ${code}`, "info");
        BrowserWindow.fromId(parentWindowId).webContents.send('refresh-versions');
        if (!debug) {
            setTimeout(function () {
                window.close();
            }, 5000);
        }
    });
}
function onDeployIndexes(parentWindowId, absolutePath, applicationId, debug = false) {
    let cmdTemplate = `gcloud app deploy index.yaml --project ${applicationId} --quiet`;
    proc = spawn(cmdTemplate, { "cwd": absolutePath, "shell": true });
    proc.stdout.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stderr.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.on('close', function (code) {
        console.log('closing code: ' + code);
        BrowserWindow.fromId(parentWindowId).webContents.send('refresh-versions');
        if (!debug) {
            setTimeout(function () {
                window.close();
            }, 5000);
        }
    });
}
function onMigrateVersion(parentWindowId, absolutePath, applicationId, version, debug = false) {
    let output = $(".output");
    let cmdTemplate = `gcloud app versions migrate ${version} --project ${applicationId} --quiet`;
    proc = spawn(cmdTemplate, { "cwd": absolutePath, "shell": true });
    proc.stdout.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stderr.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stdout.on("error", function () {
        console.log("stdout error...");
    });
    proc.stderr.on("error", function () {
        console.log("stderr error...");
    });
    proc.stdin.on("error", function () {
        console.log("stdin error...");
    });
    proc.on('close', function (code) {
        console.log('closing code: ' + code);
        BrowserWindow.fromId(parentWindowId).webContents.send('refresh-versions');
        if (!debug) {
            setTimeout(function () {
                window.close();
            }, 5000);
        }
    });
}
ipc.on("start-deploy", function (event, parentWindowId, absolutePath, applicationId, version) {
    $(".js-close").on("click", window.close);
    $("title").text(`ViUR control - deployment of ${applicationId}`);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $(".output").css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    onDeployApp(parentWindowId, absolutePath, applicationId, version);
});
ipc.on("start-update-indexes", function (event, parentWindowId, absolutePath, applicationId) {
    $(".js-close").on("click", window.close);
    $("title").text(`ViUR control - updating indexes of ${applicationId}`);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $(".output").css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    onDeployIndexes(parentWindowId, absolutePath, applicationId);
});
ipc.on("start-migrate-version", function (event, parentWindowId, absolutePath, applicationId, version) {
    $(".js-close").on("click", window.close);
    $("title").text(`ViUR control - migration ${applicationId} to new version ${version}`);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $(".output").css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    onMigrateVersion(parentWindowId, absolutePath, applicationId, version);
});
function addProject(newProjectName, parentWindowId) {
    let output = $(".output");
    let projectsDirectory = settingsStorage.get("projects_directory", "");
    let newProjectFolderAbspath = path.join(projectsDirectory, newProjectName);
    if (fs.existsSync(newProjectFolderAbspath)) {
        $(output).append(`${newProjectFolderAbspath} allready exists -> aborting...`).animate({ scrollTop: 9999 });
        return false;
    }
    let tpl = `git clone --branch develop -v https://github.com/viur-framework/base.git "${newProjectName}"`;
    $(output).append(tpl);
    let proc = exec(tpl, { "shell": true, "cwd": projectsDirectory });
    proc.stdout.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stderr.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.on('close', (code) => {
        outputHandler(`git clone succeeded with code ${code}`, "info");
        if (code === 0) {
            outputHandler(`now let's start configuring your new viur project...`, "info");
            let proc2 = exec(`python clean-base.py -A "${newProjectName}-viur"`, { "cwd": newProjectFolderAbspath });
            proc2.stdout.on("data", (chunk) => {
                let data = chunk.toString();
                if (data) {
                    outputHandler(data);
                }
            });
            proc2.stderr.on("data", (chunk) => {
                let data = chunk.toString();
                if (data) {
                    outputHandler(data);
                }
            });
            proc2.on('close', function (code) {
                outputHandler(`configuring finished with code ${code}`);
                if (code === 0) {
                    outputHandler(`We are done are. Going to include your new viur project in the projects list...`);
                    BrowserWindow.fromId(parentWindowId).webContents.send('scan-new-project', newProjectName);
                    setTimeout(function () {
                        window.close();
                    }, 1500);
                }
            });
        }
    });
}
function onCheckGcloudUpdate(event, parentWindowId, debug = false) {
    let cmdTemplate = `gcloud --format json components update`;
}
function onUpdateGcloud(event, parentWindowId) {
    $(".js-close").on("click", window.close);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    let output = $(".output");
    $(output).css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    let cmdTemplate = `gcloud --quiet components update`;
    let proc = exec(cmdTemplate);
    proc.stdout.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stderr.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.on('close', (code) => {
        if (code === 0) {
            BrowserWindow.fromId(parentWindowId).webContents.send('request-update-gcloud-response', true);
            setTimeout(function () {
                window.close();
            }, 1500);
        }
    });
}
function onCheckAppengineStatus(event, parentWindowId, applicationId, debug = false) {
    $(".js-close").on("click", window.close);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    let output = $(".output");
    $(output).css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    let cmdTemplate = `gcloud --format json app describe --project ${applicationId}`;
    exec(cmdTemplate, function (error, stdout, stderr) {
        const fromWindow = BrowserWindow.fromId(parentWindowId);
        if (error) {
            console.log("gcloud app describe: error", error);
            fromWindow.webContents.send("request-app-regions-response", applicationId, false);
        }
        try {
            let stdoutData = stdout.toString();
            console.log("fd output:", stdoutData);
            let rawData = JSON.parse(stdoutData);
            console.log("describe status", rawData);
            fromWindow.webContents.send("request-check-appengine-status-response", applicationId, true);
        }
        catch (err) {
            fromWindow.webContents.send("request-check-appengine-status-response", applicationId, false);
        }
        if (debug) {
            setTimeout(function () {
                window.close();
            }, 5000);
        }
    });
}
function onGetDomainMappings(event, parentWindowId, applicationIds, debug = false) {
    $(".js-close").on("click", window.close);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    let output = $(".output");
    $("title").text(`ViUR control - fetching regions`);
    $(output).css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    console.log("onGetDomainMappings", applicationIds);
    const fromWindow = BrowserWindow.fromId(parentWindowId);
    let domainMappings = domainMappingsStorage.get("data");
    if (!domainMappings) {
        domainMappings = { "domainMappings": {}, "lastFetched": null };
    }
    let result = {};
    for (let applicationId of applicationIds) {
        let cmdTemplate = `gcloud --format json app domain-mappings list --project ${applicationId}`;
        $(output).append(`<p class="output-line"><span class="loglevel info">used command: </span>${cmdTemplate}</p>`);
        try {
            let stdout = execSync(cmdTemplate);
            let rawData1 = JSON.parse(stdout.toString());
            console.log("app regions output:", rawData1);
            domainMappings.domainMappings[applicationId] = rawData1;
            result[applicationId] = rawData1;
        }
        catch (err) {
            console.log("error happened while fetching domain mappings", err);
        }
    }
    fromWindow.webContents.send("request-domain-mappings-response", result);
    domainMappings.lastFetched = moment().format('YYYY-MM-DD HH:mm:ss');
    domainMappingsStorage.set("data", domainMappings);
    if (debug) {
        setTimeout(function () {
            window.close();
        }, 5000);
    }
}
function onGcloudAuthStatus(event, parentWindowId, debug = false) {
    $(".js-close").on("click", window.close);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    let output = $(".output");
    $("title").text(`ViUR control - fetching gcloud authorized accounts`);
    $(output).css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    console.log("onGetAppengineRegions");
    let cmdTemplate = `gcloud --format json auth list`;
    $(output).append(`<p class="output-line"><span class="loglevel info">used command: </span>${cmdTemplate}</p>`);
    const fromWindow = BrowserWindow.fromId(parentWindowId);
    exec(cmdTemplate, function (error, stdout, stderr) {
        if (error) {
            fromWindow.webContents.send("request-gcloud-auth-status-response", false, null, error.toString());
            return;
        }
        fromWindow.webContents.send("request-gcloud-auth-status-response", true, JSON.parse(stdout), "");
        setTimeout(function () {
            window.close();
        }, 5000);
    });
}
function onGetAppengineRegions(event, parentWindowId) {
    $(".js-close").on("click", window.close);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    let output = $(".output");
    $("title").text(`ViUR control - fetching regions`);
    $(output).css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    console.log("onGetAppengineRegions");
    let cmdTemplate = `gcloud --format json app regions list`;
    $(output).append(`<p class="output-line"><span class="loglevel info">used command: </span>${cmdTemplate}</p>`);
    const fromWindow = BrowserWindow.fromId(parentWindowId);
    exec(cmdTemplate, function (error, stdout, stderr) {
        if (error) {
            console.log("cloud app regions list", error);
            return;
        }
        try {
            let rawData1 = JSON.parse(stdout.toString());
            let sortedRegions = rawData1.sort((a, b) => {
                if (a.region < b.region)
                    return -1;
                if (a.region > b.region)
                    return 1;
                return 0;
            });
            console.log("app regions output:", error, rawData1);
            let lastFetched = moment().format('YYYY-MM-DD HH:mm:ss');
            let regions = {
                "regions": rawData1, "lastFetched": lastFetched,
            };
            regionsStorage.set("data", regions);
            fromWindow.webContents.send("request-app-regions-response", regions);
        }
        catch (err) {
            fromWindow.webContents.send("request-app-regions-response", null);
        }
        setTimeout(function () {
            window.close();
        }, 5000);
    });
}
function onCreateAppengine(event, parentWindowId, applicationId, region, debug = false) {
    console.log("onCreateAppengine", parentWindowId, applicationId, region, debug);
    $(".js-close").on("click", window.close);
    let output = $(".output");
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $("title").text(`ViUR control - create project ${applicationId} in region ${region}`);
    $(output).css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    let cmdTemplate = `gcloud app create --region=${region} --project ${applicationId}`;
    $(output).append(`<p class="output-line"><span class="loglevel info">used command: </span>${cmdTemplate}</p>`);
    proc = spawn(cmdTemplate, { "shell": true });
    proc.stdout.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.stderr.on("data", (chunk) => {
        let data = chunk.toString();
        if (data) {
            outputHandler(data);
        }
    });
    proc.on('close', function (code) {
        console.log('closing code: ' + code);
        BrowserWindow.fromId(parentWindowId).webContents.send('request-create-appengine-success', applicationId);
        if (!debug) {
            setTimeout(function () {
                window.close();
            }, 5000);
        }
    });
}
ipc.on("add-project", function (event, newProjectName, parentWindowId) {
    console.log("on add-Project", newProjectName);
    let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
    let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
    $("title").text(`ViUR control - add new project ${newProjectName}`);
    $(".output").css({
        "color": foregroundColor,
        "background-color": backgroundColor
    });
    addProject(newProjectName, parentWindowId);
});
ipc.on("request-check-appengine-status", onCheckAppengineStatus);
ipc.on("request-get-appengine-regions", onGetAppengineRegions);
ipc.on("request-create-appengine", onCreateAppengine);
ipc.on("request-get-domain-mappings", onGetDomainMappings);
ipc.on("check-tasks", onCheckTasks);
ipc.on("verify-all", onVerifyAll);
ipc.on("request-update-gcloud", onUpdateGcloud);
ipc.on("request-gcloud-auth-status", onGcloudAuthStatus);
