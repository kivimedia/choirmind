import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role?: string
      voicePart?: string | null
      locale?: string
    }
  }

  interface User {
    id: string
    role?: string
    voicePart?: string | null
    locale?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub: string
  }
}
