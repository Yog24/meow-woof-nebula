const BACKEND_URL_STORAGE_KEY = 'wangxing_backend_url';
const BACKEND_ACCESS_TOKEN_STORAGE_KEY = 'wangxing_backend_access_token';
const BACKEND_REFRESH_TOKEN_STORAGE_KEY = 'wangxing_backend_refresh_token';
const BACKEND_DEVICE_CODE_STORAGE_KEY = 'wangxing_backend_device_code';
const BACKEND_CURRENT_USER_STORAGE_KEY = 'wangxing_backend_current_user';

export interface BackendUser {
  id: string;
  openId: string;
  nickName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUserProfile {
  id: string;
  nickName: string;
  avatarUrl?: string;
  isFriend?: boolean;
  hasPendingRequest?: boolean;
}

export interface SocialWhisper {
  id: string;
  authorUserId: string;
  petId?: string;
  text: string;
  imageUrl?: string;
  dateKey?: string;
  timeLabel?: string;
  locationId?: string;
  locationName?: string;
  activityType?: string;
  createdAt: string;
  updatedAt: string;
  author?: PublicUserProfile;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface WhisperComment {
  id: string;
  whisperId: string;
  authorUserId: string;
  text: string;
  createdAt: string;
  author?: PublicUserProfile;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  respondedAt?: string;
  fromUser?: PublicUserProfile;
  toUser?: PublicUserProfile;
}

function getBackendBaseUrl() {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
  if (saved && saved.trim()) return saved.trim().replace(/\/$/, '');
  return 'http://127.0.0.1:3100';
}

function getOrCreateDeviceCode() {
  const existing = localStorage.getItem(BACKEND_DEVICE_CODE_STORAGE_KEY);
  if (existing && existing.trim()) return existing;
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device_${Date.now()}`;
  localStorage.setItem(BACKEND_DEVICE_CODE_STORAGE_KEY, generated);
  return generated;
}

async function ensureBackendAccessToken() {
  const cached = localStorage.getItem(BACKEND_ACCESS_TOKEN_STORAGE_KEY);
  if (cached && cached.trim()) return cached;
  throw new Error('请先在系统设置的账号登录页登录');
}

export async function loginToBackend(input: {
  code?: string;
  nickName: string;
  avatarUrl?: string;
}): Promise<{
  user: BackendUser;
  accessToken: string;
  refreshToken: string;
}> {
  const nickName = input.nickName.trim() || '喵汪星旅人';
  const response = await fetch(`${getBackendBaseUrl()}/api/v1/auth/wechat-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code: input.code || `manual_login_${getOrCreateDeviceCode()}`,
      profile: {
        nickName,
        avatarUrl: input.avatarUrl,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token?.accessToken) {
    throw new Error(data.error?.message || 'backend auth failed');
  }

  localStorage.setItem(BACKEND_ACCESS_TOKEN_STORAGE_KEY, data.token.accessToken);
  if (data.token.refreshToken) {
    localStorage.setItem(BACKEND_REFRESH_TOKEN_STORAGE_KEY, data.token.refreshToken);
  }
  localStorage.setItem(BACKEND_CURRENT_USER_STORAGE_KEY, JSON.stringify(data.user));
  return {
    user: data.user,
    accessToken: data.token.accessToken,
    refreshToken: data.token.refreshToken,
  };
}

export async function loginWithDisplayName(displayName: string) {
  const accountName = displayName.trim() || '喵汪星旅人';
  return loginToBackend({
    code: `manual_login_${accountName.toLowerCase()}`,
    nickName: accountName,
  });
}

export async function getBackendCurrentUser(): Promise<BackendUser | null> {
  const token = localStorage.getItem(BACKEND_ACCESS_TOKEN_STORAGE_KEY);
  if (!token?.trim()) return null;

  const response = await fetch(`${getBackendBaseUrl()}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) {
    localStorage.removeItem(BACKEND_ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(BACKEND_REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(BACKEND_CURRENT_USER_STORAGE_KEY);
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || 'fetch current user failed');
  }
  if (data.user) {
    localStorage.setItem(BACKEND_CURRENT_USER_STORAGE_KEY, JSON.stringify(data.user));
  }
  return data.user || null;
}

export function getCachedBackendUser(): BackendUser | null {
  const rawUser = localStorage.getItem(BACKEND_CURRENT_USER_STORAGE_KEY);
  if (!rawUser) return null;
  try {
    return JSON.parse(rawUser) as BackendUser;
  } catch {
    return null;
  }
}

export function getCurrentBackendUserId(): string {
  return getCachedBackendUser()?.id || 'anonymous';
}

export async function logoutBackend(): Promise<void> {
  const token = localStorage.getItem(BACKEND_ACCESS_TOKEN_STORAGE_KEY);
  if (token?.trim()) {
    await fetch(`${getBackendBaseUrl()}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => null);
  }
  localStorage.removeItem(BACKEND_ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(BACKEND_REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(BACKEND_CURRENT_USER_STORAGE_KEY);
}

async function authorizedFetch(path: string, init: RequestInit = {}, retryOnUnauthorized = true) {
  const token = await ensureBackendAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && retryOnUnauthorized) {
    localStorage.removeItem(BACKEND_ACCESS_TOKEN_STORAGE_KEY);
    return authorizedFetch(path, init, false);
  }

  return response;
}

async function authorizedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `backend request failed (${response.status})`);
  }
  return data as T;
}

export async function searchBackendUsers(query: string) {
  const data = await authorizedJson<{ users: PublicUserProfile[] }>(
    `/api/v1/social/users/search?q=${encodeURIComponent(query)}&limit=30`,
  );
  return data.users;
}

export async function getTodayWhispers(input: {
  petId: string;
  petName: string;
  petType?: string;
  personality?: string;
  ownerTitle?: string;
  speakingStyle?: string;
  memories?: string[];
}) {
  const data = await authorizedJson<{ dateKey: string; whispers: SocialWhisper[] }>(
    '/api/v1/social/whispers/today',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );
  return data;
}

export async function toggleWhisperLike(whisperId: string) {
  return authorizedJson<{ whisperId: string; liked: boolean; likeCount: number }>(
    `/api/v1/social/whispers/${whisperId}/likes/toggle`,
    { method: 'POST' },
  );
}

export async function listWhisperComments(whisperId: string) {
  const data = await authorizedJson<{ comments: WhisperComment[] }>(
    `/api/v1/social/whispers/${whisperId}/comments`,
  );
  return data.comments;
}

export async function createWhisperComment(whisperId: string, text: string) {
  const data = await authorizedJson<{ comment: WhisperComment }>(
    `/api/v1/social/whispers/${whisperId}/comments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    },
  );
  return data.comment;
}

export async function listBackendFriends() {
  const data = await authorizedJson<{ friends: PublicUserProfile[] }>('/api/v1/social/friends');
  return data.friends;
}

export async function listBackendFriendRequests() {
  return authorizedJson<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(
    '/api/v1/social/friends/requests',
  );
}

export async function sendBackendFriendRequest(targetUserId: string) {
  const data = await authorizedJson<{ request: FriendRequest }>('/api/v1/social/friends/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetUserId }),
  });
  return data.request;
}

export async function respondBackendFriendRequest(requestId: string, action: 'accept' | 'reject') {
  const data = await authorizedJson<{ request: FriendRequest }>(
    `/api/v1/social/friends/requests/${requestId}/respond`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    },
  );
  return data.request;
}

export async function createPixelAvatarFromImage(input: {
  imageDataUrl: string;
  petType: 'cat' | 'dog' | 'other';
  outputSize?: 128 | 256 | 512;
}) {
  return createPixelAvatarFromImages({
    imageDataUrls: [input.imageDataUrl],
    petType: input.petType,
    outputSize: input.outputSize,
  });
}

export async function createPixelAvatarFromImages(input: {
  imageDataUrls: string[];
  petType: 'cat' | 'dog' | 'other';
  outputSize?: 128 | 256 | 512;
}) {
  const imageDataUrls = input.imageDataUrls.filter(Boolean).slice(0, 4);
  if (imageDataUrls.length === 0) {
    throw new Error('at least one reference image is required');
  }

  const uploadedAssets = await Promise.all(
    imageDataUrls.map(async (imageDataUrl, index) => {
      const uploadResponse = await authorizedFetch('/api/v1/image-tasks/uploads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: `pet-reference-${index + 1}.png`,
          contentType: 'image/png',
          dataUrl: imageDataUrl,
        }),
      });
      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) {
        throw new Error(uploadData.error?.message || 'upload image failed');
      }
      return uploadData.asset;
    }),
  );

  const taskResponse = await authorizedFetch('/api/v1/image-tasks/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assetId: uploadedAssets[0].id,
      assetIds: uploadedAssets.map((asset) => asset.id),
      petType: input.petType,
      outputSize: input.outputSize || 256,
      stylePreset: 'cute_pixel_v1',
      preserveTraits: true,
    }),
  });
  const taskData = await taskResponse.json().catch(() => ({}));
  if (!taskResponse.ok) {
    throw new Error(taskData.error?.message || 'create image task failed');
  }

  const taskId = taskData.task.id;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const statusResponse = await authorizedFetch(`/api/v1/image-tasks/tasks/${taskId}`);
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      throw new Error(statusData.error?.message || 'poll image task failed');
    }

    if (statusData.task.status === 'completed') {
      const resultResponse = await authorizedFetch(`/api/v1/image-tasks/tasks/${taskId}/result`);
      const resultData = await resultResponse.json().catch(() => ({}));
      if (!resultResponse.ok) {
        throw new Error(resultData.error?.message || 'fetch image task result failed');
      }
      return resultData.result.imageUrl as string;
    }

    if (statusData.task.status === 'failed') {
      throw new Error(statusData.task.errorMessage || 'image task failed');
    }
  }

  throw new Error('image task timeout');
}
