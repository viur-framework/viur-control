"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
function StoredLabelInterfaceSorter(a, b) {
    return a.title < b.title ? -1 : 1;
}
exports.StoredLabelInterfaceSorter = StoredLabelInterfaceSorter;
function LabelInternalInterfaceSorter(a, b) {
    return a.title < b.title ? -1 : 1;
}
exports.LabelInternalInterfaceSorter = LabelInternalInterfaceSorter;
function refreshAllLabels(callback) {
    child_process_1.exec("gcloud --format json projects list", {}, function (error, stdout, stderr) {
        let cache = new Set();
        let result = [];
        if (error) {
            console.log("gcloud projects list error", error);
            callback(error, null);
        }
        let rawData = JSON.parse(stdout.toString());
        for (let gcloudProject of rawData) {
            let labels = gcloudProject.labels;
            if (!labels) {
                continue;
            }
            for (let labelKey in labels) {
                let labelValue = labels[labelKey];
                let cacheKey = `${labelKey}: ${labelValue}`;
                if (!cache.has(cacheKey)) {
                    cache.add(cacheKey);
                    result.push({ title: cacheKey });
                }
            }
        }
        result.sort(StoredLabelInterfaceSorter);
        callback(null, result);
    });
}
exports.refreshAllLabels = refreshAllLabels;
//# sourceMappingURL=labelSettingsLib.js.map