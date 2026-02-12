const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function main() {
  // Fetch the ירושלים של זהב page on tab4u
  const url = 'https://www.tab4u.com/tabs/songs/4263_%D7%A0%D7%A2%D7%9E%D7%99_%D7%A9%D7%9E%D7%A8_-_%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D_%D7%A9%D7%9C_%D7%96%D7%94%D7%91.html'
  console.log('Fetching:', url)

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en-US;q=0.9',
    },
  })

  console.log('Status:', res.status)
  const html = await res.text()
  console.log('HTML length:', html.length)

  if (html.length < 1000) {
    console.log('Full HTML:', html)
    return
  }

  // Check if blocked
  if (html.includes('captcha') || html.includes('CAPTCHA')) {
    console.log('⚠ CAPTCHA detected')
  }

  // Look for lyrics content - try different patterns
  // tab4u often has lyrics in a specific div
  const patterns = [
    /class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div/gi,
    /class="[^"]*song[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/div/gi,
    /id="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div/gi,
    /class="ruTag"[^>]*>([\s\S]*?)<\/div/gi,
  ]

  for (let i = 0; i < patterns.length; i++) {
    const matches = html.match(patterns[i])
    console.log(`\nPattern ${i}: ${matches?.length ?? 0} matches`)
    if (matches && matches.length > 0) {
      // Show first match cleaned
      const first = matches[0]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim()
      console.log('First match (200 chars):', first.substring(0, 200))
    }
  }

  // Look for the lyrics container by searching for known lyrics words
  const lyricsIdx = html.indexOf('אוויר הרים')
  if (lyricsIdx >= 0) {
    console.log('\n\nFound "אוויר הרים" at index:', lyricsIdx)
    // Show surrounding HTML
    const start = Math.max(0, lyricsIdx - 200)
    const end = Math.min(html.length, lyricsIdx + 200)
    const context = html.substring(start, end)
    console.log('Context:', context)
  }

  // Try to find the lyrics using a broader search
  const songContent = html.match(/<div[^>]*class="[^"]*ruTag[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)
  if (songContent) {
    console.log('\n\nruTag divs found:', songContent.length)
    const allText = songContent.map(s =>
      s.replace(/<br\s*\/?>/gi, '\n')
       .replace(/<[^>]+>/g, '')
       .trim()
    ).join('\n\n')
    console.log('Combined text (500 chars):', allText.substring(0, 500))
  }

  // Search for any div with substantial Hebrew text
  const hebrewDivs = html.match(/<div[^>]*>([^<]*[\u0590-\u05FF]{20,}[^<]*)<\/div>/g)
  console.log('\n\nHebrew-heavy divs:', hebrewDivs?.length ?? 0)
  if (hebrewDivs) {
    for (const div of hebrewDivs.slice(0, 3)) {
      const text = div.replace(/<[^>]+>/g, '').trim()
      console.log('  -', text.substring(0, 100))
    }
  }
}

main().catch(console.error)
