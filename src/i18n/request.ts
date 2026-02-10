import { getRequestConfig } from 'next-intl/server'
import he from '../../messages/he.json'
import en from '../../messages/en.json'

const messages: Record<string, typeof he> = { he, en }

export default getRequestConfig(async () => {
  const locale = 'he'

  return {
    locale,
    messages: messages[locale]
  }
})
