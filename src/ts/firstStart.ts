"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import {settingsTemplate} from "./settings";

const $ = require('jquery');
const fs = require('fs');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const ipc = require('electron').ipcRenderer;
const storage = new ElectronStorage({"name": "settings"});

let tab0Template = fs.readFileSync("assets/templates/first_steps_0.mustache").toString();
let tab1Template = fs.readFileSync("assets/templates/first_steps_1.mustache").toString();
let tab2Template = fs.readFileSync("assets/templates/first_steps_2.mustache").toString();
renderer.parse(tab0Template);
renderer.parse(tab1Template);
renderer.parse(tab2Template);

function activateTab0(event: Event) {
	$(".js-project-content.active").removeClass("active");
	$(".tab-item.active").removeClass("active");
	$(".js-firststart-workspace-tab").addClass("active");
	$(".js-firststart-workspace-content").addClass("active");
	$(".sidebar").addClass("sidebar-hidden");
}

function activateTab1(event: Event) {
	$(".js-project-content.active").removeClass("active");
	$(".tab-item.active").removeClass("active");
	$(".js-firststart-installwizard-tab").addClass("active");
	$(".js-firststart-installwizard-content").addClass("active");
	$(".sidebar").removeClass("sidebar-hidden");
}

function activateTab2(event: Event) {
	$(".js-project-content.active").removeClass("active");
	$(".tab-item.active").removeClass("active");
	$(".js-firststart-new-project-tab").addClass("active");
	$(".js-firststart-new-project-content").addClass("active");
	$(".sidebar").addClass("sidebar-hidden");
}

function startWindow(fromWindowId: number, mainWindowId: number, debugMode: boolean = false) {
	console.log("on first-start", mainWindowId);

	$(".js-settings-ul").append(renderer.render(tab0Template, storage.store));

	$(".logo-title").text(`First Start`);
	$(".js-close").on("click", window.close);

	$(".js-settings-paths").on('click', function (event: Event) {
		let name = $(event.currentTarget).prop("name");
		ipc.send('select-directory-dialog', name);
	});

	$(".js-tab0-next").on("click", activateTab1)
	$(".js-firststart-workspace-tab").on("click", activateTab0);
	$(".js-firststart-installwizard-tab").on("click", activateTab1);
	$(".js-firststart-new-project-tab").on("click", activateTab2);
}

ipc.on("first-start", startWindow);

ipc.on('projects_directory', function (event: Event, path: string) {
	$("#projects-directory").val(path);
});

