export declare enum VcLogEntryStatus {
    STARTED = "Started",
    SUCCESS = "Success",
    WARNING = "Warning",
    ERROR = "Error",
}
export interface VcLogEntryInterface {
    creationdate: string;
    method: string;
    command: string;
    status: VcLogEntryStatus;
    msg: string;
}
export declare class VcLogEntry {
    creationdate: string;
    method: string;
    command: string;
    status: VcLogEntryStatus;
    msg: string;
    constructor(creationdate: string, method: string, command: string, status: VcLogEntryStatus, msg: string);
}
