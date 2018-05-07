"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

const $ = require('jquery');
const fs = require('fs');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const vcLogStorage = new ElectronStorage({"name": "vcLog"});
const ipc = require('electron').ipcRenderer;
import {plainToClass} from "class-transformer";

const vcLogEntriesTemplate = fs.readFileSync("assets/templates/vclog_entries.mustache").toString();
renderer.parse(vcLogEntriesTemplate);


enum VcLogEntryStatus {
	STARTED = "Started",
	SUCCESS = "Success",
	WARNING = "Warning",
	ERROR = "Error"
}

class VcLogEntry {
	creationdate: string;
	method: string;
	command: string;
	status: VcLogEntryStatus;
	msg: string;

	constructor(creationdate: string, method : string, command: string, status : VcLogEntryStatus, msg : string) {
		this.creationdate = creationdate;
		this.method = method;
		this.command = command;
		this.status = status;
		this.msg = msg;
	}
}

let logEntries: Array<VcLogEntry>;
let parentWindowId;

function clear() {
	logEntries = [];
	vcLogStorage.clear();
	$(".output").empty();
}

function addEntry(ev: Event, entry: VcLogEntry) {
		console.log("addEntry: ", ev, entry);
		logEntries.unshift(plainToClass(VcLogEntry, entry));
		$(".output").prepend(renderer.render(vcLogEntriesTemplate, {vclogEntries: [entry]}));
		BrowserWindow.fromId(parentWindowId).webContents.send('vclog-entry-count', logEntries.length);
}

function getAllFormated(ev: Event) {
		$(".output").html(renderer.render(vcLogEntriesTemplate, {vclogEntries: logEntries}));
}

function initVcLogs(event, pWindowId) {
	clear();
	parentWindowId = pWindowId;
	$(".js-close").on("click", function() {
		BrowserWindow.fromId(parentWindowId).webContents.send('request-vclogger-hide');
	});
}

ipc.on("vclog-init", initVcLogs);
ipc.on("vclog-clear", clear);
ipc.on("vclog-add-entry", addEntry);
ipc.on("vclog-get-all-formated", getAllFormated);
