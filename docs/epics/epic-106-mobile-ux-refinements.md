# Epic 106: Mobile UX Refinements

**Status: PENDING** (depends on Epic 103)
**Repo**: llamenos-mobile

## Summary

Polish mobile experience for production readiness.

## Tasks

### Accessibility
- All interactive elements: `accessibilityLabel` + `accessibilityRole`
- Touch targets minimum 44x44pt
- Color contrast WCAG AA
- `accessibilityHint` for non-obvious actions

### Keyboard Handling
- Dismiss keyboard on scroll/tap outside
- `KeyboardAvoidingView` on all form screens
- Input field focus chain (next button)
- Safe area handling

### Gestures
- Swipe-to-delete on admin lists
- Pull-to-refresh on all list screens
- Long-press context menus for note/message actions

### Loading & Transitions
- Skeleton screens on all data-fetching screens
- Screen transition animations
- Optimistic updates for mutations

### Deep Linking
- `llamenos://invite?code=...` — open invite redemption
- `llamenos://call/...` — open active call
- `llamenos://note/...` — open note detail
- Configure in `app.json` and Expo Router linking config
