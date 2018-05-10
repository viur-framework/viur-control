"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="node_modules/@types/electron-store/index.d.ts" />
const $ = require('jquery');
const fs = require('fs');
const path = require('path');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const electron = require('electron');
const BrowserWindow = electron.remote.BrowserWindow;
const remote = electron.remote;
const vcLogStorage = new ElectronStorage({ "name": "vcLog" });
const ipc = require('electron').ipcRenderer;
const class_transformer_1 = require("class-transformer");
let frozenAppPath = remote.getGlobal('process').env['frozenAppPath'];
const vcLogEntriesTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/vclog_entries.mustache")).toString();
renderer.parse(vcLogEntriesTemplate);
var VcLogEntryStatus;
(function (VcLogEntryStatus) {
    VcLogEntryStatus["STARTED"] = "Started";
    VcLogEntryStatus["SUCCESS"] = "Success";
    VcLogEntryStatus["WARNING"] = "Warning";
    VcLogEntryStatus["ERROR"] = "Error";
})(VcLogEntryStatus = exports.VcLogEntryStatus || (exports.VcLogEntryStatus = {}));
class VcLogEntry {
    constructor(creationdate, method, command, status, msg) {
        this.creationdate = creationdate;
        this.method = method;
        this.command = command;
        this.status = status;
        this.msg = msg;
    }
}
exports.VcLogEntry = VcLogEntry;
let logEntries;
let parentWindowId;
function clear() {
    logEntries = [];
    vcLogStorage.clear();
    $(".output").empty();
}
function addEntry(ev, entry) {
    console.log("addEntry: ", ev, entry);
    logEntries.unshift(class_transformer_1.plainToClass(VcLogEntry, entry));
    $(".output").prepend(renderer.render(vcLogEntriesTemplate, { vclogEntries: [entry] }));
    BrowserWindow.fromId(parentWindowId).webContents.send('vclog-entry-count', logEntries.length);
}
function getAllFormated(ev) {
    $(".output").html(renderer.render(vcLogEntriesTemplate, { vclogEntries: logEntries }));
}
function initVcLogs(event, pWindowId) {
    clear();
    parentWindowId = pWindowId;
    $(".js-close").on("click", function () {
        BrowserWindow.fromId(parentWindowId).webContents.send('request-vclogger-hide');
    });
}
ipc.on("vclog-init", initVcLogs);
ipc.on("vclog-clear", clear);
ipc.on("vclog-add-entry", addEntry);
ipc.on("vclog-get-all-formated", getAllFormated);
//# sourceMappingURL=vcLogger.js.map