'use strict';
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import {scanProjectForSpec} from "./projectSpecFile";

const $ = require('jquery');

const path = require('path');
const fastGlob = require('globby');
const BrowserWindow = require('electron').remote.BrowserWindow;
const uuidv4 = require('uuid/v4');
const ElectronStorage = require('electron-store');
const settingsStorage = new ElectronStorage({"name": "settings"});
const projectStorage = new ElectronStorage({"name": "projects"});
const versionsStorage = new ElectronStorage({"name": "versions"});
const gcloudProjectStorage = new ElectronStorage({"name": "gcloudProjects"});
const {exec} = require('child_process');
const moment = require('moment');

const fs = require('fs');
const ipc = require('electron').ipcRenderer;

const directoryPath = settingsStorage.get("projects_directory");
const PROJECT_STORAGE_VERSION = 3;
const GCLOUD_PROJECT_STORAGE_VERSION = 5;

export const docDummy = "1";

let portStart = 10000;
let adminPortStart = 10005;


function projectSorter(a: Project, b: Project) {
  let aDest = a.directoryName.toLowerCase();
  let bDest = b.directoryName.toLowerCase();
  if (aDest < bDest)
    return -1;
  if (aDest > bDest)
    return 1;
  return 0;
}

function getOldProjects() {
  const oldProjects = projectStorage.get("projects", []);
  let oldProjectsByName = new Map();

  for (let oldProject of oldProjects) {
    oldProjectsByName.set(oldProject.absolutePath, oldProject);
  }
  return oldProjectsByName;
}

class Project {
	directoryName: string;
	absolutePath: string;
	serverPort: number;
	adminPort: number;
	internalId: string;
	tasks: Array<any>;
	applicationIds: undefined|Array<any>;
	appengineDirectories: undefined|Array<any>;
	credentials: undefined|Array<any>;
	projectIcon: undefined|string;
	custom_devserver_cmd: undefined|string;
	
  constructor(directoryName: string,
              absolutePath: string,
              serverPort: number,
              adminPort: number,
              internalId: string,
              tasks: Array<any> = undefined,
              applicationIds: Array<any> = undefined,
              appengineDirectories: Array<any> = undefined,
              credentials: undefined|Array<any> = undefined,
              projectIcon: undefined|string = undefined,
              custom_devserver_cmd: undefined|string = undefined) {
    this.directoryName = directoryName;
    this.absolutePath = absolutePath;
    this.serverPort = serverPort;
    this.adminPort = adminPort;
    this.internalId = internalId;
    this.tasks = tasks !== undefined ? tasks : [];
    this.applicationIds = applicationIds !== undefined ? applicationIds : [];
    this.appengineDirectories = appengineDirectories !== undefined ? appengineDirectories : [];
    this.credentials = credentials !== undefined ? credentials : [];
    this.projectIcon = projectIcon;
    this.custom_devserver_cmd = custom_devserver_cmd;
  }
}


function scanProject(directoryName: string, windowId: number, callback: any, oldProjectsByName: undefined|Map<string, Project> = undefined, isNew: boolean = false, subprocessIds: undefined|Array<any> = undefined) : any {
  const absolutePath = path.join(directoryPath, directoryName);
  oldProjectsByName = oldProjectsByName !== undefined ? oldProjectsByName : getOldProjects();

  if (!fs.existsSync(absolutePath))
    return null;
  const stats = fs.statSync(absolutePath);
  if (!stats.isDirectory()) {
    return null;
  }
  let output = $(".output");
  $(output).append(`<p>scanning directory: ${directoryName}</p>`);
  console.log("scanning", directoryName);

  fastGlob('**/app.yaml', {
    "cwd": absolutePath,
    "ignore": [".git", "**/node_modules/**"]
  }).then(function (appengineDirectories: Array<string>) {
    console.log("appengine Directories", appengineDirectories);
    try {
    if (appengineDirectories.length > 0) {
      let result = [];
      let activeSubdirectory = false;
      let myOldProject = oldProjectsByName.get(absolutePath);
      let spec;
      try {
        spec = scanProjectForSpec(absolutePath);
      } catch (err) {
        console.error("error in getting project spec happened");
        console.exception(err);
      }

      let serverPort = portStart;
      portStart += 10;
      let adminPort = adminPortStart;
      adminPortStart += 10;

      for (let item of appengineDirectories) {
        let tmp = {"value": path.dirname(item), "checked": false};
        if (tmp.value === "appengine") {
          tmp.checked = true;
          activeSubdirectory = true;
        }
        result.push(tmp);
      }
      if (!activeSubdirectory && result.length > 0) {
        result[0].checked = true;
        activeSubdirectory = true;
      }
      console.log("appengine result", result);
      $(output).append(`<p>found project subdirs ${appengineDirectories}</p>`);

      let credsPath = path.join(absolutePath, "credentials.json");
      let credentials;
      if (fs.existsSync(credsPath)) {
        credentials = JSON.parse(fs.readFileSync(credsPath).toString());
      }

      if (!credentials) {
        credentials = [];
      }

      let applicationIds;
      let projectIcon = null;
      let internalId;
      let custom_devserver_cmd;
      if (myOldProject) {
        applicationIds = myOldProject.applicationIds;
        internalId = myOldProject.internalId;
        custom_devserver_cmd = myOldProject.custom_devserver_cmd;
        if (!internalId) {
          internalId = uuidv4();
        }
      } else {
        applicationIds = [];
        internalId = uuidv4();
        custom_devserver_cmd = undefined;
      }

      if (!applicationIds) {
        applicationIds = [];
      }

      if (applicationIds.length === 0) {
        applicationIds.push({"value": `${directoryName.toLowerCase()}-viur`, "checked": true});
      }

      let tasks;
      if (spec) {
        tasks = spec.tasks;
        projectIcon = spec.projectIcon;
      } else {
        tasks = [];
      }

      const myProject = new Project(
        directoryName,
        absolutePath,
        serverPort,
        adminPort,
        internalId,
        tasks,
        applicationIds,
        result,
        credentials,
        projectIcon,
        custom_devserver_cmd
      );

      console.log("found project", myProject.directoryName, isNew);
      const fromWindow = BrowserWindow.fromId(windowId);
      fromWindow.webContents.send('project-found', myProject, isNew);
      ipc.send('project-found', myProject, isNew);
      callback(myProject);
    } else {
      callback(undefined);
    }
  } catch (err) {
      console.error("catched error in", directoryName);
      $(output).append(`<p>catched error in ${directoryName}</p>`);
      console.exception(err);
    }
  });
}

function scanNewProject(event: Event, directoryName: string, windowId: number) {
  console.log("scanNewProject", directoryName, windowId);
  $("title").text(`ViUR control - scan new project ${directoryName}`);
  scanProject(directoryName, windowId, function (newProject: any) {
    if (!newProject) {
      return;
    }
    console.log("callback storing data");
    let projects = projectStorage.get("projects");
    projects.push(newProject);
    projects.sort(projectSorter);
    projectStorage.set("projects", projects);
  }, getOldProjects(), true);
  setTimeout(function () {
    window.close();
  }, 1500);
}

function getProjects(event: Event, windowId: number, subprocessIds: undefined|Array<any> = undefined, debug: boolean = false) {
  if (debug) {
    $(".js-close").on("click", window.close);
  }
  const fromWindow = BrowserWindow.fromId(windowId);

  // TODO: this is new - we'll test this for catching a strange error in project spec generation on macos
  window.onerror = function(error, url, line) {
    fromWindow.webContents.send('error-in-window', "getProjects()", error);
  };

  console.log("getProjects", windowId);
  const oldProjectsByName = getOldProjects();
  projectStorage.set("projects", []);
  const directoryEntries = fs.readdirSync(directoryPath);
  projectStorage.set("project_storage_version", PROJECT_STORAGE_VERSION);
  let output = $(".output");
  let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
  let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
  $(output).css(
    {
      "color": foregroundColor,
      "background-color": backgroundColor
    }
  );
  let scannerCount = 0;

  for (let directoryName of directoryEntries) {
    if (!fs.lstatSync(path.join(directoryPath, directoryName)).isDirectory())
      continue;
    scannerCount += 1;
    console.log("scannerCount up", scannerCount);
    scanProject(directoryName, windowId, function (newProject: Project) {
      if (newProject) {
        let projects = projectStorage.get("projects");
        projects.push(newProject);
        projects.sort(projectSorter);
        projectStorage.set("projects", projects);
      }
      scannerCount -= 1;
      console.log("scannerCount down", scannerCount);
      if (scannerCount <= 0) {

        fromWindow.webContents.send('rescan-projects-done');
        if (!debug) {
          setTimeout(function () {
            window.close();
          }, 2500);
        }
      }
    }, oldProjectsByName, false, subprocessIds);
  }
}

function loadStoredProjects(event: Event, windowId: number, debug: boolean = false) {
  $(".js-close").on("click", window.close);
  console.log("loadStoredProjects", windowId);
  $("title").text(`ViUR control - load stored projects`);
  let output = $("#output");
  let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
  let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
  $(output).css(
    {
      "color": foregroundColor,
      "background-color": backgroundColor
    }
  );
  const fromWindow = BrowserWindow.fromId(windowId);
  const storedProjectsVersion = projectStorage.get("project_storage_version", 1);

  let storedProjects = projectStorage.get("projects", []);
  console.log("versions", storedProjectsVersion, PROJECT_STORAGE_VERSION, storedProjects);
  if (typeof storedProjects === "undefined" || storedProjects.length === 0 || storedProjectsVersion < PROJECT_STORAGE_VERSION) {
    getProjects(event, windowId);
    return;
  }

  const projects = [];
  for (let project of storedProjects) {
    output.append(`<p class="output-line">restored project: ${project.directoryName}</p>`);

    projects.push(new Project(
      project.directoryName,
      project.absolutePath,
      project.serverPort,
      project.adminPort,
      project.internalId,
      project.tasks,
      project.applicationIds,
      project.appengineDirectories,
      project.credentials,
      project.projectIcon,
      project.custom_devserver_cmd
    ));
  }

  fromWindow.webContents.send('projects-found', projects);

  if (!debug) {
    setTimeout(function () {
      window.close();
    }, 2500);
  }
}

function applicationIdSorter(a: any, b: any) {
  if (a.name < b.name)
    return -1;
  if (a.name > b.name)
    return 1;
  return 0;
}

function OnRequestGcloudProjects(event: Event, windowId: string, refresh: boolean = false, debug = false) {
  $(".js-close").on("click", window.close);
  console.log("scanGcloudProjects", windowId, refresh);
  let storedGcloudProjects = gcloudProjectStorage.get("data");
  const fromWindow = BrowserWindow.fromId(windowId);
  let output = $("#output");
  let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
  let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
  $(output).css(
    {
      "color": foregroundColor,
      "background-color": backgroundColor
    }
  );
  const storedGcloudProjectsVersion = gcloudProjectStorage.get("gcloud_project_storage_version", GCLOUD_PROJECT_STORAGE_VERSION - 1);
  if (!storedGcloudProjects || !storedGcloudProjects.hasOwnProperty("gcloudProjectIds") || storedGcloudProjects.gcloudProjectIds.length === 0 || refresh || (storedGcloudProjectsVersion < GCLOUD_PROJECT_STORAGE_VERSION)) {
    let cmd = "gcloud --format json projects list";
    $(output).append(`<p class="output-line">going to fetch project list from google:</p>`);
    $(output).append(`<p class="output-line">${cmd}</p>`);

    exec(cmd, function (error: string, stdout: string, stderr: string) {
      if (error) {
        console.log("gcloud projects list error", error);
        return;
      }
      let rawData = JSON.parse(stdout.toString());
      let gcloudProjects = [];
      for (let gcloudProject of rawData) {
        let labels = gcloudProject.labels;
        if (!labels) {
          labels = {};
        }
        let item = {"name": gcloudProject.projectId, "labels": labels, "created": false};
        gcloudProjects.push(item);
        $(output).append(`<p class="output-line">${JSON.stringify(item, function (key, value) {
          return value
        }, 4)}</p>`);
      }
      gcloudProjects.sort(applicationIdSorter);
      let finalData = {"gcloudProjectIds": gcloudProjects};
      gcloudProjectStorage.set("gcloud_project_storage_version", GCLOUD_PROJECT_STORAGE_VERSION);
      gcloudProjectStorage.set("data", finalData);
      fromWindow.webContents.send("request-gcloud-projects-response", finalData, refresh);
      if (!debug) {
        setTimeout(function () {
          window.close();
        }, 2500);
      }
    });
  } else {
    console.log("found data", storedGcloudProjects);
    $(output).append(`<p class="output-line">using cached applicationIds:</p>`);
    for (let item of storedGcloudProjects.gcloudProjectIds) {
      $(output).append(`<p class="output-line">${JSON.stringify(item, function (key, value) {
        return value
      }, 4)}</p>`);
    }

    fromWindow.webContents.send("request-gcloud-projects-response", storedGcloudProjects, refresh);
    if (!debug) {
      setTimeout(function () {
        window.close();
      }, 2500);
    }
  }
}

function onRequestVersions(event: Event, windowId: number, applicationId: string, debug: boolean = false) {
  if (debug) {
    $(".js-close").on("click", window.close);
  }
  console.log("onRequestVersions", windowId, applicationId);
  const fromWindow = BrowserWindow.fromId(windowId);
  let cmdTemplate = `gcloud --format json --project ${applicationId} app versions list --sort-by ~last_deployed_time`;
  console.log("cmdTemplate", cmdTemplate);
  let output = $("#output");
  let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
  let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
  $(output).css(
    {
      "color": foregroundColor,
      "background-color": backgroundColor
    }
  );
  let proc = exec(cmdTemplate, {"shell": true}, function (error: number, stdout: number, stderr: number) {
    console.log("error", error);
    let lastFetched = moment().format('YYYY-MM-DD HH:mm:ss');
    let outputText = stdout.toString();
    console.log("stdout", outputText);
    console.log("version output data", outputText);
    if (!outputText) {
      outputText = "[]";
    }
    let versions = {"versions": JSON.parse(outputText), "lastFetched": lastFetched, "applicationId": applicationId};
    versionsStorage.set(applicationId, versions);
    fromWindow.webContents.send("request-versions-response", versions);
    if (!debug) {
      setTimeout(function () {
        window.close();
      }, 2500);
    }
  });
}

function onIndexesCheck(event: Event, parentWindowId: number, project: Project, debug: boolean = false) {
  console.log("onIndexesCheck", parentWindowId, project, debug);
  if (debug) {
    $(".js-close").on("click", window.close);
  }
  let activeAppengineDirectory;
  for (let appengineDirectory of project.appengineDirectories) {
    if (appengineDirectory.checked === true) {
      activeAppengineDirectory = appengineDirectory.value;
    }
  }
  if (!activeAppengineDirectory) {
    activeAppengineDirectory = project.appengineDirectories[0].value;
  }

  let projectPath = path.join(project.absolutePath, activeAppengineDirectory);
  let cmdTemplate = `git diff --name-only index.yaml`;
  exec(cmdTemplate, {"cwd": projectPath}, function (error: string, stdout: string, stderr: string) {
    let output = stdout.toString();
    const fromWindow = BrowserWindow.fromId(parentWindowId);
    fromWindow.webContents.send("indexes-check-response", (!!output));
    if (!debug) {
      setTimeout(function () {
        window.close();
      }, 2500);
    }
  });
}


ipc.on("indexes-check", onIndexesCheck);
ipc.on("start-scanning", loadStoredProjects);
ipc.on("start-rescanning", getProjects);
ipc.on("request-gcloud-projects", OnRequestGcloudProjects);
ipc.on("request-versions", onRequestVersions);
ipc.on("scan-new-project", scanNewProject);
