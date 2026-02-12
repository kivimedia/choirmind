const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function main() {
  const title = 'ירושלים של זהב'
  const searchUrl = `https://shironet.mako.co.il/search?q=${encodeURIComponent(title)}&type=songs`

  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
    },
  })

  const html = await response.text()
  console.log('HTML length:', html.length)

  // Show the portion that should have search results
  const bodyIdx = html.indexOf('<body')
  if (bodyIdx >= 0) {
    console.log('\nBody starts at:', bodyIdx)
    // Show body content (trim scripts)
    const body = html.substring(bodyIdx, bodyIdx + 5000)
    console.log(body)
  }

  // Check if it has a redirect or JS-rendered content
  if (html.includes('window.location') || html.includes('document.location')) {
    console.log('\n!!! Contains JS redirect !!!')
    const redirectMatch = html.match(/(window|document)\.location[^;]+;/g)
    if (redirectMatch) {
      console.log('Redirects:', redirectMatch)
    }
  }

  // Check for any links at all
  const allLinks = html.match(/href="[^"]+"/g)
  console.log('\nTotal href attributes:', allLinks?.length ?? 0)
  if (allLinks) {
    console.log('Sample links:', allLinks.slice(0, 10))
  }
}

main().catch(console.error)
