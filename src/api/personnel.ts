import request from '@/utils/request'
import type { ApiResponse, PageResult } from './common'

export type PersonnelRole = 1 | 2 | 3 | 4

export interface PersonnelRecord {
  user_id: number
  user__uuid: string
  username: string
  nickname: string
  role: PersonnelRole | number
  tel: string
  email: string
  createtime: string
}

export interface PersonnelQuery {
  page: number
  pageSize: number
  role?: number | ''
  keyword?: string
}

export interface PersonnelSavePayload {
  user_id?: number
  username: string
  password?: string
  nickname: string
  role: PersonnelRole
  tel: string
  email: string
}

export function getPersonnelPage(params: PersonnelQuery) {
  return request.get<any, ApiResponse<PageResult<PersonnelRecord>>>('/charging-aiot-php/api/information-management/personnel/page.php', { params })
}

export function createPersonnel(data: PersonnelSavePayload) {
  return request.post<any, ApiResponse<{ user_id: number }>>('/charging-aiot-php/api/information-management/personnel/create.php', data)
}

export function updatePersonnel(data: PersonnelSavePayload) {
  return request.put<any, ApiResponse<null>>('/charging-aiot-php/api/information-management/personnel/update.php', data)
}

export function deletePersonnel(user_id: number) {
  return request.delete<any, ApiResponse<null>>('/charging-aiot-php/api/information-management/personnel/delete.php', { data: { user_id } })
}
