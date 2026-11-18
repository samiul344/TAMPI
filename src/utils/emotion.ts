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

const SAD_PATTERNS = [
  /মন খারাপ/i,
  /ভালো লাগছে না/i,
  /ভাল লাগছে না/i,
  /মন ভালো নেই/i,
  /কষ্ট/i,
  /একা/i,
  /কান্না/i,
  /হতাশ/i,
  /ক্লান্ত/i,
  /দুঃখ/i,
  /ব্যথা/i,
  /খারাপ লাগছে/i,
  /\bmon kharap\b/i,
  /\bvalo lagche na\b/i,
  /\bbhalo lagche na\b/i,
  /\bkosto\b/i,
  /\beka lagche\b/i,
  /\bsad\b/i,
  /\bupset\b/i,
  /\bdepressed\b/i,
  /\blonely\b/i,
  /\bhurt\b/i,
  /\bdown today\b/i,
  /\bfeeling down\b/i,
  /\bexhausted\b/i,
  /\bheartbroken\b/i,
  /\bsorry to hear\b/i,
  /\bmon kharap koro na\b/i,
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
  if (SAD_PATTERNS.some((re) => re.test(clean))) {
    return 'sad';
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

export function detectUserMoodFromTranscript(
  text: string,
  audioAmplitude = 0,
): AvatarEmotion {
  const clean = text.trim();
  if (!clean) return 'neutral';

  if (SAD_PATTERNS.some((re) => re.test(clean))) {
    return 'sad';
  }
  if (SULKING_PATTERNS.some((re) => re.test(clean))) {
    return 'sulking';
  }
  if (ANGRY_PATTERNS.some((re) => re.test(clean))) {
    return 'angry';
  }
  if (HAPPY_PATTERNS.some((re) => re.test(clean))) {
    return 'happy';
  }
  if (clean.includes('!') || audioAmplitude > 0.55) {
    return 'happy';
  }

  return 'neutral';
}
