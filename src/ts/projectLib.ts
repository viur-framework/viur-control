"use strict";

const {spawn} = require('child_process');


export interface RawLabelsInterface {
	[propName: string]: string;
}

export interface GcloudApplicationIdEntryInterface {
	name: string;
	labels: RawLabelsInterface;
	created: boolean;
}

export function GcloudApplicationIdEntrySorter(a: GcloudApplicationIdEntryInterface,
                                        b: GcloudApplicationIdEntryInterface) {
	if (a.name < b.name)
		return -1;
	if (a.name > b.name)
		return 1;
	return 0;
}

export function OnRequestGcloudProjects(event: Event): any {
	spawn(
		"gcloud",
		["--format", "json", "projects", "list"],
		{},
		function (error: string, stdout: string, stderr: string) {
			if (error) {
				console.log("gcloud projects list error", error);
				return null;
			}
			let rawData = JSON.parse(stdout.toString());
			let gcloudProjects: Array<GcloudApplicationIdEntryInterface> = [];
			for (let gcloudProject of rawData) {
				let labels = gcloudProject.labels;
				if (!labels) {
					labels = {};
				}
				let item = {"name": gcloudProject.projectId, "labels": labels, "created": false};
				gcloudProjects.push(item);
			}
			gcloudProjects.sort(GcloudApplicationIdEntrySorter);
			return gcloudProjects;
		});
}

