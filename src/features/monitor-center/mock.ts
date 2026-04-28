export interface PlaybackItem {
  id: number
  name: string
  recordTime: string
  coverText: string
  videoUrl: string
}

export const MONITOR_PLAYBACK_LIST: PlaybackItem[] = [
  {
    id: 1,
    name: '篮球录像 1',
    recordTime: '2026-04-11 08:12:22',
    coverText: 'BASKETBALL-GAME-H1',
    videoUrl: 'http://172.18.7.124/videos/basketball/GAME_H1.mp4'
  },
  {
    id: 2,
    name: '篮球录像 2',
    recordTime: '2026-04-11 08:52:11',
    coverText: 'BASKETBALL-GAME-H2',
    videoUrl: 'http://172.18.7.124/videos/basketball/GAME_H2.mp4'
  },
  {
    id: 3,
    name: '行人录像',
    recordTime: '2026-04-11 09:01:49',
    coverText: 'PEOPLE-P',
    videoUrl: 'http://172.18.7.124/videos/people/p.mp4'
  }
]
