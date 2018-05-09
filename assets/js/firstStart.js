"use strict";
const $ = require('jquery');
const fs = require('fs');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const ipc = require('electron').ipcRenderer;
function startWindow(fromWindowId, mainWindowId, debugMode = false) {
    console.log("on first-start", mainWindowId);
    $(".logo-title").text(`First Start`);
    $(".js-close").on("click", window.close);
    $(".js-settings-paths").on('click', function (event) {
        let name = $(event.currentTarget).prop("name");
        ipc.send('select-directory-dialog', name);
    });
}
console.log("firstStart loaded");
ipc.on("first-start", startWindow);
ipc.on('projects_directory', function (event, path) {
    console.log("set new projects-directory");
    $("#projects-directory").val(path);
});
