import { customAlphabet } from 'nanoid';

// URL-safe, lowercase alphanumerics only so ids are usable in go2rtc stream names and MQTT topics.
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const gen = customAlphabet(alphabet, 10);

export function newId(): string {
  return gen();
}
