"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

const $ = require('jquery');
const fs = require('fs');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
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


function clear() {
	logEntries = [];
	vcLogStorage.clear();
	$(".output").empty();
}

function addEntry(ev: Event, entry: VcLogEntry) {
		console.log("addEntry: ", ev, entry);
		logEntries.push(plainToClass(VcLogEntry, entry));
		$(".output").append(renderer.render(vcLogEntriesTemplate, {vclogEntries: [entry]}));
}

function getAllFormated(ev: Event) {
		$(".output").html(renderer.render(vcLogEntriesTemplate, {vclogEntries: logEntries}));
}

function initVcLogs() {
	clear();
	$(".js-close").on("click", window.close);
}

ipc.on("vclog-init", initVcLogs);
ipc.on("vclog-clear", clear);
ipc.on("vclog-add-entry", addEntry);
ipc.on("vclog-get-all-formated", getAllFormated);
