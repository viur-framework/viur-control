'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');
const { projectSpecSchema } = require('../schemata/project-spec');
const { projectStorageSchema } = require('../schemata/projects-storage');
const { credentialsSchema } = require('../schemata/credentials-json');
const { settingsStorageSchema } = require('../schemata/settings-storage');
const ajv = new Ajv();
exports.docDummy = "1";
function verifyProjectSpecFiles(projectsDir, screenConsole = undefined) {
    if (!screenConsole)
        screenConsole = console.log;
    screenConsole("<br/>starting validation of projects' project-spec.json files", "info");
    const directories = fs.readdirSync(projectsDir);
    let validate = ajv.compile(projectSpecSchema);
    for (let projectPath of directories) {
        const specFilePath = path.join(projectsDir, projectPath, "project-spec.json");
        if (!fs.existsSync(specFilePath)) {
            continue;
        }
        screenConsole(`validating specFile: ${specFilePath}`, "info");
        try {
            let projectSpec = JSON.parse(fs.readFileSync(specFilePath));
            let valid = validate(projectSpec);
            if (!valid) {
                screenConsole(JSON.stringify(validate.errors, (key, value) => value, 2), "error");
            }
            else {
                screenConsole("File is valid", "info");
            }
        }
        catch (err) {
        }
    }
    screenConsole("<br/>validation of projects' project-spec.json files done", "info");
}
function verifyProjectStorageFile(userDir, screenConsole = undefined) {
    if (!screenConsole)
        screenConsole = console.log;
    screenConsole("<br/>starting validation of projects storage json file", "info");
    let validate = ajv.compile(projectStorageSchema);
    const projectsPath = path.join(userDir, "projects.json");
    if (!fs.existsSync(projectsPath)) {
        return;
    }
    screenConsole(`validating projects.json:  ${projectsPath}`, "info");
    try {
        let projects = JSON.parse(fs.readFileSync(projectsPath));
        let valid = validate(projects);
        if (!valid) {
            screenConsole(JSON.stringify(validate.errors, (key, value) => value, 2), "error");
        }
        else {
            screenConsole("File is valid", "info");
        }
    }
    catch (err) {
        screenConsole(err.trace(), "error");
    }
    screenConsole("<br/>validation of projects storage json file done", "info");
}
function verifySettingsStorageFile(userDir, screenConsole = undefined) {
    if (!screenConsole)
        screenConsole = console.log;
    screenConsole("<br/>starting validation of settings storage json file", "info");
    let validate = ajv.compile(settingsStorageSchema);
    const projectsPath = path.join(userDir, "settings.json");
    if (!fs.existsSync(projectsPath)) {
        return;
    }
    screenConsole(`validating settings.json:  ${projectsPath}`, "info");
    try {
        let projects = JSON.parse(fs.readFileSync(projectsPath));
        let valid = validate(projects);
        if (!valid) {
            screenConsole(JSON.stringify(validate.errors, (key, value) => value, 2), "error");
        }
        else {
            screenConsole("File is valid", "info");
        }
    }
    catch (err) {
        screenConsole(err.trace(), "error");
    }
    screenConsole("<br/>validation of settings storage json file done", "info");
}
function verifyCredentialsFiles(projectsDir, screenConsole = undefined) {
    if (!screenConsole)
        screenConsole = console.log;
    screenConsole("<br/>starting validation of projects' credentials.json files", "info");
    const directories = fs.readdirSync(projectsDir);
    let validate = ajv.compile(credentialsSchema);
    for (let projectPath of directories) {
        const credentialsFilePath = path.join(projectsDir, projectPath, "credentials.json");
        if (!fs.existsSync(credentialsFilePath)) {
            continue;
        }
        screenConsole(`validating credentials: ${credentialsFilePath}`, "info");
        try {
            let projectSpec = JSON.parse(fs.readFileSync(credentialsFilePath));
            let valid = validate(projectSpec);
            if (!valid) {
                screenConsole(JSON.stringify(validate.errors, (key, value) => value, 2), "error");
            }
            else {
                screenConsole("File is valid", "info");
            }
        }
        catch (err) {
        }
    }
    screenConsole("<br/>validation of projects' credentials.json files done", "info");
}
module.exports["verifyProjectSpecFiles"] = verifyProjectSpecFiles;
module.exports["verifyProjectStorageFile"] = verifyProjectStorageFile;
module.exports["verifyCredentialsFiles"] = verifyCredentialsFiles;
module.exports["verifySettingsStorageFile"] = verifySettingsStorageFile;
//# sourceMappingURL=schemaVerifier.js.map