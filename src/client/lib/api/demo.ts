import { request } from './client'
import { createUser } from './users'
import { createShift } from './shifts'
import { addBan } from './bans'

// --- Demo Seed ---

export async function seedDemoData() {
  const { DEMO_ACCOUNTS } = await import('@shared/demo-accounts')

  // Create demo users (admin is already created via ADMIN_PUBKEY)
  const nonAdminAccounts = DEMO_ACCOUNTS.filter(a => !a.roleIds.includes('role-super-admin'))
  for (const account of nonAdminAccounts) {
    try {
      await createUser({
        name: account.name,
        phone: account.phone,
        roleIds: account.roleIds,
        pubkey: account.pubkey,
      })
    } catch { /* may already exist */ }
  }

  // Deactivate Fatima (inactive user demo)
  const fatima = DEMO_ACCOUNTS.find(a => a.name === 'Fatima Al-Rashid')
  if (fatima) {
    try {
      await request(`/users/${fatima.pubkey}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      })
    } catch { /* ignore */ }
  }

  // Mark all demo profiles as completed and set browser call preference
  for (const account of nonAdminAccounts) {
    try {
      await request(`/users/${account.pubkey}`, {
        method: 'PATCH',
        body: JSON.stringify({
          profileCompleted: true,
          callPreference: 'browser',
          spokenLanguages: account.spokenLanguages,
        }),
      })
    } catch { /* ignore */ }
  }

  // Create shifts
  const maria = DEMO_ACCOUNTS.find(a => a.name === 'Maria Santos') ?? DEMO_ACCOUNTS[0]
  const james = DEMO_ACCOUNTS.find(a => a.name === 'James Chen') ?? DEMO_ACCOUNTS[1]
  const shifts = [
    { id: crypto.randomUUID(), encryptedName: 'Morning Team', startTime: '08:00', endTime: '16:00', days: [1, 2, 3, 4, 5], userPubkeys: [maria.pubkey, james.pubkey], ringGroupId: null },
    { id: crypto.randomUUID(), encryptedName: 'Evening Team', startTime: '16:00', endTime: '23:59', days: [1, 2, 3, 4, 5], userPubkeys: [maria.pubkey], ringGroupId: null },
    { id: crypto.randomUUID(), encryptedName: 'Weekend Coverage', startTime: '10:00', endTime: '18:00', days: [0, 6], userPubkeys: [james.pubkey], ringGroupId: null },
  ]
  for (const shift of shifts) {
    try {
      await createShift(shift)
    } catch { /* ignore */ }
  }

  // Add sample bans
  const bans = [
    { phone: '+15559999001', reason: 'Repeated prank calls' },
    { phone: '+15559999002', reason: 'Threatening language towards volunteers' },
  ]
  for (const ban of bans) {
    try {
      await addBan(ban)
    } catch { /* ignore */ }
  }
}
