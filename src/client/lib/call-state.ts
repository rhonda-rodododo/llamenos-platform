// Module-level call state store — readable outside React without re-render coupling.
// Updated by useCalls hook as a side effect.
//
// Calls are stored with the hub they belong to: acting on a call (answer, hang up)
// must target the call's own hub, which is not necessarily the active one.

export interface CallRef {
  id: string
  hubId: string
}

let ringingCalls: CallRef[] = []
let currentCall: CallRef | null = null

export function getRingingCalls(): CallRef[] {
  return ringingCalls
}

export function setRingingCalls(calls: CallRef[]) {
  ringingCalls = calls
}

export function getCurrentCall(): CallRef | null {
  return currentCall
}

export function setCurrentCall(call: CallRef | null) {
  currentCall = call
}
