"use strict";
/// <reference path="node_modules/@types/electron-store/index.d.ts" />

import {ProjectInterface} from "./mainWindowRenderer";
import WriteStream = NodeJS.WriteStream;

const $ = require('jquery');
const path = require('path');
const {spawn} = require('child_process');
const ElectronStorage = require('electron-store');
const BrowserWindow = require('electron').remote.BrowserWindow;
const ipc = require('electron').ipcRenderer;

const settingsStorage = new ElectronStorage({"name": "settings"});

const defaultFlagsTpl = "--admin_port ${adminPort} --port ${serverPort} --log_level debug --storage_path ../storage/ -A ${applicationId} .";

module.exports["defaultFlagsTpl"] = defaultFlagsTpl;

interface ReplacementInterface {
	[propName: string]: string;
}

function startLocalInstance(project: ProjectInterface, applicationId: string, fromWindowId: number) {
	console.log("startLocalInstance", project, applicationId, fromWindowId);

	let output = $(".output");
	let userPasswordRegex = /.*Username: (.*?), Password: (.*)/g;
	let userScrolled = false;
	let ignoreScroll = false;

	function scrollHandler(event: any) {
		if (!ignoreScroll) {
			let scrollTop = event.currentTarget.scrollTop;
			let height = event.currentTarget.scrollHeight;
			let factor = (scrollTop / height);
			userScrolled = factor < 0.65;
			console.log(event, factor, userScrolled);
		} else {
			ignoreScroll = false;
		}
	}

	function handleOutput(stringBuffer: any, findPassword = false) {
		let text = stringBuffer.toString();
		if (findPassword) {
			let credentials = userPasswordRegex.exec(text);
			if (credentials && credentials.length > 0) {
				// we have to go over main.js as a proxy.
				// This context does not want to send ipc messages to its parent window :(
				ipc.send("credentials-found", applicationId, credentials[1], credentials[2]);
			}
		}

		text = text.split("\n");
		let intermediateData: Array<string> = [];
		for (let line of text) {
			line = line.replace(
				"DEBUG", '<span class="loglevel debug">DEBUG</span>').replace(
				"INFO", '<span class="loglevel info">INFO</span>').replace(
				"ERROR", '<span class="loglevel error">ERROR</span>').replace(
				"WARNING", '<span class="loglevel warning">WARNING</span>');
			intermediateData.push(`<p class="output-line">${line}</p>`);
		}

		let result: string = intermediateData.join("");
		if (result) {
			$(output).append(result);
			if (!userScrolled) {
				ignoreScroll = true;
				$(output)[0].scrollTop = $(output)[0].scrollHeight;
			}
		}
		$(output).append(text);
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
	let cmdArgsTemplate: Array<string> = [];

	let serverPort = project.serverPort;
	let adminPort = project.adminPort;
	let gcloudPath = settingsStorage.get("gcloud_tool_path");
	let devserverPath;
	if (gcloudPath) {
		devserverPath = path.join(gcloudPath, "dev_appserver.py");
	} else {
		devserverPath = "dev_appserver.py";
	}

	if (project.custom_devserver_cmd) {
		let customArgsString = project.custom_devserver_cmd;
		let splittedRawArgs = customArgsString.split(" ");

		let replacements: ReplacementInterface = {
			"${adminPort}": adminPort.toString(),
			"${serverPort}": serverPort.toString(),
			"${applicationId}": applicationId
		};

		for (let arg of splittedRawArgs) {
			if (!arg) {
				continue;
			}
			console.log("arg: '", arg, "'");
			let tmp = replacements[arg];
			if (tmp) {
				arg = tmp;
			}
			cmdArgsTemplate.push(arg);
		}
	} else {
		cmdArgsTemplate = [
			"--support_datastore_emulator",
			"--admin_port", adminPort.toString(),
			"--port", serverPort.toString(),
			"--log_level", "debug",
			"--storage_path", "../storage",
			"-A", applicationId,
			"."
		];
	}

	$(output).append(`<p class="output-line"><span class="loglevel info">current working directory: </span>${projectPath}</p><p class="output-line"><span class="loglevel info">used command: </span>${cmdArgsTemplate}</p>`);
	$(output).on("scroll", scrollHandler);

	//let proc = spawn(devserverPath, cmdArgsTemplate, {"cwd": projectPath});

	// get username, uid and gid to pass through to docker
	let envUSER = process.env.USER || ""; // fixme: check for win32 and point to USERNAME instead...
	let myGID = process.getegid() || "";
	let myUID = process.geteuid() || "";
	let envHOME = process.env.HOME || "";

	$(output).append(`<p class="output-line"><span class="loglevel info">projectpath: </span>`+ project.absolutePath +`</p>`);
	$(output).on("scroll", scrollHandler);

	// cmdArgsTemplate need to contain dev_appdocker.py and cmd needs to point to docker...
	let proc = spawn("docker run --rm --name devappdocker -p 8080:8080 -p 8000:8000 \
	-v " + envHOME + "/.config/gcloud:/home/dockeruser/.config/gcloud -v " + project.absolutePath.toString() + ":/home/dockeruser/workspace \
        gcloud-py3:latest /bin/bash -c \"userdel dockeruser; addgroup --gid " + myGID + " $USER; \
        useradd --no-create-home --home /home/dockeruser --gid " + myGID + " --uid " + myUID + " $USER; \
        su - $USER -s /bin/bash -c 'export PATH=$PATH:/home/dockeruser/google-cloud-sdk/bin; export CLOUDSDK_CORE_DISABLE_PROMPTS=1; cd /home/dockeruser/workspace; bash /home/dockeruser/workspace/local_run.sh \
        --admin_host=0.0.0.0 --admin_port=8000 --host=0.0.0.0 --port=8080'\"", {cwd: project.absolutePath, shell: true});

	//$(output).append(`<p class="output-line"><span class="loglevel info">command output: </span>`+ proc.stdout +`</p>`);
	//$(output).on("scroll", scrollHandler);

	ipc.send('local-devserver-started', project.internalId, proc.pid);
	let parentWindow = BrowserWindow.fromId(fromWindowId);
	parentWindow.webContents.send("local-devserver-started", project.internalId, proc.pid);

	$(".js-close").on("click", function () {
		parentWindow.send('local-devserver-minimized', project.internalId);
	});

	proc.stdout.on("data", (chunk: WriteStream) => {
		handleOutput(chunk, true);
	});

	proc.stderr.on("data", (chunk: WriteStream) => {
		handleOutput(chunk, true);
	});
}

ipc.on("start-instance", function (event: Event, project: ProjectInterface, applicationId: string, fromWindowId: number) {
	console.log("on start-instance", project, applicationId, fromWindowId);
	let title = `Instance: ${applicationId}`;
	$(".logo-title").text(title);
	let foregroundColor = settingsStorage.get("terminal_foreground_color", "#00ff00");
	let backgroundColor = settingsStorage.get("terminal_background_color", "#000000");
	$(".output").css(
		{
			"color": foregroundColor,
			"background-color": backgroundColor
		}
	);

	startLocalInstance(project, applicationId, fromWindowId);
});
