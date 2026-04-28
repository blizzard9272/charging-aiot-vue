export interface CameraDeviceVO {
  deviceId: number;
  deviceUuid: string;
  deviceName: string;
  brand: string;
  model: string | null;
  ipAddress: string;
  port: number | null;
  location: string;
  protocolType: 1 | 2 | 3 | number;
  onlineStatus: 0 | 1;
  groupName: string | null;
  pathId: number | null;
  pathUuid: string;
  pathName: string;
  sourceUrl: string | null;
  streamType: number | null;
  recordEnabled: 0 | 1 | number;
  recordPath: string;
  recordFormat: string;
  recordPartDuration: number | null;
  pathStatusFlag: 0 | 1 | number | null;
  defaultStreamUrl: string | null;
  defaultStreamProtocol: number | string | null;
  isRecording: 0 | 1;
  statusFlag?: 0 | 1 | 4;

  // 兼容旧逻辑的可选字段
  id?: number;
  playUrl?: string | null;
  streamProtocol?: string | number | null;
}

export interface DeviceFormDTO {
  groupId: number;
  groupName: string;
  deviceId: number;
  deviceName: string;
  deviceUuid: string;
  brand: string;
  model: string;
  protocolType: number;
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  location: string;
  onlineStatus: number;
  statusFlag: number;
  pathId?: number | null;
  pathUuid?: string;
  pathName: string;
  sourceUrl: string;
  streamType?: number;
  recordEnabled: number;
  recordPath: string;
  recordFormat: string;
  recordPartDuration: number;
  pathStatusFlag?: number;
}

export interface DeviceStreamVO {
  streamId: number;
  streamUuid: string;
  deviceId: number;
  streamType: number | null;
  transportProtocol: number | null;
  streamUrl: string;
  defaultFlag: number | null;
  statusFlag: number | null;
  createTime: string | null;
  modifyTime: string | null;
}

export interface DeviceQueryParams {
  deviceName?: string;
  brand?: string;
  model?: string;
  ipAddress?: string;
  groupId?: number | '';
  protocolType?: number | '';
  onlineStatus?: number | '';
  statusFlag?: number | '';
  page: number;
  pageSize: number;
}

export interface MonitorGroupVO {
  id: number;
  groupName: string;
}

export interface CreateDeviceDTO {
  deviceUuid?: string;
  groupId: number;
  deviceName: string;
  brand: string;
  model: string;
  protocolType: 1 | 2 | 3 | number;
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  confirmPassword: string;
  location: string;
  onlineStatus?: 0 | 1;
  streamType: 1 | 2;
  pathName: string;
  recordEnabled?: 0 | 1;
  recordPath?: string;
  recordFormat?: string;
  recordPartDuration?: number;
}
