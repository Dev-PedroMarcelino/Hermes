import test from 'node:test';
import assert from 'node:assert';
import { encryptCredential, decryptCredential } from '../src/services/vaultService.js';
import { generateAssSubtitles } from '../src/services/subtitleService.js';
import path from 'path';
import fs from 'fs-extra';

test('Vault Encryption & Decryption (AES-256-GCM)', () => {
  const secret = 'AIzaSy_Test_Gemini_Key_12345';
  const encrypted = encryptCredential(secret);
  assert.notStrictEqual(encrypted, secret);
  assert.ok(encrypted.includes(':'));

  const decrypted = decryptCredential(encrypted);
  assert.strictEqual(decrypted, secret);
});

test('ASS Dynamic Subtitle File Generation', async () => {
  const sampleSections = [
    { text: 'Você não vai acreditar no que essa IA consegue fazer!', durationEstSeconds: 3 },
    { text: 'Ela cria apresentações completas em segundos.', durationEstSeconds: 4 }
  ];

  const testAssPath = path.resolve('./tmp_test_subtitles.ass');
  await generateAssSubtitles({
    sections: sampleSections,
    outputAssPath: testAssPath,
    style: { fontName: 'Montserrat-Black', fontSize: 24 }
  });

  assert.ok(fs.existsSync(testAssPath));
  const content = await fs.readFile(testAssPath, 'utf8');
  assert.ok(content.includes('[Script Info]'));
  assert.ok(content.includes('Dialogue:'));

  // Clean up
  await fs.remove(testAssPath);
});
