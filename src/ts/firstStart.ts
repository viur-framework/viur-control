"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

const $ = require('jquery');
const fs = require('fs');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const vcLogStorage = new ElectronStorage({"name": "vcLog"});
const ipc = require('electron').ipcRenderer;

function startWindow(fromWindowId: number, mainWindowId: number, debugMode: boolean = false) {
	console.log("on first-start", mainWindowId);
	$(".logo-title").text(`First Start`);
	$(".js-close").on("click", window.close);

	$(".js-settings-paths").on('click', function (event: Event) {
		let name = $(event.currentTarget).prop("name");
		ipc.send('select-directory-dialog', name);
	});
}

console.log("firstStart loaded");

ipc.on("first-start", startWindow);

ipc.on('projects_directory', function (event: Event, path: string) {
	console.log("set new projects-directory");
	$("#projects-directory").val(path);
});

