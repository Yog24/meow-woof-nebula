import { LANDMARKS } from '../constants';
import { Landmark, Story } from '../types';

export const SPEAKING_STYLE_TONES: Record<string, string> = {
  'ta是主子': '高傲、霸道、毒舌，但底色是亲密和爱',
  'ta是小暖男': '温暖、贴心，会照顾主人的情绪',
  'ta是粘人小宝宝': '撒娇、黏人、萌一点，直接表达想念',
};

export const PERSONALITY_SPEED: Record<string, number> = {
  活泼: 1.55,
  安静: 0.72,
  懒: 0.58,
  爱干净: 0.95,
  贪吃: 1,
  胆小: 0.62,
};

const UNIVERSE_LOCATION_WEIGHTS: Record<string, Array<[string, number]>> = {
  活泼: [['2', 4], ['1', 3], ['5', 2], ['6', 2]],
  安静: [['4', 4], ['7', 3], ['1', 2]],
  懒: [['4', 6], ['6', 2], ['5', 0.45]],
  爱干净: [['3', 5], ['7', 2]],
  贪吃: [['5', 6], ['4', 1]],
  胆小: [['4', 5], ['7', 3], ['5', 0.3]],
};

export function getSpeakingTone(speakingStyle?: string) {
  const style = speakingStyle || '';
  const matched = Object.entries(SPEAKING_STYLE_TONES).find(([key]) => style.includes(key));
  return matched?.[1] || '自然、亲近、像熟悉的宠物在说话';
}

export function getPersonalitySpeed(personality?: string) {
  const tags = splitPersonality(personality);
  if (tags.length === 0) return 1;
  const speed = tags.reduce((sum, tag) => sum + (PERSONALITY_SPEED[tag] || 1), 0) / tags.length;
  return Math.max(0.5, Math.min(1.7, speed));
}

export function chooseLandmarkForPersonality(personality?: string): Landmark {
  const weights = new Map<string, number>();
  for (const tag of splitPersonality(personality)) {
    for (const [landmarkId, weight] of UNIVERSE_LOCATION_WEIGHTS[tag] || []) {
      weights.set(landmarkId, (weights.get(landmarkId) || 0) + weight);
    }
  }
  if (weights.size === 0) {
    weights.set('1', 2);
    weights.set('4', 2);
    weights.set('7', 1);
  }

  const entries = [...weights.entries()];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.random() * total;
  for (const [landmarkId, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) {
      return LANDMARKS.find((landmark) => landmark.id === landmarkId) || LANDMARKS[0];
    }
  }
  return LANDMARKS[0];
}

export function shouldPromptForShyHungryPet(personality?: string) {
  const tags = splitPersonality(personality);
  if (!tags.includes('懒') && !tags.includes('胆小')) return false;
  return Math.random() < 0.55;
}

export function buildMemorySnippets(stories?: Story[]) {
  return (stories || [])
    .filter((story) => story.title.trim() || story.content.trim())
    .slice(0, 6)
    .map((story) => `${story.title}: ${story.content}`.slice(0, 120));
}

function splitPersonality(personality?: string) {
  return (personality || '')
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
