async function main() {
  const url = 'https://shironet.mako.co.il/search?q=%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D%20%D7%A9%D7%9C%20%D7%96%D7%94%D7%91&type=songs'
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const html = await res.text()

  // Find first occurrence
  const idx = html.indexOf('artist?type=lyrics')
  if (idx >= 0) {
    console.log('Context around first match:')
    console.log(JSON.stringify(html.substring(idx - 10, idx + 80)))
  } else {
    console.log('NOT FOUND in HTML!')
    console.log('HTML length:', html.length)
    console.log('First 300 chars:', html.substring(0, 300))
  }

  // Check specific encodings
  console.log('\nHas "artist?type=lyrics&amp;":', html.includes('artist?type=lyrics&amp;'))
  console.log('Has "artist?type=lyrics&lang":', html.includes('artist?type=lyrics&lang'))
  console.log('Has "artist?type=lyrics":', html.includes('artist?type=lyrics'))
}

main().catch(console.error)
