export const navigationItems = [
  { id: 'today', label: '今天', href: '#today' },
  { id: 'textbook', label: '教材', href: '#textbook' },
  { id: 'practice', label: '练习', href: '#practice' },
  { id: 'games', label: '游戏', href: '#games' },
  { id: 'mistakes', label: '错词', href: '#mistakes' },
  { id: 'toolbox', label: '工具箱', href: '#toolbox' },
] as const

export type RouteId = (typeof navigationItems)[number]['id']
export type NavigationItem = (typeof navigationItems)[number]

export const routeLabels: Record<RouteId, string> = {
  today: '今天',
  textbook: '教材',
  practice: '练习',
  games: '游戏',
  mistakes: '错词',
  toolbox: '工具箱',
}
