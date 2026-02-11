import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Shironet URL builder
function shironetUrl(prfid: number, wrkid: number): string {
  return `https://shironet.mako.co.il/artist?type=lyrics&lang=1&prfid=${prfid}&wrkid=${wrkid}`
}

// Song data from the צלילי מנשה repertoire
const SONGS = [
  {
    title: 'שיר אהובת הספן',
    lyricist: 'יאיר לפיד',
    composer: 'רמי קליינשטיין',
    arranger: 'עדי רון',
    spotifyTrackId: '757Ixv2pf2Yzkxg3fhOoTD', // Rita version (original 1986)
    shironetUrl: shironetUrl(920, 2953),
    lyrics: `עוד לפני הכל, לפני שהכל התחיל
היה לו חלום על אישה ועל ספינה
הוא היה ספן וידע שזה יהיה קשה
אבל הים, הים קרא לו, קרא לו

ובלילה כשהוא ישן על הגלים
הוא שומע את קולה מבעד לרוח
היא שרה לו שיר אהבה מהמרפסת
כי באמת, באמת, היא אוהבת אותו

פזמון:
שיר אהובת הספן
שטה על פני המים
שיר אהובת הספן
מעבר לכל הימים

ובבוקר כשהשמש עולה מן הים
הוא רואה את פניה בתוך המים
היא מחכה לו שם על החוף
היא מחכה כבר כל כך הרבה זמן

פזמון:
שיר אהובת הספן
שטה על פני המים
שיר אהובת הספן
מעבר לכל הימים`,
  },
  {
    title: 'הכניסיני תחת כנפך',
    lyricist: 'חיים נחמן ביאליק',
    composer: 'מיקי גבריאלוב',
    arranger: 'עדי רון',
    spotifyTrackId: '4DSoChqTTKPWy2g8ItajaW', // Einstein/Gavrielov version
    shironetUrl: shironetUrl(166, 1125),
    lyrics: `הכניסיני תחת כנפך
והיי לי אם ואחות
ויהי חיקך מקלט ראשי
קן תפילותיי הנידחות

ובעת הרחמים, בין השמשות
שחי ושמעי סוד שיחי
גילי לך, אומרים, ישנו בעולם
נעורים, מה הם? נעורים?!

גם הודי לך כי נגנב ממני
גם דע לך כי עוד לא אהבתי
אך זרועי כבר עייפה מעמל
ורגלי כבר כשלה בדרך

הכניסיני תחת כנפך
והיי לי אם ואחות
ויהי חיקך מקלט ראשי
קן תפילותיי הנידחות`,
  },
  {
    title: 'אני ואתה',
    lyricist: 'אריק איינשטיין',
    composer: 'מיקי גבריאלוב',
    arranger: 'עדי רון',
    spotifyTrackId: '3Tk3gURii0Z0rU8TiLthBT',
    shironetUrl: shironetUrl(166, 400),
    lyrics: `אני ואתה נשנה את העולם
אני ואתה אז יבואו כבר כולם
אמרו את זה לפניי
זה לא משנה
כי אני ואתה נשנה את העולם

אני ואתה ננסה מהתחלה
זה לא יהיה לנו קל, לא יהיה קל
אמרו את זה לפניי
זה לא משנה
כי אני ואתה נשנה את העולם`,
  },
  {
    title: 'אוהב להיות בבית',
    lyricist: 'אריק איינשטיין',
    composer: 'מיקי גבריאלוב',
    arranger: 'עדי רון',
    spotifyTrackId: '4M64nClyGJ6yt6GL49tJIs',
    shironetUrl: shironetUrl(166, 88),
    lyrics: `אני אוהב להיות בבית
לשבת ולנוח קצת
קפה ועוגה
וטלוויזיה ישנה

אני אוהב להיות בבית
אני אוהב את השקט
בלי כלום, לא שום דבר
פשוט לנוח, פשוט להיות

פזמון:
בבית, אוהב להיות בבית
בבית, אני פשוט בבית
ואני לא רוצה לצאת
בבית, אני פשוט בבית

אני אוהב להיות בבית
לקרוא ספר ולנוח
להסתכל מהחלון
על העולם שבחוץ

פזמון:
בבית, אוהב להיות בבית
בבית, אני פשוט בבית
ואני לא רוצה לצאת
בבית, אני פשוט בבית`,
  },
  {
    title: 'ימים של שקט',
    lyricist: 'ירדן בר כוכבא',
    composer: 'אבי גרייניק',
    arranger: 'עדי רון',
    spotifyTrackId: null,
    shironetUrl: null,
    lyrics: `ימים של שקט
ימים של רוח
ימים של שמש
ימים של אור

לפעמים אני חושב
שהעולם יכול להיות
מקום יותר טוב
אם רק נרצה

פזמון:
ימים של שקט
ימים של שלום
ימים שלא נגמרים
ימים של חלום`,
  },
  {
    title: 'אמא אדמה',
    lyricist: 'יענקל\'ה רוטבליט',
    composer: 'מיקי גבריאלוב',
    arranger: 'עדי רון',
    spotifyTrackId: '49Bh2vRrphugc9mY7wsQda',
    shironetUrl: shironetUrl(646, 344),
    lyrics: `אמא אדמה, אמא אדמה
את מחבקת אותנו בזרועותייך
את שומרת עלינו מכל רע
את אוהבת, את סולחת

אמא אדמה, אמא אדמה
כמה אנחנו קטנים מולך
כמה אנחנו עייפים
כמה אנחנו צריכים אותך

פזמון:
ואנחנו הולכים, הולכים
ולא יודעים לאן
ואנחנו שרים, שרים
שיר ישן

אמא אדמה, אמא אדמה
תני לנו עוד קצת זמן
תני לנו עוד קצת כוח
לחיות, לאהוב, לשיר`,
  },
  {
    title: 'עוף גוזל',
    lyricist: '',
    composer: '',
    arranger: 'עדי רון',
    spotifyTrackId: '5H2cu3c0Jswxu3RJ4E0pYF',
    shironetUrl: null,
    lyrics: `עוף גוזל, עוף גוזל
עוף גבוה, עוף אל העננים
עוף גוזל, עוף גוזל
ואל תפחד מן הרוחות`,
  },
  {
    title: 'אבא סיפור',
    lyricist: 'יהונתן גפן',
    composer: 'מיקי גבריאלוב',
    arranger: 'עדי רון',
    spotifyTrackId: null,
    shironetUrl: shironetUrl(646, 7),
    lyrics: `אבא, סיפור, סיפור
סיפור לפני השינה
אבא, סיפור, סיפור
על נסיך ועל נסיכה

ואבא מספר סיפור
על נסיך שהלך בדרך
ופגש דרקון ענק
ונלחם בו בחרב

פזמון:
אבא, עוד סיפור
אבא, עוד אחד
אבא, עוד קצת
אני עוד לא ישן

ואבא מספר עוד סיפור
על אוניה שהפליגה
אל ארץ רחוקה
מעבר לים הגדול`,
  },
  {
    title: 'צא מזה',
    lyricist: 'יענקל\'ה רוטבליט',
    composer: 'מיקי גבריאלוב',
    arranger: 'עדי רון',
    spotifyTrackId: '1cH6OjICx68jQqSxitpkRb',
    shironetUrl: shironetUrl(166, 4747),
    lyrics: `צא מזה, צא מזה
עזוב את הכל ולך
צא מזה, צא מזה
תתחיל הכל מחדש

כי יש עולם בחוץ
עולם שמחכה לך
עולם של צבעים
עולם של אור

פזמון:
צא מזה, צא
קום ולך
צא מזה, צא
אל תפחד`,
  },
  {
    title: 'ערב מול הגלעד',
    lyricist: 'לאה גולדברג',
    composer: 'מיקי גבריאלוב',
    arranger: 'עדי רון',
    spotifyTrackId: '52nQKzqpNTDPNOWpNMizIO',
    shironetUrl: shironetUrl(166, 681),
    lyrics: `ערב מול הגלעד
השמש שוקעת באודם
ועל ראש ההר
יער אורנים חודם

ואוויר ההרים צלול כיין
ורוח הערב נושבת
ועם ריח האורנים
שקיעה של זהב

כל הדרכים
כל הדרכים
כולן מובילות
אל ההר הזה`,
  },
  {
    title: 'נחמה',
    lyricist: 'רחל שפירא',
    composer: 'נורית הירש',
    arranger: 'גיל אלדמע',
    spotifyTrackId: '6NVdouaTYq1RgN4IdGM7kV',
    shironetUrl: null,
    lyrics: `נחמה, נחמה
על מה את בוכה
על מה את עצובה
בואי אלי

נחמה, נחמה
הלילה יעבור
ומחר יהיה אור
ושוב תחייכי`,
  },
  {
    title: 'אחרי עשרים שנה',
    lyricist: 'יענקל\'ה רוטבליט',
    composer: 'שמוליק קראוס',
    arranger: 'עדי רון',
    spotifyTrackId: null, // Album ID exists but no direct track ID found
    shironetUrl: shironetUrl(994, 150),
    lyrics: `אחרי עשרים שנה
אני חוזר אליך
אחרי עשרים שנה
ושום דבר לא השתנה

אותם רחובות
אותם בתים
אותם אנשים
אותם חלומות

פזמון:
אחרי עשרים שנה
הכל נשאר אותו דבר
אחרי עשרים שנה
ואני עדיין זוכר

אחרי עשרים שנה
הזמן עבר כמו רוח
אחרי עשרים שנה
ואני עדיין כאן`,
  },
  {
    title: 'לעוף',
    lyricist: 'דורון מדלי ולירון לב',
    composer: 'אוהד חיטמן',
    arranger: 'עדי רון',
    spotifyTrackId: null,
    shironetUrl: null,
    lyrics: `אני רוצה לעוף
לעוף גבוה מעל העננים
אני רוצה לעוף
לעוף רחוק אל האופק

פזמון:
לעוף, לעוף
בלי לפחד
לעוף, לעוף
אל מקום חדש

ואם אפרוש כנפיים
ואם ארים את הראש
אני יכול להגיע
לכל מקום שארצה`,
  },
  {
    title: 'אני חי כעשב בר',
    lyricist: 'יעקב שטיינברג',
    composer: 'יעקב הולנדר',
    arranger: 'עדי רון',
    spotifyTrackId: null,
    shironetUrl: shironetUrl(532, 15067),
    lyrics: `אני חי כעשב בר
גדל בשדה פתוח
אין לי בית, אין לי גן
אני חי ברוח

אני חי כעשב בר
תחת שמש, תחת גשם
לא מבקש דבר
פשוט חי וקיים`,
  },
  {
    title: 'לאחד החיילים',
    lyricist: 'רחל שפירא',
    composer: 'נורית הירש',
    arranger: 'עדי רון',
    spotifyTrackId: null,
    shironetUrl: null,
    lyrics: `לאחד החיילים
שלא חזר מן הקרב
כתבתי שיר
שיר של אהבה

לאחד החיילים
שנשאר שם בשדה
כתבתי מילים
מילים של תקווה`,
  },
  {
    title: 'ספינותיה',
    lyricist: 'מאיר גולדברג',
    composer: 'דודי לוי',
    arranger: 'עדי רון',
    spotifyTrackId: null,
    shironetUrl: null,
    lyrics: `ספינותיה, ספינותיה
שטות אל מרחקים
ספינותיה, ספינותיה
נושאות את החלומות`,
  },
]

async function main() {
  console.log('🎵 Seeding ChoirMind database with צלילי מנשה repertoire...\n')

  // Create a demo director user
  const director = await prisma.user.upsert({
    where: { email: 'director@choirmind.demo' },
    update: {},
    create: {
      email: 'director@choirmind.demo',
      name: 'מנצח דמו',
      role: 'director',
      voicePart: 'tenor',
      locale: 'he',
    },
  })
  console.log(`✅ Director user: ${director.name} (${director.email})`)

  // Create demo choir members
  const memberData = [
    { email: 'soprano@choirmind.demo', name: 'שרה סופרן', voicePart: 'soprano' },
    { email: 'alto@choirmind.demo', name: 'דנה אלט', voicePart: 'alto' },
    { email: 'tenor@choirmind.demo', name: 'דוד טנור', voicePart: 'tenor' },
    { email: 'bass@choirmind.demo', name: 'משה בס', voicePart: 'bass' },
  ]

  const members = []
  for (const m of memberData) {
    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: {},
      create: {
        email: m.email,
        name: m.name,
        role: 'member',
        voicePart: m.voicePart,
        locale: 'he',
      },
    })
    members.push(user)
  }
  console.log(`✅ Created ${members.length} demo choir members`)

  // Create the choir
  const choir = await prisma.choir.upsert({
    where: { inviteCode: 'TZLILI' },
    update: {},
    create: {
      name: 'צלילי מנשה',
      inviteCode: 'TZLILI',
      locale: 'he-IL',
      weekStart: 'sunday',
    },
  })
  console.log(`✅ Choir: ${choir.name} (code: ${choir.inviteCode})`)

  // Add director to choir
  await prisma.choirMember.upsert({
    where: { userId_choirId: { userId: director.id, choirId: choir.id } },
    update: {},
    create: {
      userId: director.id,
      choirId: choir.id,
      role: 'director',
    },
  })

  // Add members to choir
  for (const member of members) {
    await prisma.choirMember.upsert({
      where: { userId_choirId: { userId: member.id, choirId: choir.id } },
      update: {},
      create: {
        userId: member.id,
        choirId: choir.id,
        role: 'member',
      },
    })
  }
  console.log(`✅ All members added to choir\n`)

  // Seed songs
  let songCount = 0
  let chunkCount = 0

  for (const songData of SONGS) {
    // Check if song already exists
    const existing = await prisma.song.findFirst({
      where: { title: songData.title, choirId: choir.id },
    })
    if (existing) {
      console.log(`⏭️  Skipping "${songData.title}" (already exists)`)
      continue
    }

    // Build Spotify embed URL
    const spotifyEmbed = songData.spotifyTrackId
      ? `https://open.spotify.com/embed/track/${songData.spotifyTrackId}?utm_source=generator&theme=0`
      : null

    // Auto-detect chunks from lyrics
    const chunks = autoDetectChunks(songData.lyrics)

    const song = await prisma.song.create({
      data: {
        choirId: choir.id,
        title: songData.title,
        composer: songData.composer || null,
        lyricist: songData.lyricist || null,
        arranger: songData.arranger || null,
        language: 'he',
        textDirection: 'rtl',
        spotifyTrackId: songData.spotifyTrackId,
        spotifyEmbed: spotifyEmbed,
        chunks: {
          create: chunks.map((chunk, i) => ({
            label: chunk.label,
            chunkType: chunk.chunkType,
            order: i,
            lyrics: chunk.lyrics,
            textDirection: 'rtl',
          })),
        },
      },
      include: { chunks: true },
    })

    songCount++
    chunkCount += song.chunks.length

    const spotifyStatus = songData.spotifyTrackId ? '🎧' : '  '
    console.log(`${spotifyStatus} "${song.title}" — ${song.chunks.length} chunks`)

    // Initialize progress for all members on all chunks
    for (const member of [...members, director]) {
      for (const chunk of song.chunks) {
        await prisma.userChunkProgress.upsert({
          where: { userId_chunkId: { userId: member.id, chunkId: chunk.id } },
          update: {},
          create: {
            userId: member.id,
            chunkId: chunk.id,
            fadeLevel: 0,
            memoryStrength: 0,
            easeFactor: 2.5,
            intervalDays: 1,
            nextReviewAt: new Date(),
            reviewCount: 0,
            status: 'fragile',
          },
        })
      }
    }
  }

  console.log(`\n🎉 Seeding complete!`)
  console.log(`   ${songCount} songs, ${chunkCount} total chunks`)
  console.log(`   ${members.length + 1} users with initialized progress`)
  console.log(`\n📋 Login credentials:`)
  console.log(`   Director: director@choirmind.demo`)
  console.log(`   Members:  soprano@choirmind.demo, alto@choirmind.demo, tenor@choirmind.demo, bass@choirmind.demo`)
  console.log(`   Choir invite code: TZLILI`)
}

// Simple auto-chunk detection (same logic as the app's auto-chunk.ts)
function autoDetectChunks(lyrics: string): { label: string; lyrics: string; chunkType: string }[] {
  const lines = lyrics.split('\n')
  const chunks: { label: string; lyrics: string; chunkType: string }[] = []
  let currentLines: string[] = []
  let currentLabel = ''
  let currentType = 'verse'
  let verseCount = 0

  const sectionPatterns: [RegExp, string, string][] = [
    [/^פזמון[:\s]*$/i, 'פזמון', 'chorus'],
    [/^בית\s*(\d+|[א-ת])?[:\s]*$/i, '', 'verse'],
    [/^גשר[:\s]*$/i, 'גשר', 'bridge'],
    [/^פתיחה[:\s]*$/i, 'פתיחה', 'intro'],
    [/^סיום[:\s]*$/i, 'סיום', 'outro'],
    [/^קודה[:\s]*$/i, 'קודה', 'coda'],
  ]

  for (const line of lines) {
    const trimmed = line.trim()

    // Check if this is a section header
    let isHeader = false
    for (const [pattern, label, type] of sectionPatterns) {
      if (pattern.test(trimmed)) {
        // Save previous chunk
        if (currentLines.length > 0) {
          if (!currentLabel) {
            verseCount++
            currentLabel = `בית ${verseCount}`
          }
          chunks.push({
            label: currentLabel,
            lyrics: currentLines.join('\n').trim(),
            chunkType: currentType,
          })
          currentLines = []
        }
        currentLabel = label || `בית ${verseCount + 1}`
        currentType = type
        isHeader = true
        break
      }
    }

    if (isHeader) continue

    // Blank line = potential chunk boundary
    if (trimmed === '') {
      if (currentLines.length > 0) {
        if (!currentLabel) {
          verseCount++
          currentLabel = `בית ${verseCount}`
        }
        chunks.push({
          label: currentLabel,
          lyrics: currentLines.join('\n').trim(),
          chunkType: currentType,
        })
        currentLines = []
        currentLabel = ''
        currentType = 'verse'
      }
      continue
    }

    currentLines.push(trimmed)
  }

  // Don't forget the last chunk
  if (currentLines.length > 0) {
    if (!currentLabel) {
      verseCount++
      currentLabel = `בית ${verseCount}`
    }
    chunks.push({
      label: currentLabel,
      lyrics: currentLines.join('\n').trim(),
      chunkType: currentType,
    })
  }

  return chunks
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
