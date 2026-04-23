import { randomUUID } from "node:crypto";

export type PetStatus =
  | "happy"
  | "itchy"
  | "annoyed"
  | "sick"
  | "studying"
  | "sleeping"
  | "tired";

export interface PetProfile {
  id: string;
  userId: string;
  name: string;
  type: string;
  breed?: string;
  encounterDate?: string;
  ownerTitle: string;
  personality: string;
  speakingStyle?: string;
  avatarUrl?: string;
  happiness: number;
  energy: number;
  health: number;
  status: PetStatus;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt: string;
}

export interface PetStory {
  id: string;
  petId: string;
  title: string;
  content: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface PetInteraction {
  id: string;
  petId: string;
  kind: string;
  note?: string;
  happinessDelta: number;
  energyDelta: number;
  healthDelta: number;
  occurredAt: string;
}

export interface CreatePetInput {
  name: string;
  type: string;
  breed?: string;
  encounterDate?: string;
  ownerTitle: string;
  personality: string;
  speakingStyle?: string;
  avatarUrl?: string;
}

export interface UpdatePetInput {
  name?: string;
  type?: string;
  breed?: string;
  encounterDate?: string;
  ownerTitle?: string;
  personality?: string;
  speakingStyle?: string;
  avatarUrl?: string;
  status?: PetStatus;
}

export interface StoryInput {
  title: string;
  content: string;
  date?: string;
}

export interface InteractionInput {
  kind: string;
  note?: string;
  happinessDelta?: number;
  energyDelta?: number;
  healthDelta?: number;
}

export class InMemoryMemorialRepository {
  private readonly petsById = new Map<string, PetProfile>();
  private readonly petIdsByUserId = new Map<string, Set<string>>();
  private readonly storiesByPetId = new Map<string, PetStory[]>();
  private readonly interactionsByPetId = new Map<string, PetInteraction[]>();

  createPet(userId: string, input: CreatePetInput): PetProfile {
    const now = new Date().toISOString();
    const pet: PetProfile = {
      id: randomUUID(),
      userId,
      name: input.name.trim(),
      type: input.type.trim(),
      breed: input.breed?.trim() || undefined,
      encounterDate: input.encounterDate?.trim() || undefined,
      ownerTitle: input.ownerTitle.trim(),
      personality: input.personality.trim(),
      speakingStyle: input.speakingStyle?.trim() || undefined,
      avatarUrl: input.avatarUrl?.trim() || undefined,
      happiness: 100,
      energy: 100,
      health: 100,
      status: "happy",
      createdAt: now,
      updatedAt: now,
      lastInteractionAt: now,
    };

    this.petsById.set(pet.id, pet);
    const currentPetIds = this.petIdsByUserId.get(userId) || new Set<string>();
    currentPetIds.add(pet.id);
    this.petIdsByUserId.set(userId, currentPetIds);
    this.storiesByPetId.set(pet.id, []);
    this.interactionsByPetId.set(pet.id, []);
    return pet;
  }

  listPetsByUserId(userId: string): PetProfile[] {
    const petIds = this.petIdsByUserId.get(userId);
    if (!petIds) return [];

    const pets = Array.from(petIds)
      .map((petId) => this.petsById.get(petId))
      .filter((pet): pet is PetProfile => Boolean(pet));
    return pets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  findPetByIdForUser(userId: string, petId: string): PetProfile | null {
    const pet = this.petsById.get(petId);
    if (!pet || pet.userId !== userId) return null;
    return pet;
  }

  updatePetForUser(
    userId: string,
    petId: string,
    patch: UpdatePetInput,
  ): PetProfile | null {
    const pet = this.findPetByIdForUser(userId, petId);
    if (!pet) return null;

    const nextPet: PetProfile = {
      ...pet,
      name: patch.name?.trim() || pet.name,
      type: patch.type?.trim() || pet.type,
      breed: patch.breed?.trim() || pet.breed,
      encounterDate: patch.encounterDate?.trim() || pet.encounterDate,
      ownerTitle: patch.ownerTitle?.trim() || pet.ownerTitle,
      personality: patch.personality?.trim() || pet.personality,
      speakingStyle: patch.speakingStyle?.trim() || pet.speakingStyle,
      avatarUrl: patch.avatarUrl?.trim() || pet.avatarUrl,
      status: patch.status || pet.status,
      updatedAt: new Date().toISOString(),
    };

    this.petsById.set(nextPet.id, nextPet);
    return nextPet;
  }

  replaceStoriesForPet(
    userId: string,
    petId: string,
    stories: StoryInput[],
  ): PetStory[] | null {
    const pet = this.findPetByIdForUser(userId, petId);
    if (!pet) return null;

    const now = new Date().toISOString();
    const nextStories: PetStory[] = stories.map((story) => ({
      id: randomUUID(),
      petId,
      title: story.title.trim(),
      content: story.content.trim(),
      date: story.date?.trim() || now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
    }));

    this.storiesByPetId.set(petId, nextStories);
    this.petsById.set(petId, {
      ...pet,
      updatedAt: now,
    });
    return nextStories;
  }

  listStoriesForPet(userId: string, petId: string): PetStory[] | null {
    const pet = this.findPetByIdForUser(userId, petId);
    if (!pet) return null;
    const stories = this.storiesByPetId.get(petId) || [];
    return [...stories].sort((a, b) => b.date.localeCompare(a.date));
  }

  addInteractionForPet(
    userId: string,
    petId: string,
    input: InteractionInput,
  ): PetInteraction | null {
    const pet = this.findPetByIdForUser(userId, petId);
    if (!pet) return null;

    const interaction: PetInteraction = {
      id: randomUUID(),
      petId,
      kind: input.kind.trim(),
      note: input.note?.trim() || undefined,
      happinessDelta: input.happinessDelta ?? 0,
      energyDelta: input.energyDelta ?? 0,
      healthDelta: input.healthDelta ?? 0,
      occurredAt: new Date().toISOString(),
    };

    const interactions = this.interactionsByPetId.get(petId) || [];
    interactions.push(interaction);
    this.interactionsByPetId.set(petId, interactions);

    const nextPet = this.applyInteractionToPet(pet, interaction);
    this.petsById.set(petId, nextPet);
    return interaction;
  }

  listInteractionsForPet(userId: string, petId: string): PetInteraction[] | null {
    const pet = this.findPetByIdForUser(userId, petId);
    if (!pet) return null;
    const interactions = this.interactionsByPetId.get(petId) || [];
    return [...interactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  getTimelineForPet(
    userId: string,
    petId: string,
    limit = 20,
  ):
    | Array<
        | {
            id: string;
            entityType: "story";
            title: string;
            content: string;
            happenedAt: string;
          }
        | {
            id: string;
            entityType: "interaction";
            kind: string;
            note?: string;
            happinessDelta: number;
            energyDelta: number;
            healthDelta: number;
            happenedAt: string;
          }
      >
    | null {
    const pet = this.findPetByIdForUser(userId, petId);
    if (!pet) return null;

    const stories = this.storiesByPetId.get(petId) || [];
    const interactions = this.interactionsByPetId.get(petId) || [];

    const merged = [
      ...stories.map((story) => ({
        id: story.id,
        entityType: "story" as const,
        title: story.title,
        content: story.content,
        happenedAt: story.date,
      })),
      ...interactions.map((interaction) => ({
        id: interaction.id,
        entityType: "interaction" as const,
        kind: interaction.kind,
        note: interaction.note,
        happinessDelta: interaction.happinessDelta,
        energyDelta: interaction.energyDelta,
        healthDelta: interaction.healthDelta,
        happenedAt: interaction.occurredAt,
      })),
    ];

    merged.sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
    return merged.slice(0, limit);
  }

  private applyInteractionToPet(
    pet: PetProfile,
    interaction: PetInteraction,
  ): PetProfile {
    const happiness = clampMetric(pet.happiness + interaction.happinessDelta);
    const energy = clampMetric(pet.energy + interaction.energyDelta);
    const health = clampMetric(pet.health + interaction.healthDelta);
    const status = deriveStatus(energy, health);
    return {
      ...pet,
      happiness,
      energy,
      health,
      status,
      updatedAt: interaction.occurredAt,
      lastInteractionAt: interaction.occurredAt,
    };
  }
}

function deriveStatus(energy: number, health: number): PetStatus {
  if (health < 35) return "sick";
  if (energy < 20) return "tired";
  return "happy";
}

function clampMetric(value: number): number {
  return Math.max(0, Math.min(100, value));
}
