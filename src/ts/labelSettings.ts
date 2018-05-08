"use strict";
/// <reference path="node_modules/@types/node/index.d.ts" />
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import {LabelInterface} from "./mainWindowRenderer";
const $ = require('jquery');
const fs = require('fs-extra');
const path = require('path');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const settingsStorage = new ElectronStorage({"name": "settings"});
const electron = require('electron');
const ipc = electron.ipcRenderer;
const BrowserWindow = electron.remote.BrowserWindow;
export const settingsTemplate = fs.readFileSync("assets/templates/label_settings.mustache").toString();
renderer.parse(settingsTemplate);
let parentWindowId: number;
let labelList: Array<LabelInterface>;
let labelCache = new Map();
let dirty = false;


function initWindow(event: Event, fromWindowId: number, allLabels: Array<LabelInterface>, appPath: string) {
	console.log("initWindow", fromWindowId, allLabels);
	labelList = allLabels;
	parentWindowId = fromWindowId;

	let labelIconRepository = settingsStorage.get("label_icon_repository");
	if (!labelIconRepository) {
		labelIconRepository = path.join(appPath, "label-icons");
		settingsStorage.set("label_icon_repository", labelIconRepository);
	}

	if (!fs.existsSync(labelIconRepository)) {
		fs.mkdirSync(labelIconRepository);
	}

	$(".js-label-repository").text(labelIconRepository);

	let counter: number = 0;
	for (let entry of labelList) {
		entry.id = counter;
		labelCache.set(counter, entry);
		counter += 1;
	}

	$(".label-settings-ul").append(renderer.render(settingsTemplate, {"allLabels": allLabels}));
	$(".js-close").on("click", function () {
		if (dirty) {
			BrowserWindow.fromId(parentWindowId).send("save-labels", labelList);
			dirty = false;
		}
		window.close();
	});

	$(".js-label-settings-path").on('click', function (event: Event) {
		let id = $(event.currentTarget).prop("id");
		ipc.send('select-label-icon-dialog', id);
	});

	$(".js-save").on("click", function (event: Event) {
		BrowserWindow.fromId(parentWindowId).send("save-labels", labelList);
		dirty = false;
	});

	$(".js-open-documentation").on("click", function (event: Event) {
		let view = $(event.currentTarget).data("view");
		ipc.send("request-documentation", view);
	});
}

ipc.on("open-label-settings", initWindow);

ipc.on('label-icon-selected', function (event: Event, id: string, filePath: string) {
	console.log("label-icon-selected", id, path);
	let labelIconRepository = settingsStorage.get("label_icon_repository");
	let destPath = path.join(labelIconRepository, path.basename(filePath));
	console.log("compare paths:", filePath, destPath);
	if (destPath !== labelIconRepository) {
		fs.copySync(filePath, destPath);
	}
	let labelInput = $(`#${id}`);
	$(labelInput).val(destPath);
	$(labelInput).parent().find(".js-label-icon").prop("src", destPath);
	labelCache.get(Number.parseInt(id)).path = destPath;
	dirty = true;
});
