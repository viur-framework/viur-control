"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="node_modules/@types/electron-store/index.d.ts" />
const $ = require('jquery');
const fs = require('fs');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const vcLogStorage = new ElectronStorage({ "name": "vcLog" });
const ipc = require('electron').ipcRenderer;
const class_transformer_1 = require("class-transformer");
const vcLogEntriesTemplate = fs.readFileSync("assets/templates/vclog_entries.mustache").toString();
renderer.parse(vcLogEntriesTemplate);
var VcLogEntryStatus;
(function (VcLogEntryStatus) {
    VcLogEntryStatus["STARTED"] = "Started";
    VcLogEntryStatus["SUCCESS"] = "Success";
    VcLogEntryStatus["WARNING"] = "Warning";
    VcLogEntryStatus["ERROR"] = "Error";
})(VcLogEntryStatus || (VcLogEntryStatus = {}));
class VcLogEntry {
    constructor(creationdate, method, command, status, msg) {
        this.creationdate = creationdate;
        this.method = method;
        this.command = command;
        this.status = status;
        this.msg = msg;
    }
}
let logEntries;
function clear() {
    logEntries = [];
    vcLogStorage.clear();
    $(".output").empty();
}
function addEntry(ev, entry) {
    console.log("addEntry: ", ev, entry);
    logEntries.push(class_transformer_1.plainToClass(VcLogEntry, entry));
    $(".output").append(renderer.render(vcLogEntriesTemplate, { vclogEntries: [entry] }));
}
function getAllFormated(ev) {
    $(".output").html(renderer.render(vcLogEntriesTemplate, { vclogEntries: logEntries }));
}
function initVcLogs() {
    clear();
    $(".js-close").on("click", window.close);
}
ipc.on("vclog-init", initVcLogs);
ipc.on("vclog-clear", clear);
ipc.on("vclog-add-entry", addEntry);
ipc.on("vclog-get-all-formated", getAllFormated);
//# sourceMappingURL=vcLogger.js.map