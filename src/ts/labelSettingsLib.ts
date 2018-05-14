import {exec} from "child_process";


/** This interface should be used for raw label data which is stored e.g to our labelStorage
 *
 */
export interface StoredLabelInterface {
	title: string;
	path?: string;
}

export function StoredLabelInterfaceSorter(a: StoredLabelInterface, b: StoredLabelInterface) {
	return a.title < b.title ? -1 : 1;
}

/** This interface should be used when handling viur-control internal label data.
 * This path to label icons should be absolute, ids are strictly monotonous incremented.
 *
 */
export interface LabelInternalInterface {
	title: string;
	path: string;
	id: number;
}

export function LabelInternalInterfaceSorter(a: LabelInternalInterface, b: LabelInternalInterface) {
	return a.title < b.title ? -1 : 1;
}

export function refreshAllLabels(callback: (error: Error, result: Array<StoredLabelInterface>) => void): void {
	exec("gcloud --format json projects list",
		{},
		function(error: Error, stdout: string, stderr: string) {
			let cache : Set<string> = new Set();
			let result : Array<StoredLabelInterface> = [];
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
						result.push({title: cacheKey});
					}
				}
			}
			result.sort(StoredLabelInterfaceSorter);
			callback(null, result);
		});
}
