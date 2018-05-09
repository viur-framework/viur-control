"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import {settingsTemplate} from "./settings";
import {setup_wizard} from "./installWizard";

const $ = require('jquery');
const fs = require('fs');
const path = require('path');
const renderer = require('mustache');
const electronPositioner = require('electron-positioner');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const ipc = require('electron').ipcRenderer;
const remote = require('electron').remote;
const storage = new ElectronStorage({"name": "settings"});

const tab0Template = fs.readFileSync("assets/templates/first_steps_0.mustache").toString();
const tab1Template = fs.readFileSync("assets/templates/first_steps_1.mustache").toString();
const tab2Template = fs.readFileSync("assets/templates/first_steps_2.mustache").toString();
renderer.parse(tab0Template);
renderer.parse(tab1Template);
renderer.parse(tab2Template);

let thisWindowId: null | number;
let frozenAppPath = remote.getGlobal('process').env['frozenAppPath'];

function activateTab0(event: Event) {
	console.log("activateTab0");
	$(".js-project-content.active").removeClass("active");
	$(".tab-item.active").removeClass("active");
	$(".js-firststart-workspace-tab").addClass("active");
	$(".js-firststart-workspace-content").addClass("active");
	$(".sidebar").addClass("sidebar-hidden");
}

function activateTab1(event: Event) {
	console.log("activateTab1");
	$(".js-project-content.active").removeClass("active");
	$(".tab-item.active").removeClass("active");
	$(".js-firststart-installwizard-tab").addClass("active");
	$(".js-firststart-installwizard-content").addClass("active");
	$(".sidebar").removeClass("sidebar-hidden");
	console.log("before setup ui");
	setup_wizard(frozenAppPath);
}

function activateTab2(event: Event) {
	console.log("activateTab2");
	$(".js-project-content.active").removeClass("active");
	$(".tab-item.active").removeClass("active");
	$(".js-firststart-new-project-tab").addClass("active");
	$(".js-firststart-new-project-content").addClass("active");
	$(".sidebar").addClass("sidebar-hidden");
}

function addProject() {
	let projectAddButton = $(".js-project-add");
	let newProjectName = $(projectAddButton).val();
	$(projectAddButton).val("");
	const modalPath = path.join('file://', __dirname, '../views/taskWindow.html');
	let win = new BrowserWindow({
		frame: true,
		title: `ViUR control - Add Project ${newProjectName}`,
		show: false
	});
	let positioner = new electronPositioner(win);
	positioner.move('bottomLeft');
	win.on('close', function () {
		win = null
	});
	win.loadURL(modalPath);
	win.show();
	win.webContents.on('did-finish-load', function () {
		console.log("Add Project", newProjectName);
		win.show();
		win.webContents.send('add-project', newProjectName, thisWindowId)
	});
}

function startWindow(fromWindowId: number, firstStartWindowId: number, debugMode: boolean = false) {
	console.log("on first-start", firstStartWindowId);
	thisWindowId = firstStartWindowId;

	$(".js-settings-ul").append(renderer.render(tab0Template, storage.store));

	$(".logo-title").text(`First Start`);
	$(".js-close").on("click", window.close);

	$(".js-settings-paths").on('click', function (event: Event) {
		let name = $(event.currentTarget).prop("name");
		ipc.send('select-directory-dialog', name);
	});

	$(".js-tab0-next").on("click", activateTab1);
	$(".js-firststart-workspace-tab").on("click", activateTab0);
	$(".js-firststart-installwizard-tab").on("click", activateTab1);
	$(".js-firststart-new-project-tab").on("click", activateTab2);
	$(".js-add-project").on("click", addProject);
}

ipc.on("first-start", startWindow);

ipc.on('projects_directory', function (event: Event, path: string) {
	$("#projects-directory").val(path);
});

