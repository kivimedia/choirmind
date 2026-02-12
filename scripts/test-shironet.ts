async function main() {
  const query = 'ירושלים של זהב'
  const url = `https://shironet.mako.co.il/search?q=${encodeURIComponent(query)}&type=songs`
  console.log('Fetching:', url)

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  console.log('Status:', res.status)
  const html = await res.text()
  console.log('HTML length:', html.length)

  // Search for lyrics links with various patterns
  const patterns = [
    /href="(\/artist\?type=lyrics&lang=1&prfid=\d+&wrkid=\d+)"/gi,
    /href='(\/artist\?type=lyrics[^']+)'/gi,
    /artist\?type=lyrics[^"'<>\s]*/gi,
    /wrkid=\d+/gi,
  ]

  for (let i = 0; i < patterns.length; i++) {
    const matches = html.match(patterns[i])
    console.log(`Pattern ${i}: ${matches?.length ?? 0} matches`)
    if (matches && matches.length > 0) {
      console.log('  First 3:', matches.slice(0, 3))
    }
  }

  // Show first 1000 chars
  console.log('\n--- First 1000 chars ---')
  console.log(html.substring(0, 1000))

  // Check if blocked
  if (html.includes('captcha') || html.includes('CAPTCHA') || html.includes('blocked')) {
    console.log('\n!!! POSSIBLE BLOCK/CAPTCHA !!!')
  }
}

main().catch(console.error)
