/**
 * Achievement definitions for ChoirMind.
 *
 * Each achievement has a unique key, bilingual names, an emoji icon, and
 * descriptions in both Hebrew and English.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AchievementDefinition {
  /** Unique achievement key (matches UserAchievement.achievement in the DB). */
  key: AchievementKey;
  /** Hebrew display name. */
  hebrewName: string;
  /** English display name. */
  englishName: string;
  /** Emoji icon for the achievement. */
  icon: string;
  /** Bilingual description. */
  description: {
    he: string;
    en: string;
  };
}

export type AchievementKey =
  | 'first_practice'
  | 'first_week'
  | 'perfect_song'
  | 'chain_master'
  | 'duelist'
  | 'speed_demon'
  | 'streak_7'
  | 'streak_30'
  | 'songs_5'
  | 'songs_10';

// ---------------------------------------------------------------------------
// Achievement definitions
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS: Record<AchievementKey, AchievementDefinition> = {
  first_practice: {
    key: 'first_practice',
    hebrewName: 'צעד ראשון',
    englishName: 'First Steps',
    icon: '🎵',
    description: {
      he: 'השלמת את התרגול הראשון שלך',
      en: 'Completed your first practice session',
    },
  },

  first_week: {
    key: 'first_week',
    hebrewName: 'שבוע ראשון',
    englishName: 'First Week',
    icon: '📅',
    description: {
      he: 'תרגלת במשך שבוע שלם',
      en: 'Practiced for an entire week',
    },
  },

  perfect_song: {
    key: 'perfect_song',
    hebrewName: 'שיר מושלם',
    englishName: 'Perfect Song',
    icon: '⭐',
    description: {
      he: 'כל הקטעים של שיר הגיעו למצב "נעול"',
      en: 'All chunks of a song reached "locked in" status',
    },
  },

  chain_master: {
    key: 'chain_master',
    hebrewName: 'אלוף/ת השרשראות',
    englishName: 'Chain Master',
    icon: '🔗',
    description: {
      he: 'השלמת 10 קטעים ברצף ללא טעויות',
      en: 'Completed 10 chunks in a row without errors',
    },
  },

  duelist: {
    key: 'duelist',
    hebrewName: 'דואליסט/ית',
    englishName: 'Duelist',
    icon: '⚔️',
    description: {
      he: 'ניצחת בדו-קרב זיכרון ראשון',
      en: 'Won your first memory duel',
    },
  },

  speed_demon: {
    key: 'speed_demon',
    hebrewName: 'בזק',
    englishName: 'Speed Demon',
    icon: '⚡',
    description: {
      he: 'סיימת סיבוב מהירות תוך פחות מ-30 שניות',
      en: 'Completed a speed round in under 30 seconds',
    },
  },

  streak_7: {
    key: 'streak_7',
    hebrewName: 'רצף שבועי',
    englishName: 'Weekly Streak',
    icon: '🔥',
    description: {
      he: '7 ימים רצופים של תרגול',
      en: '7 consecutive days of practice',
    },
  },

  streak_30: {
    key: 'streak_30',
    hebrewName: 'רצף חודשי',
    englishName: 'Monthly Streak',
    icon: '🏆',
    description: {
      he: '30 ימים רצופים של תרגול',
      en: '30 consecutive days of practice',
    },
  },

  songs_5: {
    key: 'songs_5',
    hebrewName: 'חמישייה',
    englishName: 'High Five',
    icon: '🖐️',
    description: {
      he: 'למדת 5 שירים',
      en: 'Learned 5 songs',
    },
  },

  songs_10: {
    key: 'songs_10',
    hebrewName: 'עשירייה',
    englishName: 'Perfect Ten',
    icon: '🎯',
    description: {
      he: 'למדת 10 שירים',
      en: 'Learned 10 songs',
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get all achievement definitions as an array, useful for iteration.
 */
export function getAllAchievements(): AchievementDefinition[] {
  return Object.values(ACHIEVEMENTS);
}

/**
 * Look up a single achievement by its key. Returns undefined if not found.
 */
export function getAchievement(
  key: string,
): AchievementDefinition | undefined {
  return ACHIEVEMENTS[key as AchievementKey];
}

/**
 * Get the localised name for an achievement.
 */
export function getAchievementName(
  key: string,
  locale: 'he' | 'en' = 'he',
): string {
  const achievement = getAchievement(key);
  if (!achievement) return key;
  return locale === 'he' ? achievement.hebrewName : achievement.englishName;
}

/**
 * Get the localised description for an achievement.
 */
export function getAchievementDescription(
  key: string,
  locale: 'he' | 'en' = 'he',
): string {
  const achievement = getAchievement(key);
  if (!achievement) return '';
  return achievement.description[locale];
}
