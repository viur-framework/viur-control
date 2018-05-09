"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const $ = require('jquery');
const fs = require('fs');
const path = require('path');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const ipc = require('electron').ipcRenderer;
const remote = require("electron").remote;
const storage = new ElectronStorage({ "name": "settings" });
let parentWindowId;
let frozenAppPath = remote.getGlobal('process').env['frozenAppPath'];
exports.settingsTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/settings.mustache")).toString();
renderer.parse(exports.settingsTemplate);
ipc.on("load-settings", function (event, fromWindowId) {
    console.log("settings", storage.store);
    parentWindowId = fromWindowId;
    if (!storage.get("terminal_background_color")) {
        storage.set("terminal_background_color", "#000000");
    }
    if (!storage.get("terminal_foreground_color")) {
        storage.set("terminal_foreground_color", "#00ff00");
    }
    $(".settings-ul").append(renderer.render(exports.settingsTemplate, storage.store));
    $(".js-settings-paths").on('click', function (event) {
        let name = $(event.currentTarget).prop("name");
        ipc.send('select-directory-dialog', name);
    });
    $(".js-settings-terminal-colors").on('change', function (event) {
        let name = $(event.currentTarget).prop("name");
        let value = $(event.currentTarget).val();
        console.log("js-settings-terminal-colors", name, value);
        ipc.send('output-color-changed', name, value);
    });
    $(".js-settings-strings").on('keyup', function (event) {
        let name = $(event.currentTarget).prop("name");
        let value = $(event.currentTarget).val();
        console.log("js-settings-strings", name, value);
        ipc.send('settings-string-changed', name, value);
    });
    $(".js-open-documentation").on("click", function (event) {
        let view = $(event.currentTarget).data("view");
        ipc.send("request-documentation", view);
    });
    $(".js-close").on("click", window.close);
});
ipc.on('projects_directory', function (event, path) {
    console.log("set new projects-directory");
    $("#projects-directory").val(path);
});
ipc.on('gcloud_tool_path', function (event, path) {
    console.log("set new gcloud-directory");
    $("#gcloud-path").val(path);
});
ipc.on('label_icon_repository', function (event, path) {
    console.log("set new labels-path");
    $("#labels-path").val(path);
    BrowserWindow.fromId(parentWindowId).webContents.send('rescan-labels');
});
