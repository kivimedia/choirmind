import bcrypt from 'bcryptjs'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'passwordTooShort' }
  }
  // At least one letter (Hebrew or Latin) and one digit
  const hasLetter = /[\p{L}]/u.test(password)
  const hasDigit = /\d/.test(password)
  if (!hasLetter || !hasDigit) {
    return { valid: false, error: 'passwordTooWeak' }
  }
  return { valid: true }
}
