const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'he,en-US;q=0.9',
    },
  })
  return res.text()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
}

async function testTab4u() {
  console.log('\n=== Testing tab4u.com ===\n')

  // Step 1: Search
  const searchUrl = 'https://www.tab4u.com/resultsSimple?tab=songs&q=' + encodeURIComponent('ירושלים של זהב')
  const searchHtml = await fetchHtml(searchUrl)

  // Find song links (tab4u links look like: /tabs/songs/12345)
  const songLinks = searchHtml.match(/href="(\/tabs\/songs\/\d+[^"]*)"/g)
  console.log(`Found ${songLinks?.length ?? 0} song links`)
  if (songLinks) {
    console.log('First 3:', songLinks.slice(0, 3))
  }

  // Try another pattern
  const songLinks2 = searchHtml.match(/href="([^"]*songs[^"]*)"/g)
  console.log(`Broad song links: ${songLinks2?.length ?? 0}`)
  if (songLinks2) {
    console.log('First 5:', songLinks2.slice(0, 5))
  }

  // Check for result items
  const resultItems = searchHtml.match(/class="[^"]*result[^"]*"/g)
  console.log(`Result classes: ${resultItems?.length ?? 0}`)
  if (resultItems) {
    console.log('First 3:', resultItems.slice(0, 3))
  }

  // Look for any href with the song title in Hebrew
  const allLinks = searchHtml.match(/href="[^"]+"/g) ?? []
  console.log(`\nTotal links: ${allLinks.length}`)
  // Filter for potential song links
  const interesting = allLinks.filter(l =>
    l.includes('tab') || l.includes('song') || l.includes('lyric') || l.includes('wrkid')
  )
  console.log('Interesting links:', interesting.slice(0, 10))
}

async function testLyricsCo() {
  console.log('\n=== Testing lyrics.co.il ===\n')

  // Step 1: Search
  const searchUrl = 'https://lyrics.co.il/?s=' + encodeURIComponent('ירושלים של זהב')
  const searchHtml = await fetchHtml(searchUrl)

  // Find post links (WordPress-style site)
  const postLinks = searchHtml.match(/href="(https:\/\/lyrics\.co\.il\/[^"]+)"/g)
  console.log(`Found ${postLinks?.length ?? 0} lyrics.co.il links`)
  if (postLinks) {
    // Filter out common pages
    const songPages = postLinks.filter(l =>
      !l.includes('/category/') && !l.includes('/?s=') && !l.includes('/page/')
    )
    console.log('Song pages:', songPages.slice(0, 10))
  }
}

async function main() {
  await testTab4u()
  await testLyricsCo()
}

main().catch(console.error)
