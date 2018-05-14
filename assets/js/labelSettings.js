"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vcLogger_1 = require("./vcLogger");
const labelSettingsLib_1 = require("./labelSettingsLib");
const $ = require('jquery');
const fs = require('fs-extra');
const path = require('path');
const renderer = require('mustache');
const ElectronStorage = require('electron-store');
const settingsStorage = new ElectronStorage({ "name": "settings" });
const labelStorage = new ElectronStorage({ "name": "labels" });
const electron = require('electron');
const ipc = electron.ipcRenderer;
const remote = electron.remote;
const BrowserWindow = electron.remote.BrowserWindow;
const moment = require('moment');
let frozenAppPath = remote.getGlobal('process').env['frozenAppPath'];
exports.labelSettingsTemplate = fs.readFileSync(path.join(frozenAppPath, "assets/templates/label_settings.mustache")).toString();
renderer.parse(exports.labelSettingsTemplate);
function discoverLabelIcons(event, mainWindowId, logWindowId, refresh = false) {
    $(".js-close").on("click", function () {
        window.close();
    });
    function doit(err, allLabels) {
        if (err) {
            BrowserWindow.fromId(logWindowId).send("vclog-add-entry", {
                creationdate: moment().format(`YYYY-MM-DD HH:mm`),
                method: `refreshing all labels`,
                command: "",
                status: vcLogger_1.VcLogEntryStatus.ERROR,
                msg: err.toString()
            });
            return;
        }
        let labelIconRepository = settingsStorage.get("label_icon_repository");
        if (!labelIconRepository) {
            BrowserWindow.fromId(logWindowId).send("vclog-add-entry", {
                creationdate: moment().format(`YYYY-MM-DD HH:mm`),
                method: `discover label icons in repository '${labelIconRepository}'`,
                command: "",
                status: vcLogger_1.VcLogEntryStatus.ERROR,
                msg: "Stopped: No label repository set in settings!"
            });
            return;
        }
        $(".js-open-documentation").on("click", function (event) {
            let view = $(event.currentTarget).data("view");
            ipc.send("request-documentation", view);
        });
        $(".js-label-repository").text(labelIconRepository);
        const validImgExts = [".jpg", ".png", ".svg"];
        console.log(`automaticDiscover labels in repository "${labelIconRepository}"`);
        let foundImages = new Map();
        try {
            let files = fs.readdirSync(labelIconRepository);
            for (let fileName of files) {
                let absPath = path.join(labelIconRepository, fileName);
                const stats = fs.statSync(absPath);
                let extName = path.extname(fileName);
                if (!stats.isFile() || !validImgExts.includes(extName)) {
                    continue;
                }
                let baseName = path.basename(fileName, extName);
                let labelTitle = baseName.split("-").join(": ");
                console.log("labelRepository fileName:", fileName, extName, baseName, labelTitle);
                foundImages.set(labelTitle, fileName);
            }
        }
        catch (err) {
            BrowserWindow.fromId(logWindowId).send("vclog-add-entry", {
                creationdate: moment().format(`YYYY-MM-DD HH:mm`),
                method: `discover label icons in repository '${labelIconRepository}'`,
                command: "",
                status: vcLogger_1.VcLogEntryStatus.ERROR,
                msg: err.toString()
            });
            return;
        }
        for (let labelItem of allLabels) {
            let fileName = foundImages.get(labelItem.title);
            console.log("labelItem:", labelItem, fileName);
            if (fileName) {
                labelItem.path = fileName;
            }
            else {
                delete labelItem.path;
            }
        }
        $(".label-settings-ul").append(renderer.render(exports.labelSettingsTemplate, { "allLabels": allLabels, "labelRepository": labelIconRepository }));
        labelStorage.set("allLabels", allLabels);
    }
    $(".js-refresh-label-mappings").on("click", function (event) {
        $(".label-settings-ul").empty();
        doit(null, labelStorage.get("allLabels", []));
    });
    $(".js-collect-and-refresh-label-mappings").on("click", function (event) {
        $(".label-settings-ul").empty();
        labelSettingsLib_1.refreshAllLabels(doit);
    });
    if (refresh) {
        labelSettingsLib_1.refreshAllLabels(doit);
    }
    else {
        doit(null, labelStorage.get("allLabels", []));
    }
}
ipc.on("request-discover-label-icons", discoverLabelIcons);
//# sourceMappingURL=labelSettings.js.map