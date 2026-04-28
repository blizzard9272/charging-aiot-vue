import request from '@/utils/request'
import type { ApiResponse } from './common'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginUserInfo {
  user_id: number
  user__uuid: string
  username: string
  role: number
}

export interface LoginResult {
  token: string
  tokenType: string
  expiresIn: number
  expiresAt: number
  user: LoginUserInfo
}

export function login(data: LoginRequest) {
  return request.post<any, ApiResponse<LoginResult>>('/charging-aiot-php/api/auth.php?action=login', data)
}

export function getCurrentUser() {
  return request.get<any, ApiResponse<LoginUserInfo>>('/charging-aiot-php/api/auth.php?action=me')
}
