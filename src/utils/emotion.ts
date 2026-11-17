import { AvatarEmotion } from '../types/tampi';

const ANGRY_PATTERNS = [
  /রাগ/i,
  /ফাজলামি/i,
  /বিরক্ত/i,
  /খবরদার/i,
  /চুপ কর/i,
  /একদম না/i,
  /বাদ দাও/i,
  /বুঝো না/i,
  /পাগল/i,
  /বকা/i,
  /\bfazlami\b/i,
  /\bbirokto\b/i,
  /\bkhabordar\b/i,
  /\brag\b/i,
  /\bstop scrolling\b/i,
  /\bseriously\b/i,
  /\bannoyed\b/i,
  /\bangry\b/i,
  /\bmad at you\b/i,
  /\bfocus now\b/i,
  /\bexcuse/i,
];

const SULKING_PATTERNS = [
  /থাক[,! ]*আর বলতে হবে না/i,
  /আর বলতে হবে না/i,
  /যাও তো/i,
  /কথা বল[বত]ে? হবে না/i,
  /কথা বলবো না/i,
  /অভিমান/i,
  /দাম নেই/i,
  /ভুলে গেছ/i,
  /মনে থাকে না/i,
  /দরকার নেই/i,
  /থাক তবে/i,
  /হুম[,! ]*বুঝেছি/i,
  /\bthak\b/i,
  /\bar bolte hobe na\b/i,
  /\bjao to\b/i,
  /\bkotha bolbo na\b/i,
  /\bkotha bolte hobe na\b/i,
  /\boviman\b/i,
  /\bbhule gech/i,
  /\bvule gech/i,
  /\bdam nei\b/i,
  /\bdorkar nei\b/i,
  /\bcare koro na\b/i,
  /\bfine then\b/i,
  /\bwhatever\b/i,
  /\bhmph\b/i,
  /\bforget it\b/i,
];

const SHY_PATTERNS = [
  /ধুর/i,
  /লজ্জা/i,
  /এসব.*ফালতু/i,
  /ফালতু কথা/i,
  /কী বল[ছো]/i,
  /ইশ/i,
  /চুপ করো তো/i,
  /পাগল নাকি/i,
  /\bdhur\b/i,
  /\blojja\b/i,
  /\bfaltu kotha\b/i,
  /\bki bolch/i,
  /\bki bolo\b/i,
  /\bish\b/i,
  /\bblush\b/i,
  /\bstop teasing\b/i,
  /\bsilly\b/i,
  /\bpagli\b/i,
  /\btumi na\b/i,
];

const HAPPY_PATTERNS = [
  /বাহ/i,
  /দারুণ/i,
  /সাবাস/i,
  /শাবাশ/i,
  /খুশি/i,
  /ভালো করেছ/i,
  /মজা/i,
  /সুন্দর/i,
  /হাহা/i,
  /হিহি/i,
  /\bbah\b/i,
  /\bdarun\b/i,
  /\bsabas\b/i,
  /\bshabash\b/i,
  /\bkhushi\b/i,
  /\bawesome\b/i,
  /\bproud of you\b/i,
  /\bwell done\b/i,
  /\bgreat job\b/i,
  /\bhaha\b/i,
  /\bhehe\b/i,
  /\byay\b/i,
  /\bcongrats\b/i,
];

export function detectEmotionFromTranscript(
  text: string,
  audioAmplitude = 0,
): AvatarEmotion {
  const clean = text.trim();
  if (!clean) return 'neutral';

  if (SULKING_PATTERNS.some((re) => re.test(clean))) {
    return 'sulking';
  }
  if (SHY_PATTERNS.some((re) => re.test(clean))) {
    return 'shy';
  }
  if (ANGRY_PATTERNS.some((re) => re.test(clean))) {
    return 'angry';
  }
  if (HAPPY_PATTERNS.some((re) => re.test(clean))) {
    return 'happy';
  }

  // Fallback vocal tone heuristics from punctuation/energy
  if (clean.includes('!') && audioAmplitude > 0.42) {
    return 'happy';
  }

  return 'neutral';
}
