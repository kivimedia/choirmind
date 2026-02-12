const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function testSite(name: string, url: string) {
  console.log(`\n--- Testing ${name} ---`)
  console.log(`URL: ${url}`)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he,en-US;q=0.9',
      },
    })
    console.log(`Status: ${res.status}`)
    const html = await res.text()
    console.log(`HTML length: ${html.length}`)
    if (html.includes('captcha') || html.includes('CAPTCHA') || html.includes('bot')) {
      console.log('⚠ Possible CAPTCHA/bot detection')
    }
    if (html.length > 1000) {
      console.log('✓ Got substantial content')
      // Check for lyrics content
      const hasLyrics = html.includes('ירושלים') || html.includes('אוויר')
      console.log(`Has Hebrew lyrics content: ${hasLyrics}`)
    }
  } catch (err) {
    console.log(`Error: ${err}`)
  }
}

async function main() {
  // Test various Israeli lyrics sites
  await testSite('lyrics.co.il', 'https://lyrics.co.il/?s=ירושלים+של+זהב')
  await testSite('tab4u search', 'https://www.tab4u.com/resultsSimple?tab=songs&q=ירושלים+של+זהב')
  await testSite('shiron.net', 'https://shiron.net/search?q=ירושלים+של+זהב')
}

main().catch(console.error)
