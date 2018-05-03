## Daten In/out

### credentials.json

* optionally exists on top level in your project path
* new credentials gets merged with the files content.
* manual editing is allowed and expected.
* credentials.json gets read and merged into projects.json storage on project (re-)scans
* exact structure description can be found in the schemata directory

### project-spec.json

* optionally exists on top level in your project path 
* files get read and merged into projects.json storage on project (re-)scans
* if it not exists, a file with the bare minimum of information gets written
* manual editing is allowed and expected
* is intended to be stored in your project repository to share with teammates
* manual editing is allowed and expected.
* applicationIds
	* changed by user action. e.g adding or removing applicationIds
	* the file is authoritative source on project (re-)scans
* tasks
	+ only created once when missing, otherwise not changed
	* the file is authoritative source on project (re-)scans
	* automatic detection of gulp and makefile tasks in the project path on project rescans
* projectIcon
	* changed by user action, e.g add or remove the project icon
	* only icons in project path are allowed
* exact structure description can be found in the schemata directory

## projects.json

* manual editing is not expected and error prone in terms of e.g data collisions.
* internalId
	* former values should be kept.
    * uuid4 value
* adminPort
	* should be unique on all projects to able to run in parallel 
* serverPort
	* should be unique on all projects to able to run in parallel
* absolutePath
	* computed by path.join of "project_directory" of settings and directory name
* addedByScan
	* reserved for future internal usage
* credentials
	* merged in from credentials.json content
* directoryName
	* fixed by filesystem directory name
* project_storage_version
	* data layout version marker
	* is used to automatically adapt/upgrade information structure of this file
	* integer incremented by one for each compatibility breaking change
* exact structure description can be found in the schemata directory