import test from 'node:test';
import assert from 'node:assert/strict';
import { searchRealGoogleImageCandidates } from '../src/services/googleImageService.js';
import { searchSingleSceneImages } from '../src/services/imagePreviewService.js';

test('searchRealGoogleImageCandidates returns candidate image urls for a query', async () => {
  const urls = await searchRealGoogleImageCandidates({ query: 'Nature landscape mountains', maxResults: 4 });
  assert.ok(Array.isArray(urls), 'urls should be an array');
  console.log(`[Test] Candidatos encontrados no Google/Bing/Wiki: ${urls.length}`);
  if (urls.length > 0) {
    assert.match(urls[0], /^https?:\/\//, 'First item should be a valid HTTP(S) URL');
  }
});

test('searchSingleSceneImages returns AI or web choices', async () => {
  const result = await searchSingleSceneImages({
    query: 'Cyberpunk neon city skyline',
    prompt: 'Cyberpunk neon city skyline, highly detailed',
    source: 'ai_image'
  });

  assert.ok(result.imageUrl, 'Should return an imageUrl');
  assert.ok(result.imageUrl.startsWith('https://image.pollinations.ai'), 'Should be a pollinations AI URL');
  assert.ok(Array.isArray(result.alternativeUrls), 'Should have alternative URLs');
  console.log('[Test] Resultado IA:', result.imageUrl);
});
