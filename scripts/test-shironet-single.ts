async function main() {
  // Direct lyrics page (not search)
  const url = 'https://shironet.mako.co.il/artist?type=lyrics&lang=1&prfid=738&wrkid=1619'
  console.log('Fetching:', url)

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
      'Referer': 'https://www.google.com/',
    },
  })

  console.log('Status:', res.status)
  const html = await res.text()
  console.log('Length:', html.length)
  console.log('Has captcha:', html.includes('captcha'))
  console.log('Has artist_lyrics_text:', html.includes('artist_lyrics_text'))

  if (html.includes('artist_lyrics_text')) {
    const pattern = /class="[^"]*artist_lyrics_text[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p|td)/gi
    let match
    while ((match = pattern.exec(html)) !== null) {
      const text = match[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim()
      console.log('\nLyrics block:', text.substring(0, 300))
    }
  } else if (html.length < 2000) {
    console.log('Full response:', html)
  } else {
    console.log('First 500:', html.substring(0, 500))
  }
}

main().catch(console.error)
