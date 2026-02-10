'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import Button from '@/components/ui/Button'

export default function Navbar() {
  const { data: session, status } = useSession()
  const t = useTranslations('nav')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const isDirector = session?.user?.role === 'director'

  // Close user dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const navLinks = [
    { href: '/', label: t('home') },
    { href: '/songs', label: t('songs') },
    { href: '/practice', label: t('practice') },
    { href: '/dashboard', label: t('dashboard') },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold text-primary"
        >
          <span aria-hidden="true">&#127925;</span>
          <span>ChoirMind</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
          {isDirector && (
            <Link
              href="/director"
              className="rounded-lg px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
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
                <span className="max-w-[120px] truncate">
                  {session.user.name || session.user.email}
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
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {isDirector && (
              <Link
                href="/director"
                className="rounded-lg px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                onClick={() => setMobileMenuOpen(false)}
              >
                {t('director')}
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
