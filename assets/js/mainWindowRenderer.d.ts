declare const VcLogEntryStatus: any;
declare const fs: any;
declare const path: any;
declare const renderer: any;
declare const electron: any;
declare const $: any;
declare const BrowserWindow: any;
declare const ipc: any;
declare const shell: any;
declare const moment: any;
declare const ElectronStorage: any;
declare const url: any;
declare const settingsStorage: any;
declare const versionsStorage: any;
declare const projectStorage: any;
declare const labelStorage: any;
declare const regionsStorage: any;
declare const domainMappingsStorage: any;
declare const gcloudProjectStorage: any;
declare const electronPositioner: any;
declare const Positioner: any;
declare const defaultFlagsTpl: any;
declare const projectsByInternalId: Map<string, ProjectInterface>;
declare const projects: any[];
declare const versionsCache: Map<any, any>;
declare const subprocessIds: Map<any, any>;
declare const projectWindows: Map<any, any>;
declare const gcloudProjectByApplicationId: Map<any, any>;
declare const labelCache: Map<any, any>;
declare const usedServerPortMap: Map<any, any>;
declare const usedAdminPortMap: Map<any, any>;
declare const projectItemTemplate: any;
declare const projectControlsTemplate: any;
declare const projectConfigTemplate: any;
declare const projectRemoteTemplate: any;
declare const projectVersionsTemplate: any;
declare const projectApplicationTemplate: any;
declare const projectConfigApplicationsTemplate: any;
declare const projectCredentialsRow: any;
declare const regionsTemplate: any;
declare const domainMappingTemplate: any;
declare let thisWindowId: any;
interface AppengineDirectoryInterface {
    value: string;
    checked: boolean;
}
interface ApplictionIdInterface {
    value: string;
    checked: boolean;
}
interface CredentialEntryInterface {
    applicationId: string;
    username: string;
    password: string;
}
interface ProjectIconInterface {
    url: string;
}
interface ProjectTaskInterface {
    id: string;
}
interface ProjectInterface {
    absolutePath: string;
    directoryName: string;
    appengineDirectories: Array<AppengineDirectoryInterface>;
    applicationIds: Array<ApplictionIdInterface>;
    credentials: Array<CredentialEntryInterface>;
    internalId: string;
    serverPort: number;
    adminPort: number;
    custom_devserver_cmd: string;
    tasks: Array<ProjectTaskInterface>;
    projectIcon: ProjectIconInterface;
    created: boolean;
}
interface RawLabelsInteface {
    [propName: string]: string;
}
interface GcloudApplicationIdEntryInterface {
    name: string;
    labels: RawLabelsInteface;
    created: boolean;
}
interface GcloudApplicationIdsInterface {
    gcloudProjectIds: Array<GcloudApplicationIdEntryInterface>;
}
/** This will hold an array of existing gcloud app/project ids got either from gcloudProjectStorage or from gcloud itself
 *
 */
declare let gcloudApplicationIds: GcloudApplicationIdsInterface;
declare let currentInternalId: string;
declare let debug: boolean;
declare let appPath: any;
declare let labelList: any[];
declare let isGcloudAuthorized: boolean;
declare let loggerEntryCount: number;
/** this variable will hold a cloned instance of the project we're currently have active.
 *  Changes to that object will not survive a project change,
 *  so make your changes to the original project object found in projects or projectsByInternalId
 */
declare let currentProject: any;
declare let loggerWindow: any;
declare function deepClone(obj: any): any;
declare function updateProjectSpecFile(internalId: any): void;
declare function projectSorter(a: any, b: any): 1 | -1;
declare function prepareProject(project: any, initials: any, isNew?: boolean): void;
declare function onIndexesDirtyCheck(currentProject: any): void;
declare function onIndexesDirtyCheckResponse(event: any, result: any): void;
declare function loadVersions(): void;
declare function getProjectVersions(event?: Event, refresh?: boolean): void;
declare function toggleDevServer(event: any): void;
declare function addProject(): void;
declare function startTasks(event?: Event): void;
declare function reloadApplicationIds(): void;
declare function openLocalInstance(event: any): boolean;
declare function openLocalVi(event: any): boolean;
declare function openLocalAdminConsole(event: any): boolean;
declare function switchToProjectConfigPane(): void;
declare function switchToProjectLocalPane(): void;
declare function switchToProjectDeploymentPane(): void;
declare function projectPaneSelected(event: any, paneId: any): void;
declare function removeApplicationIdFromProject(event: any): void;
declare function addApplicationIdToProject(): void;
declare function deployProject(): void;
declare function createAppengineInstance(): void;
declare function checkAppengineInstance(refresh?: boolean): void;
declare function checkGcloudAuthStatus(): void;
declare function checkGcloudAuthStatusResponse(event: any, status: any, accounts: any, errors: any): void;
declare function updateIndexes(): void;
declare function migrateVersion(): void;
declare function searchProject(event: any): void;
declare function checkVersion(): boolean;
declare function fillNextVersion(initials?: string): void;
declare function setDefaultApplicationId(event: any): void;
declare function saveLabels(customLabelList?: any): void;
declare function loadLabelCache(event?: Event): void;
/**
 * Scans all applicationId entries for labels, find label icons, builds an internal cache map and saves to label storage of changed
 */
declare function processApplicationIdLabels(): void;
declare function amendLabelIcons(projectClone: any): void;
declare function onProjectSelected(event: any, internalIdOverwrite?: any): void;
declare function onDevserverFlagsChanged(event: any): void;
declare function versionLinkClicked(event: any): boolean;
declare function requestProjectsScan(refresh?: boolean): void;
declare function requestLabelSettings(event: any): void;
declare function requestScanNewProject(event: any, projectName: any): void;
declare function requestGcloudProjects(update?: boolean): void;
declare function requestGetAppengineRegions(): void;
declare function onRequestDomainMappings(refresh?: boolean): void;
declare function onRequestDomainMappingsResponse(event: any, result: any): void;
declare function onRequestSubprocessIds(): void;
declare function onRequestSubprocessIdsResponse(event: any, subprocessIdsFromMain: any, projectWindowsFromMain: any): void;
declare function onInternalVerify(event: any): void;
declare function onRequestTaskChecks(): void;
declare function onServerPortChanged(event: any): void;
declare function onAdminPortChanged(event: any): void;
declare function onRequestTaskChecksDone(event: any, results: any): void;
declare function onRemoveIcon(): void;
declare function onBackToHome(): void;
declare function onOpenDocumentation(event: any): void;
declare function toggleVcLogger(event: Event): void;
declare function startVcLogger(event: any): void;
declare function onWindowReady(event: any, mainWindowId: any, userDir: any, debugMode?: boolean): void;
declare function onDeploymentDialogAnswer(event: any, index: any, absolutePath: any, applicationId: any, version: any): void;
declare function onRequestGcloudProjectsResponse(event: Event, data: GcloudApplicationIdsInterface, update: boolean): void;
declare function onProjectsRefresh(): void;
declare function onProjectsFound(event: any, incomingProjects: any): void;
declare function onProjectFound(event: any, project: any, isNew: any): void;
declare function onCredentialsFound(event: any, applicationId: any, username: any, password: any): void;
declare function onRequestVersionsResponse(event: any, versions: any): void;
declare function onSettingsStringChanged(event: any, name: any, value: any): void;
declare function onProjectIconChanged(event: any, internalId: any, iconPath: any): void;
declare function onLocalDevServerStarted(event: any, internalId: any, processId: any): void;
declare function onLocalDevServerMinimized(event: any, internalId: any): void;
declare function onOpenViurSite(event: Event): boolean;
declare function onOpenConsoleLog(event: Event): boolean;
declare function onOpenConsoleDashboard(): boolean;
declare function onRescanProjectsDone(): void;
declare function onRefreshVersions(): void;
declare function onRescanLabels(): void;
declare function onSaveLabels(event: any, remoteLabels: any): void;
declare function onCatchErrors(event: any, taskName: any, error: any): void;
declare function onRequestCheckAppengineStatusResponse(event: any, applicationId: any, result: any): void;
declare function onRequestAppengineRegionsResponse(event: any, result: any): void;
declare function onRequestCreateAppengineResponse(event: any, applicationId: any): void;
declare function addLogEntry(logEntry: any): void;
declare function onVcLoggerEntryCount(event: any, count: any): void;
