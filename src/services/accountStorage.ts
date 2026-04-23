import { getCurrentBackendUserId } from './backendClient';

const ACCOUNT_SCOPED_KEYS = new Set([
  'wangxing_user_api_key',
  'wangxing_user_base_url',
  'wangxing_text_model',
  'wangxing_image_model',
  'wangxing_pet_v2',
  'wangxing_profile_v2',
  'wangxing_messages_v2',
]);

export function getAccountScopedStorageKey(key: string, userId = getCurrentBackendUserId()) {
  if (!ACCOUNT_SCOPED_KEYS.has(key)) return key;
  return `${key}:${userId}`;
}

export function getAccountStorageItem(key: string): string | null {
  return localStorage.getItem(getAccountScopedStorageKey(key));
}

export function setAccountStorageItem(key: string, value: string): void {
  localStorage.setItem(getAccountScopedStorageKey(key), value);
}

export function removeAccountStorageItem(key: string): void {
  localStorage.removeItem(getAccountScopedStorageKey(key));
}

export function migrateLegacyAccountStorage(userId = getCurrentBackendUserId()): void {
  if (!userId || userId === 'anonymous') return;
  for (const key of ACCOUNT_SCOPED_KEYS) {
    const scopedKey = getAccountScopedStorageKey(key, userId);
    if (localStorage.getItem(scopedKey) !== null) continue;
    const legacyValue = localStorage.getItem(key);
    if (legacyValue !== null) {
      localStorage.setItem(scopedKey, legacyValue);
    }
  }
}
