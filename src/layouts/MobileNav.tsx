import { NavLink, useLocation } from 'react-router'
import { navigationItems } from '../app/navigation'
import { MaterialIcon } from '../components/MaterialIcon'

export function MobileNav() {
  const location = useLocation()
  return (
    <nav className="mobile-nav" aria-label="移动端菜单">
      {navigationItems.slice(0, 4).map((item) => (
        <NavLink
          key={item.to}
          className={item.match.some((path) => location.pathname.startsWith(path)) ? 'mobile-nav-item active' : 'mobile-nav-item'}
          to={item.to}
        >
          <MaterialIcon name={item.icon} />
          <span>{item.label.replace('工作台', '')}</span>
        </NavLink>
      ))}
    </nav>
  )
}
