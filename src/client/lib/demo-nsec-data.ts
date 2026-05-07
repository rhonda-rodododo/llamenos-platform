/**
 * Demo account Ed25519 seeds — loaded dynamically to avoid bundling in production.
 *
 * This file is imported lazily by demo-accounts.ts only when demo mode is active.
 * Tree-shaking cannot remove top-level data, so isolating seeds here ensures
 * they are only fetched when explicitly needed.
 *
 * Keys: Ed25519 signing pubkey hex → Ed25519 signing seed hex (64 chars each).
 */
export const DEMO_SEEDS: Record<string, string> = {
  '9bfc4116dc9d579cc0f88d58af7bef098f8bc31a16e053deb1de4525b79fe9da':
    'd932536c5a82a500fe7c9bd870906a66b9e9866ed468b79ab15074c00c5cab48',
  '31fd9a5f6f04d11a08e85f9ab2c8cfd3b1ea4ccf5a798c55e323ff924bc59f90':
    'f38001c68e298529967ed1374075c52e5b6a704a4c739864f228da5f248f5a6f',
  '783f763464dfbdb4a5853f5a27a53a68827dfa7bf8b95418b253cc55f3e4b947':
    '691b624970d332901c67f4a108f4d5f10adc955c780c9228018cb1bf1a1a8dd8',
  '4ea8b293d9aaf2c06ab4902b7b8b0d515f00cf4f37728c268b70a7e0c1f20533':
    'fe6e766c73ba74d94eb6fb1cbf55dcfc8cf0dd8617710fdcb948587476738504',
  '8bd8335c35a2966fd58ee7a7a7508a8b5c4844b0103c946ddfe1cd4381259e06':
    '671e497a6e2f9fd45b60d1d0e268acb7ad57e6d96d9207403ce13da4967ac01e',
}

/** @deprecated Use DEMO_SEEDS instead. */
export const DEMO_NSECS = DEMO_SEEDS
