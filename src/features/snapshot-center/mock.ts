import type { Stream101VO, Stream102VO, Stream103VO } from '@/shared/types/snapshot-center'

export type MockStreamPacket = Stream101VO | Stream102VO | Stream103VO

const CAMERA_IDS = ['cam-a01', 'cam-a02', 'cam-b01', 'cam-c03', 'cam-d11', 'cam-e09']
const NAMES = ['张三', '李四', '王五', '赵六', '陈晨', '刘洋']
const IMAGE_POOL = [
  'http://localhost:8080/images/mock/snap_001.jpg',
  'http://localhost:8080/images/mock/snap_002.jpg',
  'http://localhost:8080/images/mock/snap_003.jpg',
  'http://localhost:8080/images/mock/snap_004.jpg',
  'http://localhost:8080/images/mock/snap_005.jpg'
]

const randomFrom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export const createMockProtocol101 = (timestamp = Date.now()): Stream101VO => {
  return {
    id: timestamp,
    msgType: 101,
    cameraId: randomFrom(CAMERA_IDS),
    deviceTimestamp: timestamp,
    payloadData: {
      object_count: Math.floor(Math.random() * 5) + 1,
      objects: []
    }
  }
}

export const createMockProtocol102 = (timestamp = Date.now()): Stream102VO => {
  const known = Math.random() > 0.35
  return {
    id: timestamp,
    msgType: 102,
    cameraId: randomFrom(CAMERA_IDS),
    deviceTimestamp: timestamp,
    payloadData: {
      person_name: known ? randomFrom(NAMES) : '未知人员',
      status: known ? '已录入' : '未知人员',
      track_id: Math.floor(Math.random() * 1000) + 1
    }
  }
}

export const createMockProtocol103 = (timestamp = Date.now()): Stream103VO => {
  return {
    id: timestamp,
    msgType: 103,
    cameraId: randomFrom(CAMERA_IDS),
    deviceTimestamp: timestamp,
    payloadData: {
      track_id: Math.floor(Math.random() * 1000) + 1,
      frame_image: randomFrom(IMAGE_POOL)
    }
  }
}

export const createMockMessagePacket = (timestamp = Date.now()): MockStreamPacket => {
  const kind = Math.random()
  if (kind < 0.35) return createMockProtocol101(timestamp)
  if (kind < 0.7) return createMockProtocol102(timestamp)
  return createMockProtocol103(timestamp)
}

export const createMockHistoryPackets = (count = 60): MockStreamPacket[] => {
  const now = Date.now()
  const packets: MockStreamPacket[] = []

  for (let i = 0; i < count; i += 1) {
    const ts = now - i * 8_000
    packets.push(createMockMessagePacket(ts))
  }

  return packets.sort((a, b) => b.deviceTimestamp - a.deviceTimestamp)
}
