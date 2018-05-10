"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const installWizard_1 = require("./installWizard");
const $ = require('jquery');
const fs = require('fs');
const path = require('path');
const renderer = require('mustache');
const electronPositioner = require('electron-positioner');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const ipc = require('electron').ipcRenderer;
const remote = require('electron').remote;
const storage = new ElectronStorage({ "name": "settings" });
let frozenAppPath = remote.getGlobal('process').env['frozenAppPath'];
const tab0Template = fs.readFileSync(path.join(frozenAppPath, "assets/templates/first_steps_0.mustache")).toString();
const tab1Template = fs.readFileSync(path.join(frozenAppPath, "assets/templates/first_steps_1.mustache")).toString();
const tab2Template = fs.readFileSync(path.join(frozenAppPath, "assets/templates/first_steps_2.mustache")).toString();
renderer.parse(tab0Template);
renderer.parse(tab1Template);
renderer.parse(tab2Template);
let thisWindowId;
function checkTab0(event) {
    let result = storage.has("projects_directory");
    console.log("checkTab0", result);
    if (result) {
        $(".js-firststart-workspace-tab").addClass("green");
        $(".js-firststart-workspace-result").removeClass("hidden");
    }
}
function activateTab0(event) {
    console.log("activateTab0");
    $(".js-project-content.active").removeClass("active");
    $(".tab-item.active").removeClass("active");
    $(".js-firststart-workspace-tab").addClass("active");
    $(".js-firststart-workspace-content").addClass("active");
    $(".sidebar").addClass("sidebar-hidden");
    checkTab0();
}
function activateTab1(event) {
    console.log("activateTab1");
    $(".js-project-content.active").removeClass("active");
    $(".tab-item.active").removeClass("active");
    $(".js-firststart-installwizard-tab").addClass("active");
    $(".js-firststart-installwizard-content").addClass("active");
    $(".sidebar").removeClass("sidebar-hidden");
    console.log("before setup ui");
    installWizard_1.setup_wizard(frozenAppPath);
}
function activateTab2(event) {
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
    let win = new BrowserWindow({
        frame: true,
        title: `ViUR control - Add Project ${newProjectName}`,
        show: false
    });
    let positioner = new electronPositioner(win);
    positioner.move('bottomLeft');
    win.on('close', function () {
        win = null;
    });
    const modalPath = path.join('file://', frozenAppPath, 'assets/views/taskWindow.html');
    win.loadURL(modalPath);
    win.show();
    win.webContents.on('did-finish-load', function () {
        console.log("Add Project", newProjectName);
        win.show();
        win.webContents.send('add-project', newProjectName, thisWindowId);
    });
}
function startWindow(fromWindowId, firstStartWindowId, debugMode = false) {
    console.log("on first-start", firstStartWindowId);
    thisWindowId = firstStartWindowId;
    $(".js-settings-ul").append(renderer.render(tab0Template, storage.store));
    $(".logo-title").text(`First Start`);
    $(".js-close").on("click", window.close);
    $(".js-settings-paths").on('click', function (event) {
        let name = $(event.currentTarget).prop("name");
        ipc.send('select-directory-dialog', name);
    });
    $(".js-tab0-next").on("click", activateTab1);
    $(".js-firststart-workspace-tab").on("click", activateTab0);
    $(".js-firststart-installwizard-tab").on("click", activateTab1);
    $(".js-firststart-new-project-tab").on("click", activateTab2);
    $(".js-add-project").on("click", addProject);
    checkTab0();
}
ipc.on("first-start", startWindow);
ipc.on('projects_directory', function (event, path) {
    $("#projects-directory").val(path);
});
//# sourceMappingURL=firstStart.js.map