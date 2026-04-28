import request from '@/utils/request'
import type { ApiResponse, PageResult } from './common'
import type {
  CameraDeviceVO,
  DeviceQueryParams,
  DeviceFormDTO,
  MonitorGroupVO,
  DeviceStreamVO,
  CreateDeviceDTO
} from '@/shared/types/monitor-center'


export interface SyncCameraConfigResult {
  total: number
  successCount: number
  failedCount: number
  skippedCount: number
  failedItems: Array<{
    pathId: number
    deviceId: number
    pathName: string
    code: number
    error: any
  }>
  skippedItems: Array<{
    pathId: number
    deviceId: number
    pathName: string
    reason: string
  }>
}

export interface MediaMtxHealthResult {
  nowTs: number
  nowAt: string | null
  intervalSeconds: number
  lastAttemptTs: number | null
  lastAttemptAt: string | null
  lastSuccessTs: number | null
  lastSuccessAt: string | null
  lastFailedCount: number
  nextDueInSeconds: number
  lastError: string
  lastSummary: SyncCameraConfigResult | null
  mediaMtxApiReachable: boolean
  mediaMtxApiCode: number
  mediaMtxApiMessage: string
}

export interface WorkbenchAuditStats {
  groupCount: number
  deviceCount: number
  onlineDeviceCount: number
  pathCount: number
  createCount: number
  queryCount: number
  deleteCount: number
  rollbackCount: number
  errorCount: number
}

export interface WorkbenchAuditLog {
  log_id: number
  event_type: string
  action_name: string
  device_id: number | null
  group_id: number | null
  path_name: string | null
  result_status: number
  error_message: string | null
  create_time: string
}

export interface WorkbenchAuditResult {
  stats: WorkbenchAuditStats
  operationLogs: WorkbenchAuditLog[]
  operationPage?: {
    currentPage: number
    pageSize: number
    total: number
  }
  rollbackLogs: Array<Record<string, any>>
  errorLogs: Array<Record<string, any>>
}

export interface DeleteDeviceCheckResult {
  deviceId: number
  deviceName: string
  groupId: number | null
  pathName: string
  mediaMtxPathExists: boolean
  mediaMtxCheckSuccess: boolean
  mediaMtxCheckCode: number
  mediaMtxCheckMessage: string
}

export interface MonitorPlaybackItem {
  id: number
  name: string
  recordTime: string
  coverText: string
  videoUrl: string
  videoPath?: string
  fileSize?: number
}

export interface MonitorPlaybackListResult {
  total: number
  records: MonitorPlaybackItem[]
}

export interface GroupDeviceItem {
  deviceId: number
  deviceName: string
  brand: string
  model: string
  protocolType: number | null
  ipAddress: string
  port: number | null
  location: string
  onlineStatus: number | null
  statusFlag: number | null
}

export interface GroupDeviceListItem {
  groupId: number
  groupUuid: string | null
  groupName: string
  sort: number
  statusFlag: number
  createTime: string | null
  modifyTime: string | null
  deviceCount: number
  devices: GroupDeviceItem[]
}

export interface GroupSaveDTO {
  groupId?: number
  groupName: string
  sort: number
  statusFlag: 0 | 1 | number
}

export function getMonitorList(params: DeviceQueryParams) {
  return request.get<any, ApiResponse<PageResult<CameraDeviceVO>>>('/charging-aiot-php/api/monitor-center/device-center/list.php', { params })
}

// 鍚屾閰嶇疆
export function syncCameraConfig() {
  return request.get<any, ApiResponse<SyncCameraConfigResult>>('/charging-aiot-php/api/monitor-center/device-center/sync-camera-config.php')
}

export function getMediaMtxHealth() {
  return request.get<any, ApiResponse<MediaMtxHealthResult>>('/charging-aiot-php/api/monitor-center/device-center/media-mtx-health.php')
}

// 宸ヤ綔鍙板璁＄湅鏉?
export function getWorkbenchAudit(params?: {
  limit?: number
  page?: number
  pageSize?: number
  startTime?: string
  endTime?: string
  eventType?: string
  keyword?: string
  resultStatus?: 0 | 1
}) {
  return request.get<any, ApiResponse<WorkbenchAuditResult>>('/charging-aiot-php/api/monitor-center/workbench/audit.php', { params })
}

export function getMonitorPlaybackList(params?: {
  page?: number
  pageSize?: number
  videoName?: string
  startTime?: string
  endTime?: string
}) {
  return request.get<any, ApiResponse<MonitorPlaybackListResult>>('/charging-aiot-php/api/monitor-center/video-list/list.php', { params })
}

// 鑾峰彇璁惧琛ㄥ崟鍥炴樉鍐呭
export function getDeviceForm(id: number) {
  return request.get<any, ApiResponse<DeviceFormDTO>>('/charging-aiot-php/api/monitor-center/device-center/form.php', {
    params: { id }
  })
}

// 鑾峰彇璁惧鎵€鏈夋祦锛堢粺涓€浠?sys_camera_path 鑱氬悎锛?
export function getDeviceStreams(id: number) {
  return request.get<any, ApiResponse<DeviceStreamVO[]>>('/charging-aiot-php/api/monitor-center/device-center/streams.php', {
    params: { id }
  })
}

// 鑾峰彇鍒嗙粍鍒楄〃
export function getMonitorGroups() {
  return request.get<any, ApiResponse<MonitorGroupVO[]>>('/charging-aiot-php/api/monitor-center/group-management/list.php')
}

// 鑾峰彇鍒嗙粍鍙婂叾璁惧鍒楄〃
export function getMonitorGroupDeviceList(params?: { groupName?: string; statusFlag?: number | '' }) {
  return request.get<any, ApiResponse<GroupDeviceListItem[]>>('/charging-aiot-php/api/monitor-center/group-management/device-list.php', { params })
}

export function createMonitorGroup(data: GroupSaveDTO) {
  return request.post<any, ApiResponse<{ groupId: number }>>('/charging-aiot-php/api/monitor-center/group-management/create.php', data)
}

export function updateMonitorGroup(data: GroupSaveDTO) {
  return request.put<any, ApiResponse<null>>('/charging-aiot-php/api/monitor-center/group-management/update.php', data)
}

// 鏇存柊璁惧
export function updateMonitorDevice(data: DeviceFormDTO) {
  return request.put<any, ApiResponse<null>>('/charging-aiot-php/api/monitor-center/device-center/update.php', data)
}

// 鏂板璁惧
export function createMonitorDevice(data: CreateDeviceDTO) {
  return request.post<any, ApiResponse<{ deviceId: number }>>('/charging-aiot-php/api/monitor-center/device-center/create.php', data)
}

// 鍒犻櫎鍓嶆鏌?MediaMTX 閰嶇疆
export function getDeleteMonitorDeviceCheck(deviceId: number, timeout = 800) {
  return request.get<any, ApiResponse<DeleteDeviceCheckResult>>('/charging-aiot-php/api/monitor-center/device-center/delete-check.php', {
    params: { id: deviceId },
    timeout,
    headers: {
      'X-Silent-Error': '1'
    }
  })
}

// 鍒犻櫎璁惧
export function deleteMonitorDevice(deviceId: number) {
  return request.delete<any, ApiResponse<null>>('/charging-aiot-php/api/monitor-center/device-center/delete.php', {
    data: { deviceId }
  })
}


