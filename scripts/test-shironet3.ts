// Test with the exact same fetch logic as find-lyrics.ts

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function main() {
  const title = 'ירושלים של זהב'
  const searchUrl = `https://shironet.mako.co.il/search?q=${encodeURIComponent(title)}&type=songs`

  console.log('Fetching:', searchUrl)
  console.log('User-Agent:', USER_AGENT)

  const response = await fetch(searchUrl, {
    headers: { 'User-Agent': USER_AGENT },
  })

  console.log('Status:', response.status)
  console.log('Headers:', Object.fromEntries(response.headers.entries()))

  const html = await response.text()
  console.log('HTML length:', html.length)

  if (html.length < 1000) {
    console.log('Full HTML:', html)
    return
  }

  // Try the regex from find-lyrics.ts
  const linkPattern = /href="(\/artist\?type=lyrics&lang=1&prfid=\d+&wrkid=\d+)"/g
  const matches: string[] = []
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(html)) !== null) {
    matches.push(match[1])
  }
  console.log(`\nFound ${matches.length} matches`)
  for (const m of matches.slice(0, 5)) {
    console.log('  ', m)
  }

  // Also check &amp; version
  const ampPattern = /href="(\/artist\?type=lyrics&amp;lang=1&amp;prfid=\d+&amp;wrkid=\d+)"/g
  const ampMatches: string[] = []
  while ((match = ampPattern.exec(html)) !== null) {
    ampMatches.push(match[1])
  }
  console.log(`\nFound ${ampMatches.length} &amp; matches`)
}

main().catch(console.error)
