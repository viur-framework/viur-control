'use strict';

const {execSync} = require('child_process');
const fs = require('fs');
const fastGlob = require('globby');
const path = require('path');

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}


class ProjectSpec {
  constructor(tasks, applicationIds = []) {
    this.projectIcon = null;
    this.applicationIds = applicationIds;
    this.tasks = tasks;
  }
}


class ProjectSpecTask {
  constructor(name, id, cmd, directory, taskArguments, checking = undefined, longRunning = false) {
    this.name = name;
    this.id = id;
    this.cmd = cmd;
    this.directory = directory;
    this.checking = checking !== undefined ? checking : [];
    this.pane = "development";
    this.shell = true;
    this.requiredForDeployment = true;
    this.taskArguments = taskArguments;
    this.longRunning = longRunning;
  }
}

function createGulpTask(projectPath, taskPath) {
  let absPath = path.dirname(path.join(projectPath, taskPath));
  console.log("absPath", absPath);
  let output;
  try {
    let rawOutput = execSync('gulp --tasks-json --sort-tasks', {"cwd": absPath}).toString();
    output = JSON.parse(rawOutput);
  } catch (err) {
    console.error(err);
    return null;
  }

  let argumentOptions = [];
  let taskArgument = {
    "label": "build type",
    "name": "build-type",
    "selectType": true,
    argumentOptions: argumentOptions
  };
  let taskArguments = [taskArgument];

  for (let node of output.nodes) {

    let name;
    let flags;
    if (node.label === "default") {
      name = "default";
      flags = null;
    } else {
      name = node.label;
      flags = [node.label];
    }
    argumentOptions.push(
        {
          title: name,
          value: name.replace(".", "-"),
          flags: flags,
          longRunning: node.label === "watch"
        }
    )
  }
  argumentOptions.sort(function (a, b) {
    return (a.title < b.title) ? -1 : (a.title > b.title) ? 1 : 0;
  });

  let dirname = path.dirname(taskPath);
  let task = new ProjectSpecTask(
      `gulp in ${dirname}`,
      `gulp-in-${dirname.replace(" ", "_").replace("/", "_")}`,
      "gulp",
      dirname,
      taskArguments
  );

  // console.log("gulp task", task);
  return task;
}

function createViTask(projectPath) {
  let taskArguments = [
    {
      "label": "build type",
      "name": "build-type",
      "selectType": true,
      "argumentOptions": [
        {
          "title": "Production",
          "value": "production",
          "flags": [
            "deploy"
          ]
        },
        {
          "title": "Development",
          "value": "development",
          "flags": null
        }
      ]
    }
  ];

  return new ProjectSpecTask(
      "Build Vi",
      "build-vi",
      "make",
      "vi",
      taskArguments,
      [
        ["exists", "${currentApplicationDirectory}/vi/_pyjs.js"]
      ]
  );
}

function createMakeTask(projectPath, taskPath) {
  return new ProjectSpecTask(
      "Build Vi",
      "build-vi",
      "make",
      "vi",
      []
  );
}

function scanProjectForSpec(projectPath, refresh = false, applicationIds = []) {
  try {


    const specFilePath = path.join(projectPath, "project-spec.json");
    console.log("scanProject", projectPath, specFilePath, refresh);
    if (fs.existsSync(specFilePath) && !refresh) {
      console.log("scanProject: file found", specFilePath);
      return JSON.parse(fs.readFileSync(specFilePath.toString()));
    }

    if (!fs.existsSync(projectPath))
      return null;
    const stats = fs.statSync(projectPath);
    if (!stats.isDirectory()) {
      return null;
    }
    console.log("scanning", projectPath);

    let tasks = [];
    let viPath = path.join(projectPath, "vi");

    if (fs.existsSync(viPath)) {
      console.log("found viPath", viPath);
      tasks.push(createViTask(projectPath));
    }

    let gulpTaskPaths = fastGlob.sync('**/gulpfile.js', {
      "cwd": projectPath,
      "ignore": [".git", "**/node_modules/**"],
      bashNative: ["linux"]
    });

    for (let taskPath of gulpTaskPaths) {
      console.log("found gulpPath", taskPath);
      try {
        let task = createGulpTask(projectPath, taskPath);
        if (task) {
          tasks.push(task);
        }
      } catch (err) {
        console.error(err);
      }
    }

    let makePaths = fastGlob.sync('**/MAKEFILE', {
      "cwd": projectPath,
      "ignore": [".git", "**/node_modules/**"]
    });

    for (let taskPath of makePaths) {
      let task = createMakeTask(projectPath, taskPath);
      if (task)
        tasks.push(task);
    }
    if (tasks) {
      let applicationIdsClone = deepClone(applicationIds);
      for (let clone of applicationIdsClone) {
        delete clone["labelIcon"];
      }
      let spec = new ProjectSpec(tasks, applicationIdsClone);
      let destPath = path.join(projectPath, "project-spec.json");
      fs.writeFileSync(destPath, JSON.stringify(spec, function (key, value) {
        return value;
      }, 2));
      return spec;
    }
  } catch (err) {
    console.log("found error in scanProjectForSpec!!!");
    console.error(err);
  }
  return null;
}

function checkTaskOk(task, currentApplicationDirectory) {
  let result = false;
  if (task.checking && task.checking.length > 0) {
    console.log("task", task, task.checking, currentApplicationDirectory);
    for (let check of task.checking) {
      let [checkCmd, checkTpl] = check;
      checkTpl = checkTpl.replace("${currentApplicationDirectory}", currentApplicationDirectory);
      console.log("going to test", checkCmd, checkTpl);
      if (checkCmd === "exists") {
        if (fs.existsSync(checkTpl)) {
          result = true;
        }
      }
    }
    return result;
  } else {
    return null;
  }
}

module.exports["scanProjectForSpec"] = scanProjectForSpec;
module.exports["checkTaskOk"] = checkTaskOk;
