"use strict";

/// <reference path="node_modules/electron/electron.d.ts" />
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import {VcLogEntryInterface, VcLogEntryStatus} from "./vcLogger";
import {GcloudApplicationIdEntryInterface} from "./projectLib";
import {LabelInternalInterface, LabelInternalInterfaceSorter, StoredLabelInterface} from "./labelSettingsLib";


const fs = require('fs');
const path = require('path');
const renderer = require('mustache');
const electron = require('electron');
const $ = require('jquery');
const BrowserWindow = electron.remote.BrowserWindow;
const remote = electron.remote;
const ipc = electron.ipcRenderer;
const shell = electron.shell;
const moment = require('moment');
const ElectronStorage = require('electron-store');

const url = require('url');
const settingsStorage = new ElectronStorage({"name": "settings"});
const versionsStorage = new ElectronStorage({"name": "versions"});
const projectStorage = new ElectronStorage({"name": "projects"});
const labelIconsStorage = new ElectronStorage({"name": "labels"});
const regionsStorage = new ElectronStorage({"name": "regions"});
const gcloudProjectStorage = new ElectronStorage({"name": "gcloudProjects"});
const electronPositioner = require('electron-positioner');
const Positioner = require('electron-positioner');
const {defaultFlagsTpl} = require('./viur_instance_start');

const projectsByInternalId: Map<string, ProjectInterface> = new Map();
const projects: Array<ProjectInterface> = [];
const versionsCache = new Map();
const subprocessIds = new Map();
const projectWindows = new Map();
const gcloudProjectCache = new Map();
const labelIconCache = new Map();
const usedServerPortMap = new Map();
const usedAdminPortMap = new Map();

let frozenAppPath = remote.getGlobal('process').env['frozenAppPath'];

// needed templates
const projectItemTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_list_item.mustache")).toString();
const projectControlsTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_development.mustache")).toString();
const projectConfigTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_configuration.mustache")).toString();
const projectRemoteTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_deployment.mustache")).toString();
const projectVersionsTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_versions.mustache")).toString();
const projectApplicationTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_applications_row.mustache")).toString();
const projectConfigApplicationsTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_config_applications_list.mustache")).toString();
const projectCredentialsRow = fs.readFileSync(path.join(frozenAppPath, "assets/templates/project_credentials_row.mustache")).toString();
const regionsTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/regions.mustache")).toString();
const domainMappingTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/domain_mappings.mustache")).toString();
renderer.parse(projectControlsTemplate);
renderer.parse(projectItemTemplate);
renderer.parse(projectConfigTemplate);
renderer.parse(projectRemoteTemplate);
renderer.parse(projectVersionsTemplate);
renderer.parse(projectConfigApplicationsTemplate);
renderer.parse(projectApplicationTemplate);
renderer.parse(projectCredentialsRow);
renderer.parse(regionsTemplate);
renderer.parse(domainMappingTemplate);


// mutable data
let thisWindowId: null | number;

export interface VersionsInterface {
	lastFetched: Date;
	applicationId: string;
	versions: Array<Object>
}

export interface AppengineDirectoryInterface {
	value: string;
	checked: boolean;
}

export interface ApplicationIdInterface {
	value: string;
	checked: boolean;
	labels?: null | Array<LabelInternalInterface>;
}

export interface CredentialEntryInterface {
	applicationId: string;
	username: string;
	password: string;
}

export interface ProjectIconInterface {
	url: string;
}

export interface ProjectTaskInterface {
	id: string;
}


export interface ProjectInterface {
	absolutePath: string;
	directoryName: string;
	appengineDirectories: Array<AppengineDirectoryInterface>;
	applicationIds: Array<ApplicationIdInterface>;
	credentials: Array<CredentialEntryInterface>;
	internalId: string;
	serverPort: number;
	adminPort: number;
	custom_devserver_cmd: string;
	tasks: Array<ProjectTaskInterface>;
	projectIcon: ProjectIconInterface;
	created: boolean;
	running?: boolean;
	regions?: Array<Object>;
}


export interface GcloudApplicationIdsInterface {
	gcloudProjectIds: Array<GcloudApplicationIdEntryInterface>;
}

export interface AppengineRegionsInterface {
	lastFetched: Date;
	result: Array<Object>;
}

/** This will hold an array of existing gcloud app/project ids got either from gcloudProjectStorage or from gcloud itself
 *
 */
let gcloudApplicationIds: GcloudApplicationIdsInterface;

let currentInternalId: string;
let debug = false;
let appPath: string;
let labelIconList: Array<LabelInternalInterface> = [];
let isGcloudAuthorized: boolean = false;
let loggerEntryCount: number = 0;

/** this variable will hold a cloned instance of the project we're currently have active.
 *  Changes to that object will not survive a project change,
 *  so make your changes to the original project object found in projects or projectsByInternalId
 */
let currentProject: null | ProjectInterface;

let loggerWindow: null | typeof BrowserWindow;
let loggerWindowId: number;

function deepClone(obj: Object) {
	return JSON.parse(JSON.stringify(obj));
}

function updateProjectSpecFile(internalId: string) {
	let project = projectsByInternalId.get(internalId);
	let specPath = path.join(project.absolutePath, 'project-spec.json');
	let projectSpec;
	if (fs.existsSync(specPath)) {
		projectSpec = JSON.parse(fs.readFileSync(specPath.toString()));
	} else {
		projectSpec = {};
	}

	let applicationIds = [];
	for (let item of project.applicationIds) {
		applicationIds.push({checked: item.checked, value: item.value});
	}

	projectSpec.projectIcon = project.projectIcon;
	projectSpec.tasks = project.tasks;
	projectSpec.applicationIds = applicationIds;

	fs.writeFile(specPath, JSON.stringify(projectSpec, function (key, value) {
		return value
	}, 2), 'utf8', function (err: Error) {
		console.log("project spec saved");
	});
}

function projectSorter(a: any, b: any) {
	return ($(b).data('name').toLowerCase()) < ($(a).data('name').toLowerCase()) ? 1 : -1;
}

function prepareProject(project: ProjectInterface, initials: string, isNew: boolean = false) {
	// console.log("prepareProject", project, isNew);

	projectsByInternalId.set(project.internalId, project);
	projects.push(project);

	let projectClone = deepClone(project);
	if (projectClone.projectIcon) {
		projectClone.projectIcon.url = path.join(projectClone.absolutePath, projectClone.projectIcon.url);
	}

	projectClone.newVersion = moment().format(`YYYY-MM-DD-[${initials}-01]`);
	let tmp = renderer.render(projectItemTemplate, projectClone);
	let listGroupElement = $(".list-group");
	$(listGroupElement).append(tmp);
	if (isNew) {
		$(`.list-group-item[data-internal-id="${project.internalId}"]`).addClass("pulse");
	}

	let usedServerPortProject = usedServerPortMap.get(project.serverPort);
	if (usedServerPortProject) {
		let msg = `The project ${project.directoryName} uses an already blocked server port ${project.serverPort} by other project ${usedServerPortProject.directoryName}`;
		console.log(msg);
	} else {
		usedServerPortMap.set(project.serverPort, project);
	}

	let usedAdminPortProject = usedAdminPortMap.get(project.serverPort);
	if (usedAdminPortProject) {
		let msg = `The project ${project.directoryName} uses an already blocked server port ${project.serverPort} by other project ${usedServerPortProject.directoryName}`;
		console.log(msg);
	} else {
		usedAdminPortMap.set(project.serverPort, project);
	}
}

function onIndexesDirtyCheck(currentProject: ProjectInterface) {
	console.log("onIndexesDirtyCheck");
	let win = new BrowserWindow(
		{
			title: `ViUR control - Project Versions`,
			icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
			frame: false,
			show: debug === true
		}
	);
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/scanProjects.html'));
	win.webContents.on('did-finish-load', function () {
		win.webContents.send('indexes-check', thisWindowId, currentProject, debug);
	});
}

function onIndexesDirtyCheckResponse(event: Event, result: boolean) {
	console.log("onIndexesDirtyCheckResponse", result);
	if (result) {
		$(".js-index-yaml-check").html("Index.yaml was changed. Perhaps commit to git and deploy it.").removeClass("icon-check").addClass("icon-eye").css("color", "red");
		$(".ctl-deploy").prop("disabled", true);
	} else {
		$(".js-index-yaml-check").html("Index.yaml is fine").removeClass("icon-eye").addClass("icon-check").css("color", "green");
		$(".ctl-deploy").prop("disabled", false);
	}
}

function loadVersions() {
	console.log("versionsStore", versionsStorage.store);
	Object.keys(versionsStorage.store).forEach(key => {
		versionsCache.set(key, versionsStorage.store[key]);
	});
	console.log("versionsCache", versionsCache);
}

function getProjectVersions(event?: Event, refresh: boolean = false) {
	let myApplicationId = $(".js-project-remote-content .js-selectable-application-id:checked").data("value");
	$(".js-selected-application-id").text(myApplicationId);
	console.log("getProjectVersions", myApplicationId);
	if (!gcloudProjectCache.has(myApplicationId)) {
		addLogEntry(<VcLogEntryInterface> {
			creationdate: moment().format(`YYYY-MM-DD HH:mm`),
			method: `Fetching versions for project with application id '${myApplicationId}'`,
			command: "",
			status: VcLogEntryStatus.ERROR,
			msg: `Stopped: The application/project Id '${myApplicationId}' does not yet exist!`
		});
		return;
	}
	if (myApplicationId) {
		let projectVersions = versionsCache.get(myApplicationId);
		console.log("going to set versions to project", myApplicationId, projectVersions);
		if (!projectVersions || refresh) {
			console.log("projectVersions not found - requesting them");
			let win = new BrowserWindow(
				{
					title: `ViUR control - Project Versions`,
					icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
					frame: false,
					show: debug === true
				}
			);
			win.loadURL(path.join('file://', frozenAppPath, 'assets/views/scanProjects.html'));
			win.webContents.on('did-finish-load', function () {
				console.log("requesting project versions", thisWindowId);
				win.webContents.send('request-versions', thisWindowId, myApplicationId, debug);
			});
		} else {
			onRequestVersionsResponse(event, projectVersions);
		}
	}
}

function toggleDevServer(event: Event) {
	let self = event.currentTarget;
	console.log("startstop button clicked");
	let listGroupItem = $(".list-group-item.active");
	let internalId = $(listGroupItem).data("internal-id");
	let currentProject = projectsByInternalId.get(internalId);
	let applicationId = $(".js-project-local-content .js-selectable-application-id:checked").data("value");
	if ($(self).hasClass("active")) {
		let devServerWindowId = projectWindows.get(internalId);
		let devServerWindow = BrowserWindow.fromId(devServerWindowId);
		$(self).removeClass("active").html("&#9658;");
		$(listGroupItem).find(".js-project-running-status").removeClass("green");
		ipc.send("local-devserver-stopped", currentProject.internalId);
		projectWindows.delete(internalId);
		subprocessIds.delete(internalId);
		setTimeout(function () {
			try {
				devServerWindow.close();
			} catch (err) {
				console.error(err);
			}
		}, 3000);
	} else {
		let devServerWindow = new BrowserWindow(
			{
				title: `ViUR control | log for ${applicationId}`,
				icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
				frame: false,
				show: false,
				width: 1280,
				height: 720
			}
		);
		ipc.send("new-project-window", currentProject.internalId, devServerWindow.id);
		let positioner = new electronPositioner(devServerWindow);
		positioner.move('topLeft');
		devServerWindow.loadURL(path.join('file://', frozenAppPath, 'assets/views/viurInstanceOutput.html'));
		projectWindows.set(internalId, devServerWindow.id);
		console.log("currentWindow", projectWindows);
		$(self).addClass("active").html("&#9724;");
		$(listGroupItem).find(".js-project-running-status").addClass("green");
		devServerWindow.webContents.on('did-finish-load', function () {
			devServerWindow.show();
			console.log("myProject", currentProject);
			devServerWindow.webContents.send('start-instance', currentProject, $(".js-project-local-content .js-selectable-application-id:checked").data("value"), thisWindowId);
		});
	}

	console.log(`#ctl-current-${currentProject.internalId}`);
	$(`.js-devserver-running`).toggleClass("hidden");
}

function addProject() {
	let projectAddButton = $(".js-project-add");
	let newProjectName = $(projectAddButton).val();
	$(projectAddButton).val("");
	const modalPath = path.join('file://', frozenAppPath, 'assets/views/taskWindow.html');
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

function startTasks(event?: Event) {
	console.log("startTasks");
	let tasks = projectsByInternalId.get(currentInternalId).tasks;
	let taskQueue: Array<Object> = [];
	for (let element of $(".js-task-selection:checked")) {
		let taskId: string = $(element).data("id");
		console.log("taskId", taskId, tasks);
		let task;
		for (let myTask of tasks) {
			if (myTask.id === taskId) {
				task = myTask;
				break;
			}
		}

		if (!task) {
			throw Error("task not found!!!");
		}

		let taskArguments = $(element).parents(".js-task").find(".js-task-select");
		let selectedArguments = [];
		for (let argument of taskArguments) {
			console.log("option", argument);
			selectedArguments.push({
				name: $(argument).prop("name"),
				value: $(argument).find("option:selected").val()
			})
		}
		taskQueue.push([task, selectedArguments]);
	}

	console.log("taskQueue", taskQueue);
	if (taskQueue.length === 0) {
		return;
	}

	let win = new BrowserWindow({
		title: `ViUR control - Task Runner`,
		frame: false,
		show: false
	});
	let positioner = new electronPositioner(win);
	positioner.move('bottomLeft');
	let windowId = win.id;
	win.on('close', function () {
		win = null
	});
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		win.show();
		win.webContents.send('start-handler', windowId, currentProject, taskQueue);
	});
}

function reloadApplicationIds() {
	console.log("js-reload-applications-ids request");
	requestGcloudProjects(true);
}

function openLocalInstance(event: Event) {
	event.preventDefault();
	shell.openExternal($(this).attr("href"));
	return false;
}

function openLocalVi(event: Event) {
	event.preventDefault();
	shell.openExternal($(this).attr("href"));
	return false;
}

function openLocalAdminConsole(event: Event) {
	event.preventDefault();
	shell.openExternal($(this).attr("href"));
	return false;
}

function switchToProjectConfigPane() {
	$(".tab-item").removeClass("active");
	$(".js-project-config-tab").addClass("active");
	$(".content").removeClass("active");
	$(".js-project-config-content").addClass("active");
}

function switchToProjectLocalPane() {
	$(".tab-item").removeClass("active");
	$(".js-project-local-tab").addClass("active");
	$(".content").removeClass("active");
	$(".js-project-local-content").addClass("active");
}

function switchToProjectDeploymentPane() {
	$(".tab-item").removeClass("active");
	$(".js-project-remote-tab").addClass("active");
	$(".content").removeClass("active");
	$(".js-project-remote-content").addClass("active");
}

function projectPaneSelected(event: Event, paneId: number) {
	console.log("projectPaneSelected", paneId);
	if (!currentInternalId)
		return;
	switch (paneId) {
		case 0: {
			switchToProjectConfigPane();
			break;
		}
		case 1: {
			switchToProjectLocalPane();
			break;
		}
		case 2: {
			switchToProjectDeploymentPane();
			break;
		}
		default:
			throw Error("undefined paneId fpr projectPaneSelected");
	}
}

function removeApplicationIdFromProject(event: Event) {
	console.log("removeApplicationIdFromProject");
	let applicationId = $(event.currentTarget).data("value");
	let internalId = $(".list-group-item.active").data("internal-id");
	$(`.js-remove-application-id[data-value="${applicationId}"]`).parents(".js-applicationid-row").slideUp().remove();
	let myProject = projectsByInternalId.get(internalId);
	console.log("myProject", myProject);
	for (let ix = 0; ix < myProject.applicationIds.length; ix++) {
		let entry = myProject.applicationIds[ix];
		console.log("entry, applicationId", entry, applicationId);
		if (entry.value === applicationId) {
			console.log("found applicationId to remove");
			myProject.applicationIds.splice(ix, 1);
			projectStorage.set("projects", projects);
			return;
		}
	}
}

function addApplicationIdToProject() {
	console.log("addApplicationIdToProject", projects);
	let internalId = currentInternalId;
	let myProject = projectsByInternalId.get(internalId);
	console.log("internal-id", internalId);
	let applicationId = $("#new-application-id").find("option:selected").val();
	if ($(`.js-selectable-application-id[data-value="${applicationId}"]`).length === 0) {
		let newDataSet = {"value": applicationId, "checked": true};
		console.log("newDataSet", newDataSet);
		let found = false;
		if (myProject.applicationIds.length >= 0) {
			for (let existingApplicationId of myProject.applicationIds) {
				if (existingApplicationId.value === applicationId) {
					found = true;
					existingApplicationId.checked = true;
				} else {
					existingApplicationId.checked = false;
				}
			}
		}
		if (!found) {
			myProject.applicationIds.push(newDataSet);
			currentProject.applicationIds = myProject.applicationIds;
			projectStorage.set("projects", projects);
			amendLabelIcons(myProject);
			$(".js-application-ids").html(renderer.render(projectApplicationTemplate, myProject));
		}
	}
}

function deployProject() {
	let activeAppengineDirectory;
	for (let appengineDirectory of currentProject.appengineDirectories) {
		if (appengineDirectory.checked === true) {
			activeAppengineDirectory = appengineDirectory.value;
		}
	}
	if (!activeAppengineDirectory) {
		activeAppengineDirectory = currentProject.appengineDirectories[0].value;
	}

	let absolutePath = path.join(currentProject.absolutePath, activeAppengineDirectory);
	let version = $(".js-project-remote-content #new-version").val();
	let applicationId = $(".js-project-remote-content.active .js-selectable-application-id:checked").data("value");
	let icon;
	console.log("currentProject", currentProject);

	// TODO: this search for icon part is really mb specific and should be discussed if really needed
	for (let applicationId of currentProject.applicationIds) {
		if (applicationId.checked) {
			for (let label of applicationId.labels) {
				if (label.title.startsWith("status") && label.path) {
					icon = label.path;
					break;
				}
			}
		}
	}

	ipc.send('open-information-dialog', absolutePath, applicationId, version, icon);
}

function createAppengineInstance() {
	let applicationId = $(".js-project-remote-content.active .js-selectable-application-id:checked").data("value");
	let win = new BrowserWindow({
		frame: true,
		title: `ViUR control - Creating appengine instance ${applicationId}`,
		icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
		show: debug
	});
	win.on('close', function () {
		win = null
	});
	let region = $(".js-regions-selector option:selected").val();
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		win.show();
		win.webContents.send('request-create-appengine', thisWindowId, applicationId, region, debug);
	});
}

function checkAppengineInstance(event: null | Event, refresh = true) {
	let applicationId: string = $(".content.active").find(".js-selectable-application-id:checked").data("value");
	console.log("checkAppengineInstance", applicationId);
	let validApplicationId = false;
	let projectToCheck = gcloudProjectCache.get(applicationId);
	if (projectToCheck) {
		validApplicationId = true;
	}

	let result = !refresh && !validApplicationId;
	if (result) {
		console.log("checkAppengineInstance: going to terminate this and go on error condition");
		onRequestCheckAppengineStatusResponse(null, applicationId, !result, refresh);
		return;
	}

	let win = new BrowserWindow({
		frame: true,
		title: `ViUR control - checking appengine instance ${applicationId}`,
		icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
		show: false
	});
	win.on('close', function () {
		win = null
	});
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		if (debug) {
			win.show();
		}
		win.webContents.send('request-check-appengine-status', thisWindowId, applicationId, debug);
	});
}

function checkGcloudAuthStatus() {
	let win = new BrowserWindow({
		frame: true,
		title: `ViUR control - Check gcloud auth status`,
		icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
		show: false
	});
	win.on('close', function () {
		win = null
	});
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		win.webContents.send('request-gcloud-auth-status', thisWindowId, debug);
	});
}

function checkGcloudAuthStatusResponse(event: Event, status: boolean, accounts: null | Array<Object>, errors: null | string) {
	isGcloudAuthorized = status;
	console.log("checkGcloudAuthStatusResponse", status, accounts, errors);
}

function updateIndexes() {
	let internalId = $(".list-group-item.active").data("internal-id");
	let currentProject = projectsByInternalId.get(internalId);
	let activeAppengineDirectory;
	for (let appengineDirectory of currentProject.appengineDirectories) {
		if (appengineDirectory.checked === true) {
			activeAppengineDirectory = appengineDirectory.value;
		}
	}
	if (!activeAppengineDirectory) {
		activeAppengineDirectory = currentProject.appengineDirectories[0].value;
	}

	let absolutePath = path.join(currentProject.absolutePath, activeAppengineDirectory);
	let applicationId = $(".js-project-remote-content.active .js-selectable-application-id:checked").data("value");

	let win = new BrowserWindow({
		frame: true,
		title: `ViUR control - Deploying ${applicationId}`,
		icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
		show: false
	});
	win.on('close', function () {
		win = null
	});
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		win.show();
		win.webContents.send('start-update-indexes', thisWindowId, absolutePath, applicationId, debug);
	});
}

function migrateVersion() {
	let internalId = $(".list-group-item.active").data("internal-id");
	let currentProject = projectsByInternalId.get(internalId);
	let activeAppengineDirectory;
	for (let appengineDirectory of currentProject.appengineDirectories) {
		if (appengineDirectory.checked === true) {
			activeAppengineDirectory = appengineDirectory.value;
		}
	}
	if (!activeAppengineDirectory) {
		activeAppengineDirectory = currentProject.appengineDirectories[0].value;
	}

	let absolutePath = path.join(currentProject.absolutePath, activeAppengineDirectory);
	let version = $(".js-project-remote-content #new-version").val();
	let applicationId = $(".js-project-remote-content.active .js-selectable-application-id:checked").data("value");

	let win = new BrowserWindow({
		frame: true,
		title: `ViUR control - Deploying ${applicationId}`,
		icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
		show: false
	});
	win.on('close', function () {
		win = null
	});
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		win.show();
		win.webContents.send('start-migrate-version', thisWindowId, absolutePath, applicationId, version, debug);
	});
}

function searchProject(event: KeyboardEvent) {
	console.log("searchProject");
	let self = event.currentTarget;
	let valThis = $(self).val().toLowerCase();
	$('.list-group-item').each(function () {
		let text = $(this).text().toLowerCase();
		(text.indexOf(valThis) !== -1) ? $(this).show() : $(this).hide();
	});
	let keyCode = event.keyCode;
	if (keyCode === 38) {
		if (!currentInternalId) {
			let element = $('.list-group-item:visible')[0];
			$(element).trigger("click");
			console.log("up first", element);
		} else {
			let element = $(`.list-group-item[data-internal-id="${currentInternalId}"]`);
			let allVisibleElements = $('.list-group-item:visible');
			let total = $(allVisibleElements).length;
			let index = $(allVisibleElements).index(element);
			let prevIndex = (((index - 1) % total) + total) % total;
			let thisElement = $(allVisibleElements).eq(prevIndex).trigger("click");
			let container = $(".list-group");
			$(container).scrollTop(
				$(thisElement).offset().top - $(container).offset().top + $(container).scrollTop()
			);
			console.log("previous", total, index, prevIndex);
		}
	} else if (keyCode === 40) {
		if (!currentInternalId) {
			let element = $('.list-group-item:visible')[0];
			$(element).trigger("click");
			console.log("down first", element);
		} else {
			let element = $(`.list-group-item[data-internal-id="${currentInternalId}"]`);
			let allVisibleElements = $('.list-group-item:visible');
			let total = $(allVisibleElements).length;
			let index = $(allVisibleElements).index(element);
			let nextIndex = (((index + 1) % total) + total) % total;
			let thisElement = $(allVisibleElements).eq(nextIndex).trigger("click");
			let container = $(".list-group");
			$(container).scrollTop(
				$(thisElement).offset().top - $(container).offset().top + $(container).scrollTop()
			);
			console.log("next", total, index, nextIndex);
		}
	}
	console.log("keycode", keyCode);
}

function checkVersion() {
	let valThis = $("#new-version").val();
	$(".js-version-warning").addClass("hidden");
	$(".version-row").removeClass("highlighted-row");
	$('.js-version-id').each(function () {
		let text = $(this).text();
		if (text === valThis) {
			$(this).parents(".version-row").addClass("highlighted-row");
			$(".js-version-warning").removeClass("hidden");
		}
	});
	return false;
}

function fillNextVersion(initials?: string) {
	if (!initials) {
		initials = settingsStorage.get("version_developer_sign", "myName");
	}
	console.log("fillNextVersion", initials);
	$("#new-version").val(moment().format(`YYYY-MM-DD-[${initials}-01]`));
	checkVersion();
}

function setDefaultApplicationId(event: Event) {
	let applicationId = $(event.currentTarget).data("value");
	let internalId = $(".list-group-item.active").data("internal-id");
	console.log("setDefaultApplicationId", internalId, applicationId);
	$(".js-selectable-application-id").prop("checked", false);
	$(`.js-selectable-application-id[data-value="${applicationId}"]`).prop("checked", true);
	let myProject = projectsByInternalId.get(internalId);
	let count = 0;
	for (let dataSet of myProject.applicationIds) {
		dataSet.checked = (dataSet.value === applicationId);
		currentProject.applicationIds[count].checked = dataSet.checked;
		count += 1;
	}

	projectStorage.set("projects", projects);
	getProjectVersions();
	checkAppengineInstance(null, true);
}

function initLabelIconCache(event?: Event) {
	console.log("initLabelIconCache");
	labelIconCache.clear();
	labelIconList = [];

	// TODO: do we really want to stop here or accept not initialized label icon repos?
	let labelIconRepository = settingsStorage.get("label_icon_repository");
	if (!labelIconRepository) {
		return;
	}

	let storedLabels: Array<StoredLabelInterface> = labelIconsStorage.get("allLabels", []);
	for (let entry of storedLabels) {
		let clone: LabelInternalInterface = {title: entry.title, path: entry.path, id: 0};
		if (clone.path) {
			clone.path = path.join(labelIconRepository, clone.path);
		}
		labelIconList.push(clone);
		labelIconCache.set(clone.title, clone);
	}
	labelIconList.sort(LabelInternalInterfaceSorter);
	console.log("loadLabelCache end");
}

function amendLabelIcons(projectClone: ProjectInterface) {
	let projectApplicationIds = projectClone.applicationIds;
	console.log("amendLabelIcons(): projectApplicationIds", projectApplicationIds);
	for (let projectApplicationIdEntry of projectApplicationIds) {
		projectApplicationIdEntry.labels = [];
		console.log("projectApplicationIdEntry", projectApplicationIdEntry);
		let applicationIdEntry = gcloudProjectCache.get(projectApplicationIdEntry.value);
		if (applicationIdEntry) {
			console.log("applicationIdEntry", applicationIdEntry);
			if (applicationIdEntry) {
				let gcloudProjectLabels = applicationIdEntry.labels;
				if (gcloudProjectLabels) {
					console.log("gcloudProjectLabels", gcloudProjectLabels);
					for (let labelKey in gcloudProjectLabels) {
						let labelValue = gcloudProjectLabels[labelKey];
						let cacheKey = `${labelKey}: ${labelValue}`;
						console.log("label key, value", labelKey, labelValue, cacheKey);
						let icon = labelIconCache.get(cacheKey);
						if (icon) {
							projectApplicationIdEntry.labels.push(icon);
						}
					}
				}
			}
		}
	}
}

function onProjectSelected(event: Event, internalIdOverwrite: string = undefined) {
	let internalId: string;
	$(".list-group-item").removeClass("active");
	if (internalIdOverwrite) {
		internalId = internalIdOverwrite;
		$(`.list-group-item[data-internal-id="${internalId}"]`).addClass("active")
	} else {
		internalId = $(event.currentTarget).data("internal-id");
		$(this).addClass("active");
	}
	currentInternalId = internalId;
	let project = projectsByInternalId.get(internalId);
	console.log("onProjectSelected", currentInternalId, project);
	currentProject = deepClone(project);
	currentProject.running = subprocessIds.has(project.internalId);
	if (!currentProject.custom_devserver_cmd) {
		currentProject.custom_devserver_cmd = defaultFlagsTpl;
	}
	currentProject.regions = regionsStorage.get("data");

	amendLabelIcons(currentProject);
	console.log("onProjectSelected", event, currentProject);

	$(".js-welcome-pane").addClass("hidden");
	$(".js-project-pane").removeClass("hidden");
	// config content
	$(".js-project-config-content").html(renderer.render(projectConfigTemplate, currentProject));
	// local content
	$(".js-project-local-content").html(renderer.render(projectControlsTemplate, currentProject));
	// remote content
	$(".js-project-remote-content").html(renderer.render(projectRemoteTemplate, currentProject));

	$(".js-reload-domain-mappings").on("click", function() {
		onRequestDomainMappings(true);
	});

	getProjectVersions();
	fillNextVersion();
	checkAppengineInstance(null, false);
	onRequestDomainMappings(false);

	$(".js-project-config-all-application-ids").html(renderer.render(projectConfigApplicationsTemplate, gcloudApplicationIds));
	onIndexesDirtyCheck(projectsByInternalId.get(currentInternalId));
}

function onDevserverFlagsChanged(event: Event) {
	console.log("onDevserverFlagsChanged");
	let currentText = $(event.currentTarget).val();
	let myProject = projectsByInternalId.get(currentInternalId);
	if (currentText === defaultFlagsTpl || currentText === "") {
		if (myProject.custom_devserver_cmd) {
			myProject.custom_devserver_cmd = null;
		}
	} else {
		myProject.custom_devserver_cmd = currentText;
	}
	projectStorage.set("projects", projects);
}

function versionLinkClicked(event: any) {
	event.preventDefault();
	shell.openExternal(event.currentTarget.href);
	return false;
}

function requestProjectsScan(refresh: boolean = false) {
	$(".list-group-item").remove();
	if (refresh) {
		$(".js-loading-spinner").removeClass("hidden").find(".spinner-text").text("rescanning projects...");
	} else {
		$(".js-loading-spinner").removeClass("hidden").find(".spinner-text").text("loading projects...");
	}
	let win = new BrowserWindow(
		{
			title: `ViUR control - Projects Scanning`,
			icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
			frame: false,
			show: debug === true
		}
	);
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/scanProjects.html'));
	win.webContents.on('did-finish-load', function () {
		if (refresh) {
			console.log("on start rescanning projects", thisWindowId);
			win.webContents.send('start-rescanning', thisWindowId, subprocessIds, debug);
		} else {
			console.log("on start scanning projects", thisWindowId);
			win.webContents.send('start-scanning', thisWindowId, debug);
		}
	});
}

function requestDiscoverLabelIcons(event: Event) {
	console.log("requestDiscoverLabelIcons");
	let win = new BrowserWindow(
		{
			title: `ViUR control - Label Settings`,
			icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
			show: false,
			frame: false
		}
	);
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/labelSettings.html'));
	win.webContents.on('did-finish-load', function () {
		win.show();
		win.webContents.send('request-discover-label-icons', thisWindowId, loggerWindowId, false);
	})
}

function requestScanNewProject(event: Event, projectName: string) {
	console.log("requestScanNewProject", projectName);
	let win = new BrowserWindow(
		{
			title: `ViUR control - Projects Scanning`,
			icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
			show: false
		}
	);
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/scanProjects.html'));
	win.webContents.on('did-finish-load', function () {
		win.webContents.send('scan-new-project', projectName, thisWindowId);
	})
}

function requestGcloudProjects(update: boolean = false) {
	let win = new BrowserWindow(
		{
			title: `ViUR control - fetch gcloud projects`,
			icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
			frame: false,
			show: debug
		}
	);
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/scanProjects.html'));
	win.webContents.on('did-finish-load', function () {
		console.log("requesting gcloud projects", thisWindowId);
		win.webContents.send('request-gcloud-projects', thisWindowId, update, debug);
	});
}

function requestGetAppengineRegions() {
	let win = new BrowserWindow(
		{
			title: `ViUR control - fetch appengine regions`,
			icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
			frame: false,
			show: true
		}
	);
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		console.log("requesting appengine regions", thisWindowId);
		win.webContents.send('request-get-appengine-regions', thisWindowId);
	});
}

function onRequestDomainMappings(refresh: boolean = false) {
	// TODO: implement caching/refresh feature
	let applicationIds: Array<string> = [];

	let localAppIds = [];
	for (let item of currentProject.applicationIds) {
		if (!gcloudProjectCache.has(item.value)) {
			localAppIds.push(item.value);
		} else {
			applicationIds.push(item.value)
		}
	}

	if (localAppIds.length > 0) {
		addLogEntry(<VcLogEntryInterface> {
			creationdate: moment().format(`YYYY-MM-DD HH:mm`),
			method: `fetching domain mapping for project`,
			command: "",
			status: VcLogEntryStatus.ERROR,
			msg: `The application/project Ids '${localAppIds}' do not (yet) exist and were removed from fetching`
		});
	}



	let win = new BrowserWindow(
		{
			title: `ViUR control - fetch appengine regions`,
			icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
			frame: false,
			show: false
		}
	);
	win.on('close', function () {
		win = null;
	});
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		if (debug) {
			win.show();
		}
		console.log("requesting appengine regions", thisWindowId);
		win.webContents.send('request-get-domain-mappings', thisWindowId, applicationIds, refresh, debug);
	});
}

function onRequestDomainMappingsResponse(event: Event, result: any) {
	console.log("onRequestDomainMappingsResponse", event, result);
	for (let applicationId of Object.keys(result)) {
		let domainMappings = {domainMappings: result[applicationId]};
		let element = $(`.js-domain-mappings[data-application-id="${applicationId}"]`);
		console.log("element", element);
		let renderedHtml = renderer.render(domainMappingTemplate, domainMappings);
		console.log("renderedHtml", renderedHtml);
		$(element).html(renderedHtml);
	}
}

function onRequestSubprocessIds() {
	ipc.send("request-subprocess-ids");
}

function onRequestSubprocessIdsResponse(event: Event, subprocessIdsFromMain: Array<Array<any>>, projectWindowsFromMain: Array<Array<any>>) {
	console.log("onRequestSubprocessIdsResponse", subprocessIdsFromMain, projectWindowsFromMain);
	subprocessIds.clear();
	for (let [internalId, processId] of subprocessIdsFromMain) {
		subprocessIds.set(internalId, processId);
	}

	projectWindows.clear();
	for (let [internalId, windowId] of projectWindowsFromMain) {
		projectWindows.set(internalId, windowId);
	}
	console.log("renderer subprocessIds", subprocessIds, projectWindows);
	requestProjectsScan();
}

function onInternalVerify(event: Event) {
	console.log("onInternalVerify");
	let verifyWindow = new BrowserWindow({
		icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png'),
		frame: false,
		width: 600,
		height: 300,
		show: false,
	});
	verifyWindow.loadURL(url.format({
		pathname: path.join(frozenAppPath, 'assets/views/taskWindow.html'),
		protocol: 'file:',
		slashes: true
	}));
	let positioner = new Positioner(verifyWindow);
	positioner.move('center');
	verifyWindow.on('closed', function (event: Event) {
		verifyWindow = null
	});

	verifyWindow.webContents.on('did-finish-load', function () {
		// if (debug) {
		verifyWindow.show();
		// }
		verifyWindow.webContents.send("verify-all", thisWindowId, appPath, settingsStorage.get("projects_directory"), debug);
	});
}

function onRequestTaskChecks() {
	console.log("onRequestTaskChecks");
	let activeAppengineDirectory: string;
	for (let appengineDirectory of currentProject.appengineDirectories) {
		if (appengineDirectory.checked === true) {
			activeAppengineDirectory = appengineDirectory.value;
		}
	}
	if (!activeAppengineDirectory) {
		activeAppengineDirectory = currentProject.appengineDirectories[0].value;
	}

	activeAppengineDirectory = path.join(settingsStorage.get("projects_directory"), activeAppengineDirectory);

	let win = new BrowserWindow({
		title: `ViUR control - Task Runner`,
		frame: false,
		show: debug === true
	});
	let positioner = new electronPositioner(win);
	positioner.move('bottomLeft');
	win.on('close', function () {
		win = null
	});

	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.webContents.on('did-finish-load', function () {
		if (debug) {
			win.show();
		}
		console.log('before sending check-tasks', thisWindowId, currentProject.tasks, activeAppengineDirectory);
		win.webContents.send('check-tasks', thisWindowId, currentProject.tasks, activeAppengineDirectory, debug);
	});
}

function onServerPortChanged(event: Event) {

	// TODO: accept dialog needed here, what to do with former project port
	let portValue = parseInt($(event.currentTarget).val());
	console.log("onServerPortChanged", portValue);
	let myProject = projectsByInternalId.get(currentInternalId);
	let usedServerPortProject = usedServerPortMap.get(portValue);
	if (usedServerPortProject) {
		new Notification(`The project ${myProject.directoryName} uses an already blocked server port ${myProject.serverPort} by other project ${usedServerPortProject}. Change other project server port to 8000`);
		usedServerPortProject.serverPort = 8000
	}

	usedServerPortMap.delete(myProject.serverPort);
	myProject.serverPort = portValue;
	usedServerPortMap.set(portValue, myProject);
	projectStorage.set("projects", projects);
}

function onAdminPortChanged(event: Event) {
	// TODO: accept dialog needed here, what to do with former project port
	let portValue = parseInt($(event.currentTarget).val());
	console.log("onAdminPortChanged", portValue);
	let myProject = projectsByInternalId.get(currentInternalId);
	let usedAdminPortProject = usedAdminPortMap.get(portValue);
	if (usedAdminPortProject) {
		new Notification(`The project ${myProject.directoryName} uses an already blocked admin port ${myProject.adminPort} by other project ${usedAdminPortProject}. Change other project server port to 8005`);
		usedAdminPortProject.adminPort = 8005
	}
	usedServerPortMap.delete(myProject.adminPort);
	myProject.adminPort = portValue;
	usedAdminPortMap.set(portValue, myProject);
	projectStorage.set("projects", projects);
}

function onRequestTaskChecksDone(event: Event, results: Array<boolean>) {
	console.log("onRequestTaskChecksDone", results);
	let count = 0;
	let taskRows = $(".js-task");
	for (let result of results) {
		if (result !== null) {
			$(taskRows[count]).find(".js-task-check-status").html(result === true ? "&times;" : "-").prop("title", "task check present");
		} else {
			$(taskRows[count]).find(".js-task-check-status").html("&quest;").prop("title", "task check not specified");
		}
		count += 1;
	}
}

function onRemoveIcon() {
	let currentProjectListItem = $(".list-group-item.active");
	let internalId = $(currentProjectListItem).data("internal-id");
	let project = projectsByInternalId.get(internalId);
	delete project.projectIcon;
	$(".js-project-icon").val("");
	projectStorage.set("projects", projects);
	$(currentProjectListItem).find(".js-project-icon-display").css("background-image", "url('../img/icon-vc-64.png')");
	updateProjectSpecFile(internalId);
}

function onBackToHome() {
	$(".js-welcome-pane").removeClass("hidden");
	$(".js-project-pane").addClass("hidden");
	$(".list-group-item").removeClass("active");
}

function onOpenDocumentation(event: Event) {
	let view = $(event.currentTarget).data("view");
	ipc.send("request-documentation", view);
}

function toggleVcLogger(event: Event) {
	let isLogVisible = loggerWindow.isVisible();
	console.log("toggleVcLogger", isLogVisible);
	if (isLogVisible) {
		loggerWindow.hide();
	} else {
		loggerWindow.show();
	}
}

function hideVcLogger(event: Event) {
	loggerWindow.hide();
}

function startVcLogger(event: Event) {
	loggerWindow = new BrowserWindow({
		title: `ViUR control - Logging`,
		frame: false,
		show: false
	});

	remote.getGlobal('process').env['loggerWindowId'] = loggerWindowId = loggerWindow.id;

	let positioner = new electronPositioner(loggerWindow);
	positioner.move('topLeft');
	loggerWindow.on('close', function () {
		loggerWindow = null
	});

	loggerWindow.loadURL(path.join('file://', frozenAppPath, 'assets/views/vclogOutput.html'));
	$(".js-open-control-log").on("click", toggleVcLogger);
	loggerWindow.webContents.on('did-finish-load', function () {
		loggerWindow.webContents.send("vclog-init", thisWindowId);
	});
}

function onWindowReady(event: Event, mainWindowId: number, userDir: string, debugMode: boolean = false) {
	startVcLogger(null);
	thisWindowId = mainWindowId;
	debug = debugMode;
	appPath = userDir;

	// console.log("onWindowReady", mainWindowId, debugMode);
	// console.log("user env:", process.env);
	let paneDiv = $(".pane");
	let windowContent = $(".window-content");
	let remoteContentDiv = $(".js-project-remote-content");
	$(paneDiv).on("click", ".js-selectable-application-id", setDefaultApplicationId);
	$(paneDiv).on("click", ".js-get-versions", function (event: Event) {
		getProjectVersions(event, true)
	});
	$(paneDiv).on('click', ".ctl-server-toggle", toggleDevServer);
	$(paneDiv).on("click", ".js-reload-applications-ids", reloadApplicationIds);
	$(paneDiv).on('click', ".server-open-toggle", openLocalInstance);
	$(paneDiv).on('click', ".startvi-toggle", openLocalVi);
	$(paneDiv).on('click', ".ctl-button-openadmin", openLocalAdminConsole);
	$(paneDiv).on("click", ".js-project-icon", function () {
		let internalId = $(".list-group-item.active").data("internal-id");
		ipc.send("open-project-icon-dialog", internalId);
	});

	$(paneDiv).on("click", ".js-remove-icon", onRemoveIcon);
	$(paneDiv).on("keyup", '#new-version', checkVersion);
	$(".js-project-config-tab").on("click", switchToProjectConfigPane);
	$(".js-project-local-tab").on("click", switchToProjectLocalPane);
	$(".js-project-remote-tab").on("click", switchToProjectDeploymentPane);
	$(".list-group").on("click", ".list-group-item", onProjectSelected);
	$(".content").on("click", ".js-add-application-id", addApplicationIdToProject);
	$(".js-project-search").on("keyup", searchProject);
	$(".js-add-project").on("click", addProject);

	$(remoteContentDiv).on('click', ".js-deploy-selected-app", deployProject);
	$(remoteContentDiv).on('click', ".js-get-appengine-regions", requestGetAppengineRegions);
	$(remoteContentDiv).on('click', ".js-create-appengine", createAppengineInstance);
	$(remoteContentDiv).on('click', ".js-check-appengine-status", checkAppengineInstance);
	$(remoteContentDiv).on('click', ".js-update-indexes", updateIndexes);
	$(remoteContentDiv).on('click', ".js-migrate-version", migrateVersion);
	$(remoteContentDiv).on('click', "a.js-version-link", versionLinkClicked);
	$(paneDiv).on('click', ".js-remove-application-id", removeApplicationIdFromProject);
	$(".js-home").on("click", onBackToHome);
	$(".js-open-settings").on("click", function () {
		ipc.send("request-settings");
	});
	$(windowContent).on("click", ".js-open-documentation", onOpenDocumentation);
	$(windowContent).on("click", ".js-open-viur-documentation", onOpenViurSite);
	$(".js-console-log-open-button").on("click", onOpenConsoleLog);
	$(".js-console-dashboard-open-button").on("click", onOpenConsoleDashboard);
	$(windowContent).on("click", ".js-start-tasks", startTasks);
	$(windowContent).on("click", ".js-select-all-tasks", function (event: Event) {
		let checked = $(event.currentTarget).prop("checked");
		$(".js-task-selection").prop("checked", checked);
	});
	$(windowContent).on("click", ".js-task-selection", function (event: Event) {
		let active = $(".js-task-selection:checked").length;
		let total = $(".js-task-selection").length;
		$(".js-select-all-tasks").prop("checked", total == active);
	});

	$(windowContent).on("click", ".js-check-tasks", onRequestTaskChecks);
	$(windowContent).on("change", "#custom-devserver-cmd", onDevserverFlagsChanged);
	$(windowContent).on("change", "#real-server-port", onServerPortChanged);
	$(windowContent).on("change", "#real-admin-port", onAdminPortChanged);

	checkGcloudAuthStatus();
	onRequestSubprocessIds();
	initLabelIconCache();
	requestGcloudProjects();
	loadVersions();
}

function onDeploymentDialogAnswer(event: Event, index: number, absolutePath: string, applicationId: string, version: string) {
	if (index !== 0) {
		return;
	}

	let win = new BrowserWindow({
		frame: true,
		title: `ViUR control - Deploying ${applicationId}`,
		icon: path.join(frozenAppPath, 'assets/img/icon-vc-64.png')
	});
	win.on('close', function () {
		win = null
	});
	win.loadURL(path.join('file://', frozenAppPath, 'assets/views/taskWindow.html'));
	win.show();
	win.webContents.on('did-finish-load', function () {
		win.webContents.send('start-deploy', thisWindowId, absolutePath, applicationId, version, debug)
	})
}


// function saveLabels(customLabelList: undefined | Array<LabelInternalInterface> = undefined) {
// 	let workingList: Array<LabelInternalInterface>;
// 	if (customLabelList) {
// 		workingList = customLabelList;
// 	} else {
// 		workingList = labelList;
// 	}
// 	console.log("saveLabels", workingList);
//
// 	workingList.sort(LabelInternalInterfaceSorter);
//
// 	console.log("saveLabels", resultList);
// 	labelStorage.set("allLabels", resultList);
//
// 	if (resultList) {
// 		labelList = resultList;
// 		labelCache.clear();
// 		for (let entry of labelList) {
// 			if (entry.path) {
// 				entry.path = path.join(labelIconRepository, entry.path);
// 			}
// 			labelCache.set(entry.title, entry);
// 		}
// 		if (currentInternalId) {
// 			// TODO: a complete new recall of onProjectSelected for changed label?
// 			onProjectSelected(null, currentInternalId);
// 		}
// 	}
//
// 	console.log("labels should be saved");
// }



/**
 * Scans all applicationId entries for labels, find label icons, builds an internal cache map and saves to label storage of changed
 */
function initGcloudProjectCache() {
	console.log("initGcloudProjectCache");
	gcloudProjectCache.clear();

	for (let applicationIdEntry of gcloudApplicationIds.gcloudProjectIds) {
		gcloudProjectCache.set(applicationIdEntry.name, applicationIdEntry);
	}
}


function onRequestGcloudProjectsResponse(event: Event, data: GcloudApplicationIdsInterface, update?: boolean) {
	console.log("onRequestGcloudProjectsResponse", data);
	gcloudApplicationIds = data;
	initGcloudProjectCache();
	let applicationIdList = $(".js-project-config-all-application-ids");
	console.log("applicationId selector", applicationIdList, data, gcloudApplicationIds.gcloudProjectIds.length);
	if (gcloudApplicationIds && gcloudApplicationIds.gcloudProjectIds.length > 0) {
		let renderedHtml = renderer.render(projectConfigApplicationsTemplate, data);
		// console.log("renderedHtml from gcloud project list", renderedHtml);
		$(applicationIdList).html(renderedHtml);
	}
}

function onProjectsRefresh() {
	$(".list-group-item").remove();
	projectsByInternalId.clear();
	$(".js-welcome-pane").removeClass("hidden");
	$(".js-project-pane").addClass("hidden");
	requestProjectsScan(true);
}

function onProjectsFound(event: Event, incomingProjects: Array<ProjectInterface>) {
	console.log("onProjectsFound", incomingProjects.length);
	let initials = settingsStorage.get("version_developer_sign", "myName");
	let listGroupItems = $(".list-group-item");
	$(listGroupItems).remove();
	projectsByInternalId.clear();
	for (let incomingProject of incomingProjects) {
		prepareProject(incomingProject, initials);
	}

	let sortedData = $(listGroupItems).sort(projectSorter);
	$(listGroupItems).remove();
	let listGroupElement = $(".list-group");
	$(listGroupElement).append(sortedData);
	$(".js-loading-spinner").addClass("hidden");
}

function onProjectFound(event: Event, project: ProjectInterface, isNew: boolean) {
	console.log("onProjectFound", project, isNew);
	let initials = settingsStorage.get("version_developer_sign", "myName");

	prepareProject(project, initials, isNew);
	if (isNew) {
		let listGroupItems = $(".list-group-item");
		let sortedData = $(listGroupItems).sort(projectSorter);
		$(listGroupItems).remove();
		let listGroupElement = $(".list-group");
		$(listGroupElement).append(sortedData);
		let thisElement = $(`.list-group-item[data-internal-id="${project.internalId}"]`);
		$(listGroupElement).scrollTop(
			$(thisElement).offset().top - $(listGroupElement).offset().top + $(listGroupElement).scrollTop()
		);
		$(thisElement).trigger("click");
	}
}

function onCredentialsFound(event: Event, applicationId: string, username: string, password: string) {
	console.log("credentials-found", applicationId, username, password);
	let internalId = $(".list-group-item.active").data("internal-id");
	let project = projectsByInternalId.get(internalId);
	let newEntry = {"applicationId": applicationId, "username": username, "password": password};
	console.log("creds", project.credentials);
	project.credentials.push(newEntry);
	projectStorage.set("projects", projects);
	$(".js-credentials").append(renderer.render(projectCredentialsRow, newEntry));
	let credsPath = path.join(project.absolutePath, "credentials.json");
	let credentials;
	if (fs.existsSync(credsPath)) {
		credentials = JSON.parse(fs.readFileSync(credsPath).toString());
		if (credentials) {
			let found = false;
			for (let item of credentials) {
				if (newEntry.applicationId === item.applicationId) {
					found = true;
					item.username = newEntry.username;
					item.password = newEntry.password;
					break;
				}
			}
			if (!found) {
				credentials.push(newEntry);
			}
		} else {
			credentials = [newEntry];
		}
	} else {
		credentials = [newEntry];
	}
	fs.writeFileSync(credsPath, JSON.stringify(credentials, (key, value) => {
		return value
	}, 2));
}

function onRequestVersionsResponse(event: Event, versions: VersionsInterface) {
	console.log("onRequestVersionsResponse", versions);
	$(".js-project-versions").html(renderer.render(projectVersionsTemplate, versions));
	$(".js-versions-last-fetched").text(versions.lastFetched);
	checkVersion();
}

function onSettingsStringChanged(event: Event, name: string, value: string) {
	console.log("onSettingsStringChanged", name, value);
	if (name === 'version_developer_sign') {
		fillNextVersion(value);
	}
}

function onProjectIconChanged(event: Event, internalId: string, iconPath: string) {
	console.log("onProjectIconChanged", internalId, iconPath, currentProject);
	let project = projectsByInternalId.get(internalId);
	if (!project) {
		throw new Error(`project not found by internalId: ${internalId}`);
	}

	console.log("project?", project, currentProject);

	if (!iconPath.startsWith(currentProject.absolutePath)) {
		addLogEntry(<VcLogEntryInterface> {
			creationdate: moment().format(`YYYY-MM-DD HH:mm`),
			method: "Changing the the project icon",
			command: "",
			status: VcLogEntryStatus.ERROR,
			msg: `You tried to use an icon outside of the project! This is not allowed`
		});
		return;
	}

	project.projectIcon = currentProject.projectIcon = {"url": path.relative(currentProject.absolutePath, iconPath)};

	projectStorage.set("projects", projects);
	$(".js-project-icon").val(currentProject.projectIcon.url);
	$(".list-group-item.active").find(".js-project-icon-display").css("background-image", `url('${iconPath}')`);
	updateProjectSpecFile(currentInternalId);
}

function onLocalDevServerStarted(event: Event, internalId: string, processId: number) {
	console.log('onLocalDevServerStartfed', processId);
	subprocessIds.set(internalId, processId);
}

function onLocalDevServerMinimized(event: Event, internalId: string) {
	console.log('onLocalDevServerStarted', internalId);
	let currentWindow = projectWindows.get(internalId);
	if (currentWindow) {
		let devServerWindow = BrowserWindow.fromId(currentWindow);
		devServerWindow.minimize();
	}
}

function onOpenViurSite(event: Event) {
	event.preventDefault();
	shell.openExternal("https://www.viur.is");
	return false;
}

function onOpenConsoleLog(event: Event) {
	event.preventDefault();
	let applicationId = $(".js-project-content.active .js-selectable-application-id:checked").data("value");
	shell.openExternal(`https://console.cloud.google.com/logs/viewer?project=${applicationId}`);
	return false;
}

function onOpenConsoleDashboard() {
	event.preventDefault();
	let applicationId = $(".js-project-content.active .js-selectable-application-id:checked").data("value");
	shell.openExternal(`https://console.cloud.google.com/home?project=${applicationId}`);
	return false;
}

function onRescanProjectsDone() {
	console.log("rescan done", currentInternalId);
	let listGroupItems = $(".list-group-item");
	let sortedData = $(listGroupItems).sort(projectSorter);
	$(listGroupItems).remove();
	let listGroupElement = $(".list-group");
	$(listGroupElement).append(sortedData);
	$(".js-loading-spinner").addClass("hidden");
	setTimeout(function () {
		$(`.list-group-item[data-internal-id="${currentInternalId}"]`).trigger("click");
	}, 50);
}

function onRefreshVersions() {
	console.log("refresh-versions called");
	setTimeout(function () {
		console.log("refresh-versions timeout fired");
		getProjectVersions(null, true);  // refreshing after version migration
	}, 2500);
}

function onRescanLabels(event: Event) {
	initLabelIconCache();
	initGcloudProjectCache();
}


function onCatchErrors(event: Event, taskName: string, error: string) {
	console.log("onCatchingErrors", taskName, error);
}

function onRequestCheckAppengineStatusResponse(event: Event, applicationId: string, result: boolean, refresh: boolean = true) {
	console.log("onRequestCheckAppengineStatusResponse", event, applicationId, result, refresh);
	let myProject = projectsByInternalId.get(currentInternalId);
	myProject.created = result;
	if (!result) {
		let prefix = (refresh) ? "" : "Stopped: ";
		$(".js-appengine-uncreated-section").removeClass("hidden");
		$(".js-appengine-created-section").addClass("hidden");
		$(".js-console-button").addClass("hidden");
		addLogEntry(<VcLogEntryInterface> {
			creationdate: moment().format(`YYYY-MM-DD HH:mm`),
			method: "Checking appengine instance status",
			command: "",
			status: VcLogEntryStatus.ERROR,
			msg: `${prefix}The application/project Id '${applicationId}' does not exists on gcloud.`
		});
	} else {
		$(".js-appengine-uncreated-section").addClass("hidden");
		$(".js-appengine-created-section").removeClass("hidden");
		$(".js-console-button").removeClass("hidden");
	}

	// TODO: can we optimize that with a map lookup and or only storing on success?
	let applicationIdList = gcloudProjectStorage.get("data");
	console.log("applicationIdList", applicationIdList);
	for (let entry of applicationIdList.gcloudProjectIds) {
		if (entry.name == applicationId) {
			entry.created = result;
			break;
		}
	}
	gcloudProjectStorage.set("data", applicationIdList);
}

function onRequestAppengineRegionsResponse(event: Event, result: AppengineRegionsInterface) {
	console.log("onRequestAppengineRegionsResponse", result);
	let regionSelector = $(".js-project-remote-content").find(".js-regions-selector");
	console.log("regionSelector", regionSelector);
	$(regionSelector).html(renderer.render(regionsTemplate, result));
	$(".js-regions-last-fetched").text(result.lastFetched);
}

function onRequestCreateAppengineResponse(event: Event, applicationId: string) {
	console.log("onRequestCreateAppengineResponse");
	onRequestCheckAppengineStatusResponse(event, applicationId, true);
}

function addLogEntry(logEntry: VcLogEntryInterface) {
	let button = $(".js-open-control-log");
	$(button).removeClass("class^='vclog-marker-']").addClass("vclog-marker-" + logEntry.status);
	loggerWindow.webContents.send("vclog-add-entry", logEntry);
}

function onVcLoggerEntryCount(event: Event, totalCount: number) {
	loggerEntryCount = totalCount;
	let element = $(".js-vclog-entry-count");
	$(element).text(totalCount.toString());
	if (totalCount > 0) {
		$(element).addClass("is-error");
	}
}

ipc.on('indexes-check-response', onIndexesDirtyCheckResponse);
ipc.on('local-devserver-started', onLocalDevServerStarted);
ipc.on('local-devserver-minimized', onLocalDevServerMinimized);
ipc.on('refreshing-projects', onProjectsRefresh);
ipc.on('project-found', onProjectFound);
ipc.on("projects-found", onProjectsFound);
ipc.on("error-in-window", onCatchErrors);
ipc.on("window-ready", onWindowReady);
ipc.on("request-gcloud-projects-response", onRequestGcloudProjectsResponse);
ipc.on('deployment-dialog-answer', onDeploymentDialogAnswer);
ipc.on('request-versions-response', onRequestVersionsResponse);
ipc.on('refresh-versions', onRefreshVersions);
ipc.on('settings-string-changed', onSettingsStringChanged);
ipc.on('credentials-found', onCredentialsFound);
ipc.on('scan-new-project', requestScanNewProject);
ipc.on('project-icon-changed', onProjectIconChanged);
ipc.on("rescan-projects-done", onRescanProjectsDone);
ipc.on("request-subprocess-ids-response", onRequestSubprocessIdsResponse);
ipc.on("open-refresh-labels", requestDiscoverLabelIcons);
ipc.on("rescan-labels", onRescanLabels);
ipc.on("request-check-appengine-status-response", onRequestCheckAppengineStatusResponse);
ipc.on("request-app-regions-response", onRequestAppengineRegionsResponse);
ipc.on("request-create-appengine-success", onRequestCreateAppengineResponse);
ipc.on("project-pane-selected", projectPaneSelected);
ipc.on("check-tasks-done", onRequestTaskChecksDone);
ipc.on("verify-all", onInternalVerify);
ipc.on("request-domain-mappings-response", onRequestDomainMappingsResponse);
ipc.on("request-gcloud-auth-status-response", checkGcloudAuthStatusResponse);
ipc.on("request-vclogger-hide", hideVcLogger);
ipc.on("vclog-entry-count", onVcLoggerEntryCount);
