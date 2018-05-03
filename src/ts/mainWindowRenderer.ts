"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />


const fs = require('fs');
const path = require('path');
const renderer = require('mustache');
const electron = require('electron');
const $ = require('jquery');
const BrowserWindow = electron.remote.BrowserWindow;
const ipc = electron.ipcRenderer;
const shell = electron.shell;
const moment = require('moment');
const ElectronStorage = require('electron-store');

const url = require('url');
const settingsStorage = new ElectronStorage({"name": "settings"});
const versionsStorage = new ElectronStorage({"name": "versions"});
const projectStorage = new ElectronStorage({"name": "projects"});
const labelStorage = new ElectronStorage({"name": "labels"});
const regionsStorage = new ElectronStorage({"name": "regions"});
const domainMappingsStorage = new ElectronStorage({"name": "domainMappings"});
const gcloudProjectStorage = new ElectronStorage({"name": "gcloudProjects"});
const electronPositioner = require('electron-positioner');
const Positioner = require('electron-positioner');
const {defaultFlagsTpl} = require('./viur_instance_start');

const projectsByInternalId = new Map();
const projects = [];
const versionsCache = new Map();
const subprocessIds = new Map();
const projectWindows = new Map();
const gcloudProjectByApplicationId = new Map();
const labelCache = new Map();
const usedServerPortMap = new Map();
const usedAdminPortMap = new Map();

// needed templates
const projectItemTemplate = fs.readFileSync("assets/templates/project_list_item.mustache").toString();
const projectControlsTemplate = fs.readFileSync("assets/templates/project_development.mustache").toString();
const projectConfigTemplate = fs.readFileSync("assets/templates/project_configuration.mustache").toString();
const projectRemoteTemplate = fs.readFileSync("assets/templates/project_deployment.mustache").toString();
const projectVersionsTemplate = fs.readFileSync("assets/templates/project_versions.mustache").toString();
const projectApplicationTemplate = fs.readFileSync("assets/templates/project_applications_row.mustache").toString();
const projectConfigApplicationsTemplate = fs.readFileSync("assets/templates/project_config_applications_list.mustache").toString();
const projectCredentialsRow = fs.readFileSync("assets/templates/project_credentials_row.mustache").toString();
const regionsTemplate = fs.readFileSync("assets/templates/regions.mustache").toString();
const domainMappingTemplate = fs.readFileSync("assets/templates/domain_mappings.mustache").toString();
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
let thisWindowId;

interface appengineDirectoryInterface {
    value: string;
    checked: boolean;
}

interface ApplictionIdInterface {
    value: string;
    checked: boolean;
}

interface CredentialEntryInterface {
    applicationId: string;
    username: string;
    password: string;
}


interface ProjectInterface {
    absolutePath: string;
    directoryName: string;
    appengineDirectories: Array<appengineDirectoryInterface>;
    applicationIds: Array<ApplictionIdInterface>;
    credentials: Array<CredentialEntryInterface>;
    internalId: string;
    serverPort: number;
    adminPort: number;
    custom_devserver_cmd: string;
    tasks: Array<Object>;
}

interface RawLabelsInteface {
    [propName: string]: string;
}

interface ApplictionIdCacheEntryInterface {
    name: string;
    labels: RawLabelsInteface
}

interface ApplictionIdCacheInterface {
    gcloudProjectIds: ApplictionIdCacheEntryInterface;
}

let applicationsIdCache;
let currentInternalId: ApplictionIdCacheInterface;
let debug = false;
let appPath;
let labelList = [];

/** this variable will hold a cloned instance of the project we're currently have active.
 *  Changes to that object will not survive a project change,
 *  so make your changes to the original project object found in projects or projectsByInternalId
 */
let currentProject;

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function updateProjectSpecFile(internalId) {
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
    }, 2), 'utf8', function (err) {
	console.log("project spec saved");
    });
}

function projectSorter(a, b) {
    return ($(b).data('name').toLowerCase()) < ($(a).data('name').toLowerCase()) ? 1 : -1;
}

function prepareProject(project, initials, isNew = false) {
    console.log("prepareProject", project, isNew);

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

function onIndexesDirtyCheck(currentProject) {
    console.log("onIndexesDirtyCheck");
    let win = new BrowserWindow(
	{
	    title: `ViUR control - Project Versions`,
	    icon: path.join(__dirname, '../img/favicon.png'),
	    frame: false,
	    show: debug === true
	}
    );
    win.loadURL(path.join('file://', __dirname, '../views/scanProjects.html'));
    win.webContents.on('did-finish-load', function () {
	win.webContents.send('indexes-check', thisWindowId, currentProject, debug);
    });
}

function onIndexesDirtyCheckResponse(event, result) {
    console.log("onIndexesDirtyCheckResponse", result);
    if (result) {
	$(".js-index-yaml-check").html("Index.yaml should be deployed first").removeClass("icon-check").addClass("icon-eye").css("color", "red");
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

function getProjectVersions(event?: Event, refresh = false) {
    let myApplicationId = $(".js-project-remote-content .js-selectable-application-id:checked").data("value");
    $(".js-selected-application-id").text(myApplicationId);
    console.log("getProjectVersions", myApplicationId);
    if (myApplicationId) {
	let projectVersions = versionsCache.get(myApplicationId);
	console.log("going to set versions to project", myApplicationId, projectVersions);
	if (!projectVersions || refresh) {
	    console.log("projectVersions not found - requesting them");
	    let win = new BrowserWindow(
		{
		    title: `ViUR control - Project Versions`,
		    icon: path.join(__dirname, '../img/favicon.png'),
		    frame: false,
		    show: debug === true
		}
	    );
	    win.loadURL(path.join('file://', __dirname, '../views/scanProjects.html'));
	    win.webContents.on('did-finish-load', function () {
		console.log("requesting project versions", thisWindowId);
		win.webContents.send('request-versions', thisWindowId, myApplicationId, debug);
	    });
	} else {
	    onRequestVersionsResponse(event, projectVersions);
	}
    }
}

function toggleDevServer(event) {
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
		icon: path.join(__dirname, '../img/favicon.png'),
		frame: false,
		show: false,
		width: 1280,
		height: 720
	    }
	);
	ipc.send("new-project-window", currentProject.internalId, devServerWindow.id);
	let positioner = new electronPositioner(devServerWindow);
	positioner.move('topLeft');
	devServerWindow.loadURL(path.join('file://', __dirname, '../views/viurInstanceOutput.html'));
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

function startTasks(event?: Event) {
    console.log("startTasks");
    let tasks = projectsByInternalId.get(currentInternalId).tasks;
    let taskQueue = [];
    for (let element of $(".js-task-selection:checked")) {
	let taskId = $(element).data("id");
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
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.webContents.on('did-finish-load', function () {
	win.show();
	win.webContents.send('start-handler', windowId, currentProject, taskQueue);
    });
}

function reloadApplicationIds() {
    console.log("js-reload-applications-ids request");
    requestGcloudProjects(true);
}

function openLocalInstance(event) {
    event.preventDefault();
    shell.openExternal($(this).attr("href"));
    return false;
}

function openLocalVi(event) {
    event.preventDefault();
    shell.openExternal($(this).attr("href"));
    return false;
}

function openLocalAdminConsole(event) {
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

function projectPaneSelected(event, paneId) {
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

function removeApplicationId(event) {
    console.log("removeApplicationId");
    let applicationId = $(event.currentTarget).data("value");
    let internalId = $(".list-group-item.active").data("internal-id");
    $(`.js-remove-application-id[data-value="${applicationId}"]`).parents(".js-applicationid-row").slideUp().remove();
    let myProject = projectsByInternalId.get(internalId);
    console.log("myProject", myProject);
    for (let ix in myProject.applicationIds) {
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
	let newDataSet = {"value": applicationId, "checked": false};
	console.log("newDataSet", newDataSet);
	let found = false;
	if (myProject.applicationIds.length === 0) {
	    newDataSet.checked = true;
	} else {
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
	icon: path.join(__dirname, '../img/favicon.png'),
	show: debug
    });
    win.on('close', function () {
	win = null
    });
    let region = $(".js-regions-selector option:selected").val();
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.webContents.on('did-finish-load', function () {
	win.show();
	win.webContents.send('request-create-appengine', thisWindowId, applicationId, region, debug);
    });
}

function checkAppengineInstance(refresh = false) {
    let applicationId = $(".content.active").find(".js-selectable-application-id:checked").data("value");
    console.log("checkAppengineInstance", applicationId);
    let applicationIdList = gcloudProjectStorage.get("data");
    console.log("applicationIdList", applicationIdList);
    let validApplicationId = false;
    let projectToCheck = null;
    for (let entry of applicationIdList.gcloudProjectIds) {
	if (entry.name == applicationId) {
	    validApplicationId = true;
	    projectToCheck = entry;
	    break;
	}
    }
    if (!validApplicationId || (typeof projectToCheck.created === typeof true && refresh === false)) {
        let result = (!validApplicationId) ? false : (typeof projectToCheck.created === typeof true) ? projectToCheck.created : false;
	onRequestCheckAppengineStatusResponse(null, applicationId, result);
	return;
    }
    console.log("projectToCheck", projectToCheck.created, refresh, validApplicationId);

    let win = new BrowserWindow({
	frame: true,
	title: `ViUR control - checking appengine instance ${applicationId}`,
	icon: path.join(__dirname, '../img/favicon.png'),
	show: debug
    });
    win.on('close', function () {
	win = null
    });
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.webContents.on('did-finish-load', function () {
	win.show();
	win.webContents.send('request-check-appengine-status', thisWindowId, applicationId, debug);
    });
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
	icon: path.join(__dirname, '../img/favicon.png'),
	show: false
    });
    win.on('close', function () {
	win = null
    });
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
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
	icon: path.join(__dirname, '../img/favicon.png'),
	show: false
    });
    win.on('close', function () {
	win = null
    });
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.webContents.on('did-finish-load', function () {
	win.show();
	win.webContents.send('start-migrate-version', thisWindowId, absolutePath, applicationId, version, debug);
    });
}

function searchProject(event) {
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

function setDefaultApplicationId(event) {
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
}

function saveLabels(customLabelList = undefined) {
    let workingList;
    if (customLabelList) {
	workingList = customLabelList;
    } else {
	workingList = labelList;
    }
    console.log("saveLabels", workingList);

    workingList.sort(function (a, b) {
	return a.title < b.title ? -1 : 1;
    });

    let labelIconRepository = settingsStorage.get("label_icon_repository");
    if (!labelIconRepository) {
	labelIconRepository = path.join(appPath, "label-icons");
	settingsStorage.set("label_icon_repository", labelIconRepository);
    }

    if (!fs.existsSync(labelIconRepository)) {
	fs.mkdirSync(labelIconRepository);
    }

    let resultList = [];
    for (let entry of workingList) {
	let clone = Object.assign({}, entry);
	if (clone.path) {
	    if (clone.hasOwnProperty("id")) {
		delete clone.id;
	    }
	    if (clone.path) {
		clone.path = path.relative(labelIconRepository, clone.path);
	    }
	}
	resultList.push(clone);
    }
    labelStorage.set("allLabels", resultList);

    if (customLabelList) {
	labelList = resultList;
	labelCache.clear();
	for (let entry of labelList) {
	    if (entry.path) {
		entry.path = path.join(labelIconRepository, entry.path);
	    }
	    labelCache.set(entry.title, entry);
	}
	if (currentInternalId) {
	    // TODO: a complete new recall of projectSelected for changed label?
	    projectSelected(null, currentInternalId);
	}
    }

    console.log("labels should be saved");
}

function loadLabelCache(event?: Event) {
    console.log("loadLabelCache");
    labelCache.clear();
    labelList = [];
    let labelIconRepository = settingsStorage.get("label_icon_repository");
    if (!labelIconRepository) {
	return;
    }

    for (let entry of labelStorage.get("allLabels", [])) {
	let clone = Object.assign({}, entry);
	if (clone.path) {
	    clone.path = path.join(labelIconRepository, clone.path);
	}
	labelList.push(clone);
	labelCache.set(entry.title, clone);
    }
    labelList.sort(function (a, b) {
	return a.title < b.title ? -1 : 1;
    });
    console.log("loadLabelCache end");
}

/**
 * Scans all applicationId entries for labels, find label icons, builds an internal cache map and saves to label storage of changed
 */
function processApplicationIdLabels() {
    console.log("processApplicationIdLabels");
    gcloudProjectByApplicationId.clear();

    let changed = false;

    for (let applicationIdEntry of applicationsIdCache.gcloudProjectIds) {
	gcloudProjectByApplicationId.set(applicationIdEntry.name, applicationIdEntry);
	let gcloudProjectLabels = applicationIdEntry.labels;
	if (gcloudProjectLabels) {
	    for (let labelKey in gcloudProjectLabels) {
		let labelValue = gcloudProjectLabels[labelKey];
		let cacheKey = `${labelKey}: ${labelValue}`;
		if (!labelCache.has(cacheKey)) {
		    try {
			let payload = {
			    "path": null,
			    "title": cacheKey
			};
			labelCache.set(cacheKey, payload);
			labelList.push(payload);
			changed = true;
			console.log("new label", payload);
		    } catch (err) {
			console.error(err)
		    }
		}
	    }
	}
    }
    if (changed) {
	saveLabels();
    }
    console.log("processApplicationIdLabels finished", gcloudProjectByApplicationId);
}

function amendLabelIcons(projectClone) {
    let projectApplicationIds = projectClone.applicationIds;
    console.log("amendLabelIcons(): projectApplicationIds", projectApplicationIds);
    for (let projectApplicationIdEntry of projectApplicationIds) {
	projectApplicationIdEntry.labels = [];
	console.log("projectApplicationIdEntry", projectApplicationIdEntry);
	let applicationIdEntry = gcloudProjectByApplicationId.get(projectApplicationIdEntry.value);
	if (applicationIdEntry) {
	    console.log("applicationIdEntry", gcloudProjectByApplicationId, applicationIdEntry);
	    if (applicationIdEntry) {
		let gcloudProjectLabels = applicationIdEntry.labels;
		if (gcloudProjectLabels) {
		    console.log("gcloudProjectLabels", gcloudProjectLabels);
		    for (let labelKey in gcloudProjectLabels) {
			let labelValue = gcloudProjectLabels[labelKey];
			let cacheKey = `${labelKey}: ${labelValue}`;
			console.log("label key, value", labelKey, labelValue, cacheKey);
			let icon = labelCache.get(cacheKey);
			if (icon) {
			    projectApplicationIdEntry.labels.push(icon);
			}
		    }
		}
	    }
	}
    }
}

function projectSelected(event, internalIdOverwrite = undefined) {
    let internalId;
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
    console.log("projectSelected", currentInternalId, project);
    currentProject = deepClone(project);
    currentProject.running = subprocessIds.has(project.internalId);
    if (!currentProject.custom_devserver_cmd) {
	currentProject.custom_devserver_cmd = defaultFlagsTpl;
    }
    currentProject.regions = regionsStorage.get("data");

    amendLabelIcons(currentProject);
    console.log("projectSelected", event, currentProject);

    $(".js-welcome-pane").addClass("hidden");
    $(".js-project-pane").removeClass("hidden");
    // config content
    $(".js-project-config-content").html(renderer.render(projectConfigTemplate, currentProject));
    // local content
    $(".js-project-local-content").html(renderer.render(projectControlsTemplate, currentProject));
    // remote content
    $(".js-project-remote-content").html(renderer.render(projectRemoteTemplate, currentProject));

    getProjectVersions();
    fillNextVersion();
    checkAppengineInstance();
    onRequestDomainMappings(true);

    $(".js-project-config-all-application-ids").html(renderer.render(projectConfigApplicationsTemplate, applicationsIdCache));
    onIndexesDirtyCheck(projectsByInternalId.get(currentInternalId));
}

function onDevserverFlagsChanged(event) {
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

function versionLinkClicked(event) {
    event.preventDefault();
    shell.openExternal(event.currentTarget.href);
    return false;
}

function requestProjectsScan(refresh = false) {
    $(".list-group-item").remove();
    if (refresh) {
	$(".js-loading-spinner").removeClass("hidden").find(".spinner-text").text("rescanning projects...");
    } else {
	$(".js-loading-spinner").removeClass("hidden").find(".spinner-text").text("loading projects...");
    }
    let win = new BrowserWindow(
	{
	    title: `ViUR control - Projects Scanning`,
	    icon: path.join(__dirname, '../img/favicon.png'),
	    frame: false,
	    show: debug === true
	}
    );
    win.loadURL(path.join('file://', __dirname, '../views/scanProjects.html'));
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

function requestLabelSettings(event) {
    console.log("requestLabelSettings");
    let win = new BrowserWindow(
	{
	    title: `ViUR control - Label Settings`,
	    icon: path.join(__dirname, '../img/favicon.png'),
	    show: false,
	    frame: false
	}
    );
    win.loadURL(path.join('file://', __dirname, '../views/labelSettings.html'));
    win.webContents.on('did-finish-load', function () {
	win.show();
	win.webContents.send('open-label-settings', thisWindowId, labelList, appPath);
    })
}

function requestScanNewProject(event, projectName) {
    console.log("requestScanNewProject", projectName);
    let win = new BrowserWindow(
	{
	    title: `ViUR control - Projects Scanning`,
	    icon: path.join(__dirname, '../img/favicon.png'),
	    show: false
	}
    );
    win.loadURL(path.join('file://', __dirname, '../views/scanProjects.html'));
    win.webContents.on('did-finish-load', function () {
	win.webContents.send('scan-new-project', projectName, thisWindowId);
    })
}

function requestGcloudProjects(update = false) {
    let win = new BrowserWindow(
	{
	    title: `ViUR control - fetch gcloud projects`,
	    icon: path.join(__dirname, '../img/favicon.png'),
	    frame: false,
	    show: debug
	}
    );
    win.loadURL(path.join('file://', __dirname, '../views/scanProjects.html'));
    win.webContents.on('did-finish-load', function () {
	console.log("requesting gcloud projects", thisWindowId);
	win.webContents.send('request-gcloud-projects', thisWindowId, update, debug);
    });
}

function requestGetAppengineRegions() {
    let win = new BrowserWindow(
	{
	    title: `ViUR control - fetch appengine regions`,
	    icon: path.join(__dirname, '../img/favicon.png'),
	    frame: false,
	    show: true
	}
    );
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.webContents.on('did-finish-load', function () {
	console.log("requesting appengine regions", thisWindowId);
	win.webContents.send('request-get-appengine-regions', thisWindowId);
    });
}

function onRequestDomainMappings(refresh = false) {
    let applicationIds = [];

    for (let item of currentProject.applicationIds) {
        applicationIds.push(item.value)
    }

    //
    //
    // let domainMappings = domainMappingsStorage.get("data");
    //
    // let mustFetch = false;
    // for (let applicationId of applicationIds){
	// if (refresh || !applicationId)
    // }

    let win = new BrowserWindow(
	{
	    title: `ViUR control - fetch appengine regions`,
	    icon: path.join(__dirname, '../img/favicon.png'),
	    frame: false,
	    show: true
	}
    );
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.webContents.on('did-finish-load', function () {
	console.log("requesting appengine regions", thisWindowId);
	win.webContents.send('request-get-domain-mappings', thisWindowId, applicationIds);
    });
}

function onRequestDomainMappingsResponse(event, result) {
    console.log("onRequestDomainMappingsResponse", event, result);
    for (let applicationId of Object.keys(result)) {
        let domainMappings = {domainMappings: result[applicationId]};
	let element = $(`.js-domain-mappings[data-application-id="${applicationId}"]`);
	console.log("element", element);
	let renderedHtml = renderer.render(domainMappingTemplate, domainMappings);
	console.log("renderedHtml", renderedHtml);
	$(`.js-domain-mappings[data-application-id="${applicationId}"]`).html(renderedHtml);
    }
}

function onRequestSubprocessIds() {
    ipc.send("request-subprocess-ids");
}

function onRequestSubprocessIdsResponse(event, subprocessIdsFromMain, projectWindowsFromMain) {
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

function onInternalVerify(event) {
    console.log("onInternalVerify");
    let verifyWindow = new BrowserWindow({
	icon: path.join(__dirname, '../img/favicon.png'),
	frame: false,
	width: 600,
	height: 300,
	show: false,
    });
    verifyWindow.loadURL(url.format({
	pathname: path.join(__dirname, '../views/taskWindow.html'),
	protocol: 'file:',
	slashes: true
    }));
    let positioner = new Positioner(verifyWindow);
    positioner.move('center');
    verifyWindow.on('closed', function (event) {
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
    let activeAppengineDirectory;
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
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.webContents.on('did-finish-load', function () {
	if (debug) {
	    win.show();
	}
	console.log('before sending check-tasks', thisWindowId, currentProject.tasks, activeAppengineDirectory);
	win.webContents.send('check-tasks', thisWindowId, currentProject.tasks, activeAppengineDirectory, debug);
    });
}

function onServerPortChanged(event) {

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

function onAdminPortChanged(event) {
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

function onRequestTaskChecksDone(event, results) {
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
    delete project.icon;
    $(".js-project-icon").val("");
    projectStorage.set("projects", projects);
    $(currentProjectListItem).find(".js-project-icon-display").css("background-image", "url('../img/list-fallback.svg')");
    updateProjectSpecFile(internalId);
}

function onBackToHome() {
    $(".js-welcome-pane").removeClass("hidden");
    $(".js-project-pane").addClass("hidden");
    $(".list-group-item").removeClass("active");
}

function onOpenDocumentation(event) {
    let view = $(event.currentTarget).data("view");
    ipc.send("request-documentation", view);
}

function onWindowReady(event, mainWindowId, userDir, debugMode = false) {
    thisWindowId = mainWindowId;
    debug = debugMode;
    appPath = userDir;

    // console.log("onWindowReady", mainWindowId, debugMode);
    // console.log("user env:", process.env);
    let paneDiv = $(".pane");
    let windowContent = $(".window-content");
    let remoteContentDiv = $(".js-project-remote-content");
    $(paneDiv).on("click", ".js-selectable-application-id", setDefaultApplicationId);
    $(paneDiv).on("click", ".js-get-versions", function (event) {
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
    $(".list-group").on("click", ".list-group-item", projectSelected);
    $(".content").on("click", ".js-add-application-id", addApplicationIdToProject);
    $(".js-project-search").on("keyup", searchProject);
    $(".js-add-project").on("click", addProject);

    $(remoteContentDiv).on('click', ".js-deploy-selected-app", deployProject);
    $(remoteContentDiv).on('click', ".js-check-appengine-exists", checkAppengineInstance);
    $(remoteContentDiv).on('click', ".js-get-appengine-regions", requestGetAppengineRegions);
    $(remoteContentDiv).on('click', ".js-create-appengine", createAppengineInstance);
    $(remoteContentDiv).on('click', ".js-check-appengine-status", function() {
        checkAppengineInstance(true);
    });
    $(remoteContentDiv).on('click', ".js-update-indexes", updateIndexes);
    $(remoteContentDiv).on('click', ".js-migrate-version", migrateVersion);
    $(remoteContentDiv).on('click', "a.js-version-link", versionLinkClicked);
    $(paneDiv).on('click', ".js-remove-application-id", removeApplicationId);
    $(".js-home").on("click", onBackToHome);
    $(".js-open-settings").on("click", function () {
	ipc.send("request-settings");
    });
    $(windowContent).on("click", ".js-open-documentation", onOpenDocumentation);
    $(windowContent).on("click", ".js-open-viur-documentation", onOpenViurSite);
    $(windowContent).on("click", ".js-start-tasks", startTasks);
    $(windowContent).on("click", ".js-select-all-tasks", function (event) {
	let checked = $(event.currentTarget).prop("checked");
	$(".js-task-selection").prop("checked", checked);
    });
    $(windowContent).on("click", ".js-task-selection", function (event) {
	let active = $(".js-task-selection:checked").length;
	let total = $(".js-task-selection").length;
	$(".js-select-all-tasks").prop("checked", total == active);
    });

    $(windowContent).on("click", ".js-check-tasks", onRequestTaskChecks);
    $(windowContent).on("change", "#custom-devserver-cmd", onDevserverFlagsChanged);
    $(windowContent).on("change", "#real-server-port", onServerPortChanged);
    $(windowContent).on("change", "#real-admin-port", onAdminPortChanged);

    onRequestSubprocessIds();
    loadLabelCache();
    requestGcloudProjects();
    loadVersions();
}

function onDeploymentDialogAnswer(event, index, absolutePath, applicationId, version) {
    if (index !== 0) {
	return;
    }

    let win = new BrowserWindow({
	frame: true,
	title: `ViUR control - Deploying ${applicationId}`,
	icon: path.join(__dirname, '../img/favicon.png')
    });
    win.on('close', function () {
	win = null
    });
    win.loadURL(path.join('file://', __dirname, '../views/taskWindow.html'));
    win.show();
    win.webContents.on('did-finish-load', function () {
	win.webContents.send('start-deploy', thisWindowId, absolutePath, applicationId, version, debug)
    })
}

function onRequestGcloudProjectsResponse(event: Event, data: ApplictionIdCacheInterface, update: boolean) {
    console.log("onRequestGcloudProjectsResponse", data);
    applicationsIdCache = data;
    processApplicationIdLabels();
    let applicationIdList = $(".js-project-config-all-application-ids");
    console.log("applicationId selector", applicationIdList, data, applicationsIdCache.length);
    if (applicationsIdCache && applicationsIdCache.gcloudProjectIds.length > 0) {
	let renderedHtml = renderer.render(projectConfigApplicationsTemplate, data);
	console.log("renderedHtml from gcloud project list", renderedHtml);
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

function onProjectsFound(event, incomingProjects) {
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

function onProjectFound(event, project, isNew) {
    console.log("onProjectFound", project, isNew);
    let initials = settingsStorage.get("version_developer_sign", "myName");

    prepareProject(project, initials, isNew);
    if (isNew) {
	let listGroupItems = $(".list-group-item");
	let sortedData = $(listGroupItems).sort(projectSorter);
	$(listGroupItems).remove();
	let listGroupElement = $(".list-group");
	$(listGroupElement).append(sortedData);
	$(`.list-group-item[data-internal-id="${project.internalId}"]`).trigger("click");
    }
}

function onCredentialsFound(event, applicationId, username, password) {
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

function onRequestVersionsResponse(event, versions) {
    console.log("onRequestVersionsResponse", versions);
    $(".js-project-versions").html(renderer.render(projectVersionsTemplate, versions));
    $(".js-versions-last-fetched").text(versions.lastFetched);
    checkVersion();
}

function onSettingsStringChanged(event, name, value) {
    console.log("onSettingsStringChanged", name, value);
    if (name === 'version_developer_sign') {
	fillNextVersion(value);
    }
}

function onProjectIconChanged(event, internalId, iconPath) {
    console.log("onProjectIconChanged", internalId, iconPath, currentProject);
    let project = projectsByInternalId.get(internalId);
    if (!project) {
	throw new Error(`project not found by internalId: ${internalId}`);
    }

    console.log("project?", project, currentProject);

    if (!iconPath.startsWith(currentProject.absolutePath)) {
	new Notification('Error', {
	    body: 'Only accepting icons from the current project directory!!!'
	});
	return;
    }

    project.projectIcon = currentProject.projectIcon = {"url": path.relative(currentProject.absolutePath, iconPath)};

    projectStorage.set("projects", projects);
    $(".js-project-icon").val(currentProject.projectIcon.url);
    $(".list-group-item.active").find(".js-project-icon-display").css("background-image", `url('${iconPath}')`);
    updateProjectSpecFile(currentInternalId);
}

function onLocalDevServerStarted(event, internalId, processId) {
    console.log('onLocalDevServerStartfed', processId);
    subprocessIds.set(internalId, processId);
}

function onLocalDevServerMinimized(event, internalId) {
    console.log('onLocalDevServerStarted', internalId);
    let currentWindow = projectWindows.get(internalId);
    if (currentWindow) {
	let devServerWindow = BrowserWindow.fromId(currentWindow);
	devServerWindow.minimize();
    }
}

function onOpenViurSite() {
    event.preventDefault();
    shell.openExternal("https://www.viur.is");
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

function onRescanLabels() {
    loadLabelCache();
    processApplicationIdLabels();
}


function onSaveLabels(event, remoteLabels) {
    saveLabels(remoteLabels);
}


function onCatchErrors(event, taskName, error) {
    console.log("onCatchingErrors", taskName, error);
}

function onRequestCheckAppengineStatusResponse(event, applicationId, result) {
    console.log("onRequestCheckAppengineStatusResponse", applicationId, result);
    let myProject = projectsByInternalId.get(currentInternalId);
    myProject.created = result;
    if (!result) {
	$(".js-appengine-uncreated-section").removeClass("hidden");
	$(".js-appengine-created-section").addClass("hidden");
    } else {
	$(".js-appengine-uncreated-section").addClass("hidden");
	$(".js-appengine-created-section").removeClass("hidden");
    }
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

function onRequestAppengineRegionsResponse(event, result) {
    console.log("onRequestAppengineRegionsResponse", result);
    let regionSelector = $(".js-project-remote-content").find(".js-regions-selector");
    console.log("regionSelector", regionSelector);
    $(regionSelector).html(renderer.render(regionsTemplate, result));
    $(".js-regions-last-fetched").text(result.lastFetched);
}

function onRequestCreateAppengineResponse(event, applicationId) {
    console.log("onRequestCreateAppengineResponse");
    onRequestCheckAppengineStatusResponse(event, applicationId, true);
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
ipc.on("open-label-settings", requestLabelSettings);
ipc.on("rescan-labels", onRescanLabels);
ipc.on("save-labels", onSaveLabels);
ipc.on("request-check-appengine-status-response", onRequestCheckAppengineStatusResponse);
ipc.on("request-app-regions-response", onRequestAppengineRegionsResponse);
ipc.on("request-create-appengine-success", onRequestCreateAppengineResponse);
ipc.on("project-pane-selected", projectPaneSelected);
ipc.on("check-tasks-done", onRequestTaskChecksDone);
ipc.on("verify-all", onInternalVerify);
ipc.on("request-domain-mappings-response", onRequestDomainMappingsResponse);
