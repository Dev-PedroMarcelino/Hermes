import crypto from 'crypto';
import { config } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getDerivedKey(secretKey) {
  return crypto.createHash('sha256').update(String(secretKey)).digest();
}

/**
 * Encrypts sensitive string data (API Key, OAuth token)
 * @param {string} text Plaintext to encrypt
 * @returns {string} Encrypted string in format "iv:authTag:encryptedData"
 */
export function encryptCredential(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getDerivedKey(config.encryptionKey);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts encrypted string data
 * @param {string} encryptedText Encrypted string in format "iv:authTag:encryptedData"
 * @returns {string} Plaintext
 */
export function decryptCredential(encryptedText) {
  if (!encryptedText) return '';
  if (!encryptedText.includes(':')) return encryptedText; // Fallback if plain text during dev

  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  const [ivHex, authTagHex, encryptedDataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getDerivedKey(config.encryptionKey);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
