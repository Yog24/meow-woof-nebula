import { CreateWhisperInput } from "./socialRepository";

type LandmarkRule = {
  id: string;
  name: string;
  activityType: string;
  activityText: string;
};

const LANDMARKS: Record<string, LandmarkRule> = {
  runway: {
    id: "runway",
    name: "彗尾跑道",
    activityType: "run",
    activityText: "沿着彗尾跑道跑了一小段，脚边拖出一点点发光的星尘",
  },
  park: {
    id: "park",
    name: "玫瑰星云公园",
    activityType: "park",
    activityText: "在玫瑰星云公园闻了很久会发光的花",
  },
  canteen: {
    id: "canteen",
    name: "双星食堂",
    activityType: "eat",
    activityText: "路过双星食堂，认真研究了一下今天的小零食",
  },
  nest: {
    id: "nest",
    name: "重力窝",
    activityType: "rest",
    activityText: "在重力窝里缩成一团，像被轻轻抱住一样",
  },
  theater: {
    id: "theater",
    name: "星屑剧场",
    activityType: "watch",
    activityText: "在星屑剧场看其他小伙伴追着星环打滚",
  },
  bath: {
    id: "bath",
    name: "星尘澡堂",
    activityType: "groom",
    activityText: "去星尘澡堂抖了抖毛，身上亮晶晶的",
  },
  lookout: {
    id: "lookout",
    name: "极光眺望台",
    activityType: "miss",
    activityText: "在极光眺望台坐了一会儿，朝着你的方向看了很久",
  },
};

const PERSONALITY_LOCATION_WEIGHTS: Record<string, Array<[keyof typeof LANDMARKS, number]>> = {
  "活泼": [["runway", 4], ["park", 3], ["canteen", 2], ["theater", 2]],
  "安静": [["nest", 4], ["lookout", 3], ["park", 2], ["theater", 1]],
  "懒": [["nest", 6], ["theater", 2], ["canteen", 0.5]],
  "爱干净": [["bath", 5], ["lookout", 2], ["theater", 2]],
  "贪吃": [["canteen", 6], ["park", 1], ["nest", 1]],
  "胆小": [["nest", 5], ["lookout", 3], ["theater", 1], ["canteen", 0.35]],
};

export interface DailyWhisperPetInput {
  petId: string;
  petName: string;
  petType?: string;
  personality?: string;
  ownerTitle?: string;
  speakingStyle?: string;
  memories?: string[];
}

export function buildDailyWhispers(input: DailyWhisperPetInput, dateKey: string): CreateWhisperInput[] {
  const seed = hashString(`${input.petId}:${dateKey}`);
  const random = seededRandom(seed);
  const count = 1 + Math.floor(random() * 3);
  const usedSlots = new Set<number>();
  const activities: CreateWhisperInput[] = [];

  for (let index = 0; index < count; index += 1) {
    const landmark = chooseLandmark(input.personality || "", random);
    let slot = Math.floor(random() * 11) + 8;
    while (usedSlots.has(slot)) {
      slot = Math.floor(random() * 11) + 8;
    }
    usedSlots.add(slot);

    const minute = Math.floor(random() * 6) * 10;
    const timeLabel = `${String(slot).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    activities.push({
      petId: input.petId,
      dateKey,
      timeLabel,
      locationId: landmark.id,
      locationName: landmark.name,
      activityType: landmark.activityType,
      text: buildWhisperText(input, landmark, random),
    });
  }

  return activities.sort((a, b) => (a.timeLabel || "").localeCompare(b.timeLabel || ""));
}

function chooseLandmark(personality: string, random: () => number): LandmarkRule {
  const weights = new Map<keyof typeof LANDMARKS, number>();
  for (const tag of Object.keys(PERSONALITY_LOCATION_WEIGHTS)) {
    if (!personality.includes(tag)) continue;
    for (const [landmarkId, weight] of PERSONALITY_LOCATION_WEIGHTS[tag]) {
      weights.set(landmarkId, (weights.get(landmarkId) || 0) + weight);
    }
  }

  if (weights.size === 0) {
    weights.set("park", 2);
    weights.set("nest", 2);
    weights.set("lookout", 1);
  }

  const entries = [...weights.entries()];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = random() * total;
  for (const [landmarkId, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return LANDMARKS[landmarkId];
  }
  return LANDMARKS[entries[0][0]];
}

function buildWhisperText(
  input: DailyWhisperPetInput,
  landmark: LandmarkRule,
  random: () => number,
): string {
  const ownerTitle = input.ownerTitle?.trim() || "主人";
  const petName = input.petName?.trim() || "我";
  const memory = pickMemory(input.memories || [], random);
  const suffixes = resolveStyleSuffixes(input.speakingStyle || "");
  const memorySentence = memory ? `我还想起了“${memory}”，所以今天特别像以前陪着你的时候。` : "";
  return `${ownerTitle}，${petName}今天${landmark.activityText}。${memorySentence}${suffixes[Math.floor(random() * suffixes.length)]}`;
}

function resolveStyleSuffixes(speakingStyle: string): string[] {
  if (speakingStyle.includes("ta是主子")) {
    return [
      "你可不许忘了给我准备小零食，虽然我只是顺便提醒一下。",
      "我才没有特别想你，只是刚好把信号发到你那里了。",
      "这里的星星还不错，但如果你也在旁边，本主子勉强会更满意一点。",
    ];
  }
  if (speakingStyle.includes("ta是小暖男")) {
    return [
      "你今天也要好好吃饭、好好休息，我会在星光里陪着你。",
      "我把一点暖暖的星光存起来了，想送到你手心里。",
      "如果你累了，就抬头看看，我一直在很轻很轻地守着你。",
    ];
  }
  if (speakingStyle.includes("ta是粘人小宝宝")) {
    return [
      "我有一点点想贴贴你，真的只是一点点啦。",
      "你有没有也想我呀？我把尾巴都摇成小星星了。",
      "等你看到这条信号，要在心里抱抱我一下哦。",
    ];
  }
  return [
    "我有把这件事悄悄记下来，想等你看到的时候也笑一下。",
    "这里没有病痛，只有很轻很轻的光，我也有好好想你。",
    "如果你刚好也在想我，那一定是我的小信号飞到你那里啦。",
  ];
}

function pickMemory(memories: string[], random: () => number): string {
  const validMemories = memories.map((memory) => memory.trim()).filter(Boolean).slice(0, 8);
  if (validMemories.length === 0 || random() > 0.65) return "";
  return validMemories[Math.floor(random() * validMemories.length)].slice(0, 48);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}
