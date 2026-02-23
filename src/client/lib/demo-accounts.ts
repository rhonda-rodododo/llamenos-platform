import { DEMO_ACCOUNTS } from '@shared/demo-accounts'

/**
 * Demo account nsec values — client-side only.
 * These are intentionally public for demo mode login.
 */
const DEMO_NSECS: Record<string, string> = {
  '9bfc4116dc9d579cc0f88d58af7bef098f8bc31a16e053deb1de4525b79fe9da':
    'nsec1myevfk9dg9fgq8l8ex7sujqdxdw0fsmd45v9hn2c4p6vqrzu4s5s2j3v26',
  '31fd9a5f6f04d11a08e85f9ab2c8cfd3b1ea4ccf5a798c55e323ff924bc59f90':
    'nsec17wqqwx68znpff9n763xaqac4zh9k6wp2fnrnpj0j98d97fyfafhsef46k6',
  '783f763464dfbdb4a5853f5a27a53a68827dfa7bf8b95418b253cc55f3e4b947':
    'nsec1dyfd3y9c6ve5syuvl6jss0f403ptwf2u0qryj9qrstx3lrgdgmkqhzaxr4',
  '4ea8b293d9aaf2c06ab4902b7b8b0d515f00cf4f37728c268b70a7e0c1f20533':
    'nsec1leh8varnnhfm98tklvwta2aelx9uxaschwy00udefzchrd88fq4q7wg3q9',
  '8bd8335c35a2966fd58ee7a7a7508a8b5c4844b0103c946ddfe1cd4381259e06':
    'nsec1vu7vj0fhzl8769tvrgwswy6etd664lxm9k6g8gpensnmf9n6cqlqjp8ylk',
}

export function getDemoNsec(pubkey: string): string | undefined {
  return DEMO_NSECS[pubkey]
}

export function getDemoAccountsWithNsec() {
  return DEMO_ACCOUNTS.filter(a => !a.roleIds.includes('role-volunteer') || a.name !== 'Fatima Al-Rashid').map(a => ({
    ...a,
    nsec: DEMO_NSECS[a.pubkey]!,
  }))
}
