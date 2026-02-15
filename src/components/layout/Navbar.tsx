'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'
import { useChoirStore } from '@/stores/useChoirStore'

export default function Navbar() {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [choirMenuOpen, setChoirMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const choirMenuRef = useRef<HTMLDivElement>(null)

  const isDirector = session?.user?.role === 'director'
  const isAdmin = session?.user?.role === 'admin'

  const { activeChoirId, choirs, setActiveChoirId, loadChoirs } = useChoirStore()

  // Load choirs on mount when authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      loadChoirs()
    }
  }, [status, loadChoirs])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false)
      }
      if (
        choirMenuRef.current &&
        !choirMenuRef.current.contains(event.target as Node)
      ) {
        setChoirMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeChoir = choirs.find((c) => c.id === activeChoirId)
  const isActiveDirector = activeChoir?.role === 'director'

  const navLinks = [
    { href: '/', label: t('home') },
    { href: '/songs', label: t('songs') },
    { href: '/practice', label: t('practice') },
    { href: '/vocal-practice/history', label: t('recordings') },
    { href: '/dashboard', label: t('dashboard') },
  ]

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo + Choir Switcher */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-bold text-primary"
          >
            <span aria-hidden="true">&#127925;</span>
            <span>ChoirMind</span>
          </Link>

          {/* Choir Switcher - shown when user has choirs */}
          {choirs.length > 0 && (
            <div className="relative" ref={choirMenuRef}>
              <button
                type="button"
                onClick={() => choirs.length > 1 || isAdmin ? setChoirMenuOpen((prev) => !prev) : undefined}
                className={[
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors',
                  choirs.length > 1 || isAdmin
                    ? 'text-foreground hover:bg-surface-hover cursor-pointer'
                    : 'text-text-muted cursor-default',
                ].join(' ')}
              >
                <span className="max-w-[140px] truncate">
                  {activeChoir?.name ?? t('allChoirs')}
                </span>
                {(choirs.length > 1 || isAdmin) && (
                  <svg
                    className={`h-3.5 w-3.5 text-text-muted transition-transform ${
                      choirMenuOpen ? 'rotate-180' : ''
                    }`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {choirMenuOpen && (
                <div className="absolute top-full start-0 mt-1 w-56 rounded-xl border border-border bg-surface py-1 shadow-lg z-50">
                  {choirs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveChoirId(null)
                        setChoirMenuOpen(false)
                      }}
                      className={[
                        'flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-surface-hover',
                        !activeChoirId ? 'text-primary font-medium' : 'text-foreground',
                      ].join(' ')}
                    >
                      {!activeChoirId && (
                        <svg className="h-4 w-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {!activeChoirId ? '' : <span className="w-4" />}
                      {t('allChoirs')}
                    </button>
                  )}
                  {choirs.map((choir) => (
                    <button
                      key={choir.id}
                      type="button"
                      onClick={() => {
                        setActiveChoirId(choir.id)
                        setChoirMenuOpen(false)
                      }}
                      className={[
                        'flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-surface-hover',
                        activeChoirId === choir.id ? 'text-primary font-medium' : 'text-foreground',
                      ].join(' ')}
                    >
                      {activeChoirId === choir.id ? (
                        <svg className="h-4 w-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className="truncate">{choir.name}</span>
                      {choir.role === 'director' && (
                        <span className="ms-auto text-[12px] font-medium text-primary/70">&#9733;</span>
                      )}
                    </button>
                  ))}
                  {/* Manage choir link for directors */}
                  {isActiveDirector && activeChoirId && (
                    <>
                      <hr className="my-1 border-border" />
                      <Link
                        href={`/choir/${activeChoirId}/manage`}
                        className="block px-4 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                        onClick={() => setChoirMenuOpen(false)}
                      >
                        {t('manageChoir')}
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={[
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                isActive(link.href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-surface-hover hover:text-primary',
              ].join(' ')}
            >
              {link.label}
            </Link>
          ))}
          {(isDirector || isAdmin) && (
            <Link
              href="/director"
              className={[
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                isActive('/director')
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-primary hover:bg-primary/10',
              ].join(' ')}
            >
              {t('director')}
            </Link>
          )}
        </div>

        {/* Desktop user section */}
        <div className="hidden items-center gap-3 md:flex">
          {status === 'authenticated' && session?.user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                {/* Avatar placeholder */}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {session.user.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
                <span className="max-w-[200px] truncate">
                  {session.user.name || session.user.email?.replace(/@gmail\.com$/, '')}
                </span>
                {/* Chevron */}
                <svg
                  className={`h-4 w-4 text-text-muted transition-transform ${
                    userMenuOpen ? 'rotate-180' : ''
                  }`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute top-full end-0 mt-1 w-48 rounded-xl border border-border bg-surface py-1 shadow-lg">
                  <Link
                    href="/vocal-practice/history"
                    className="block px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {t('recordings')}
                  </Link>
                  <Link
                    href="/profile"
                    className="block px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {t('profile')}
                  </Link>
                  <Link
                    href="/settings"
                    className="block px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    {t('settings')}
                  </Link>
                  <hr className="my-1 border-border" />
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      signOut({ callbackUrl: '/' })
                    }}
                    className="block w-full px-4 py-2.5 text-start text-sm text-danger transition-colors hover:bg-surface-hover"
                  >
                    {t('logout')}
                  </button>
                </div>
              )}
            </div>
          ) : status === 'unauthenticated' ? (
            <Link href="/auth/signin">
              <Button variant="primary" size="sm">
                {t('login')}
              </Button>
            </Link>
          ) : null}
        </div>

        {/* Mobile hamburger button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-surface-hover md:hidden"
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <svg
              className="h-6 w-6"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="h-6 w-6"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-border bg-surface px-4 pb-4 pt-2 md:hidden">
          {/* Mobile choir switcher */}
          {choirs.length > 1 && (
            <div className="mb-2">
              <p className="px-4 py-1 text-xs font-medium text-text-muted uppercase">{t('allChoirs')}</p>
              <div className="flex flex-wrap gap-1.5 px-4 py-1">
                {choirs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChoirId(null)
                    }}
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      !activeChoirId
                        ? 'bg-primary text-white'
                        : 'bg-surface-hover text-foreground hover:bg-border',
                    ].join(' ')}
                  >
                    {t('allChoirs')}
                  </button>
                )}
                {choirs.map((choir) => (
                  <button
                    key={choir.id}
                    type="button"
                    onClick={() => {
                      setActiveChoirId(choir.id)
                    }}
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      activeChoirId === choir.id
                        ? 'bg-primary text-white'
                        : 'bg-surface-hover text-foreground hover:bg-border',
                    ].join(' ')}
                  >
                    {choir.name}
                  </button>
                ))}
              </div>
              <hr className="my-2 border-border" />
            </div>
          )}

          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  'rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                  isActive(link.href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-surface-hover',
                ].join(' ')}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {(isDirector || isAdmin) && (
              <Link
                href="/director"
                className={[
                  'rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                  isActive('/director')
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-primary hover:bg-primary/10',
                ].join(' ')}
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('director')}
              </Link>
            )}
            {isActiveDirector && activeChoirId && (
              <Link
                href={`/choir/${activeChoirId}/manage`}
                className="rounded-lg px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('manageChoir')}
              </Link>
            )}
          </div>

          <hr className="my-2 border-border" />

          {status === 'authenticated' && session?.user ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3 px-4 py-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {session.user.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {session.user.name}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <Link
                href="/vocal-practice/history"
                className="rounded-lg px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('recordings')}
              </Link>
              <Link
                href="/profile"
                className="rounded-lg px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('profile')}
              </Link>
              <Link
                href="/settings"
                className="rounded-lg px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-hover"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('settings')}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false)
                  signOut({ callbackUrl: '/' })
                }}
                className="rounded-lg px-4 py-2.5 text-start text-sm text-danger transition-colors hover:bg-surface-hover"
              >
                {t('logout')}
              </button>
            </div>
          ) : status === 'unauthenticated' ? (
            <Link
              href="/auth/signin"
              className="block"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Button variant="primary" size="md" className="w-full">
                {t('login')}
              </Button>
            </Link>
          ) : null}
        </div>
      )}
    </header>
  )
}
