"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { spawn } = require('child_process');
function GcloudApplicationIdEntrySorter(a, b) {
    if (a.name < b.name)
        return -1;
    if (a.name > b.name)
        return 1;
    return 0;
}
exports.GcloudApplicationIdEntrySorter = GcloudApplicationIdEntrySorter;
function OnRequestGcloudProjects(event) {
    spawn("gcloud", ["--format", "json", "projects", "list"], {}, function (error, stdout, stderr) {
        if (error) {
            console.log("gcloud projects list error", error);
            return null;
        }
        let rawData = JSON.parse(stdout.toString());
        let gcloudProjects = [];
        for (let gcloudProject of rawData) {
            let labels = gcloudProject.labels;
            if (!labels) {
                labels = {};
            }
            let item = { "name": gcloudProject.projectId, "labels": labels, "created": false };
            gcloudProjects.push(item);
        }
        gcloudProjects.sort(GcloudApplicationIdEntrySorter);
        return gcloudProjects;
    });
}
exports.OnRequestGcloudProjects = OnRequestGcloudProjects;
//# sourceMappingURL=projectLib.js.map