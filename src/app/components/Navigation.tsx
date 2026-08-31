import {
  BookOpen,
  GameController,
  House,
  Notebook,
  PencilSimpleLine,
  Toolbox,
  type Icon,
} from '@phosphor-icons/react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { navigationItems, type RouteId } from '../routes'

const navigationIcons: Record<RouteId, Icon> = {
  today: House,
  textbook: BookOpen,
  practice: PencilSimpleLine,
  games: GameController,
  mistakes: Notebook,
  toolbox: Toolbox,
}

type NavigationProps = {
  activeRoute: RouteId
  onNavigate?: (route: RouteId) => void
}

export function Navigation({ activeRoute, onNavigate }: NavigationProps) {
  function navigate(route: RouteId) {
    onNavigate?.(route)
  }

  function handleNavigate(event: MouseEvent<HTMLAnchorElement>, route: RouteId) {
    event.preventDefault()
    navigate(route)
  }

  function handleKeyNavigate(event: KeyboardEvent<HTMLAnchorElement>, route: RouteId) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
      return
    }

    event.preventDefault()
    navigate(route)
  }

  return (
    <nav className="primary-navigation" aria-label="主导航">
      <ul className="primary-navigation__list">
        {navigationItems.map((item) => {
          const Icon = navigationIcons[item.id]
          const isActive = item.id === activeRoute

          return (
            <li key={item.id} className="primary-navigation__item">
              <a
                className="primary-navigation__link"
                href={item.href}
                aria-label={item.id === 'mistakes' ? '错词本' : item.id === 'toolbox' ? '工具箱' : undefined}
                aria-current={isActive ? 'page' : undefined}
                onClick={(event) => handleNavigate(event, item.id)}
                onKeyDown={(event) => handleKeyNavigate(event, item.id)}
              >
                <Icon aria-hidden="true" weight={isActive ? 'fill' : 'bold'} />
                <span>{item.label}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
