# Android Play Store — Graphic Asset Specifications

Assets required before submitting to Google Play. None of these are generated
automatically — a designer or developer must produce them.

---

## Hi-Res App Icon

| Property | Value |
|----------|-------|
| Size | 512 × 512 px |
| Format | PNG |
| Transparency | **Not allowed** — fully opaque background |
| Rounded corners | Do not apply — Google rounds corners automatically |
| Safe zone | Keep key content inside a centered 456 × 456 px circle |

**Design guidance:**
- Must visually match the adaptive icon in `apps/android/app/src/main/res/mipmap-*/`
- The adaptive icon foreground layer is `ic_launcher_foreground.xml`; the background color is `#1A1A2E` (dark navy)
- Use the same phone/handset motif with a lock icon overlay to convey encrypted hotline
- Export at 512 × 512; do not scale up from a smaller source

**Fastlane path:** `apps/android/fastlane/metadata/android/en-US/icon.png`

---

## Feature Graphic

| Property | Value |
|----------|-------|
| Size | 1024 × 500 px |
| Format | PNG or JPG |
| Transparency | **Not allowed** |

**Display context:**
Shown as the header banner in the Play Store listing. Also used in promotional
placements (featured apps, editorial picks). Content must be legible on its own
without the app icon overlay (Google may crop or overlay elements).

**Design guidance:**
- Dark background (`#1A1A2E` or `#0D1117`) — consistent with app color scheme
- App name "Llámenos" centered in large type (the accented form is fine in graphics)
- Tagline beneath: "Secure crisis response" or "End-to-end encrypted hotline"
- Optional: subtle circuit/lock pattern or abstract waveform to suggest telephony + encryption
- No screenshots embedded — the graphic should be standalone
- Leave 50 px padding on all edges for safe margins

**Fastlane path:** `apps/android/fastlane/metadata/android/en-US/featureGraphic.png`

---

## Phone Screenshots

| Property | Value |
|----------|-------|
| Minimum | 2 screenshots |
| Recommended | 6–7 screenshots |
| Aspect ratio | 9:16 (portrait) or 16:9 (landscape) |
| Recommended size | 1080 × 2400 px (portrait, FHD+) |
| Format | PNG or JPG |
| Min dimension | 320 px per side |
| Max dimension | 3840 px per side |

**Capture script:** `apps/android/fastlane/screenshots.sh`

### Recommended screenshot sequence

| # | Screen | What to show | Suggested overlay text |
|---|--------|-------------|------------------------|
| 1 | Dashboard | On-shift status, upcoming shift, standby state | "Always ready when you're on shift" |
| 2 | Incoming call | In-app call answer screen with notification | "Parallel ringing — first to answer takes the call" |
| 3 | Note editor | Encrypted note editor during/after call, encryption badge visible | "End-to-end encrypted — server cannot read your notes" |
| 4 | Case report | Template-driven report form with custom field types | "Template-driven case management" |
| 5 | Shift schedule | Shift calendar or schedule management view | "Automated shift routing" |
| 6 | Admin panel | Volunteer list with role badges, or ban list management | "Real-time volunteer and ban management" |
| 7 | Settings / Security | Security settings or key info screen | "Android Keystore — keys never leave your device" |

**Screenshot overlay notes:**
- Apply overlay text as a semi-transparent banner at the top or bottom
- Use the same font and color scheme as the feature graphic
- Test that overlays are legible on both light and dark system themes

**Fastlane path:** `apps/android/fastlane/metadata/android/en-US/phoneScreenshots/`

---

## 7-Inch Tablet Screenshots (optional but recommended)

| Property | Value |
|----------|-------|
| Recommended size | 1200 × 2000 px (portrait) |
| Format | PNG or JPG |

**Design guidance:**
- Tablet layouts use a split-pane design in landscape; show the call list + note editor side-by-side
- Portrait screenshots are fine if the tablet layout matches phone layout at this size

**Fastlane path:** `apps/android/fastlane/metadata/android/en-US/sevenInchScreenshots/`

---

## 10-Inch Tablet Screenshots (optional)

| Property | Value |
|----------|-------|
| Recommended size | 1920 × 1200 px (landscape) or 1200 × 1920 px (portrait) |
| Format | PNG or JPG |

**Fastlane path:** `apps/android/fastlane/metadata/android/en-US/tenInchScreenshots/`

---

## Asset Checklist

Before submitting to Google Play:

- [ ] Hi-res icon: 512 × 512 PNG, no alpha, matches adaptive icon foreground
- [ ] Feature graphic: 1024 × 500 PNG or JPG, no transparency
- [ ] Phone screenshots: minimum 2, recommended 6–7, at 1080 × 2400
- [ ] Screenshot overlays reviewed and legible
- [ ] Tablet screenshots added (optional but improves Play Store presentation)
- [ ] All assets reviewed at actual Play Store display size (not just at export resolution)
- [ ] Fastlane paths confirmed — run `bundle exec fastlane metadata` from `apps/android/` to upload

---

## Notes

- Google may reject screenshots that contain overlay text obscuring key UI elements — keep overlays to banners at screen edges
- The feature graphic must not include a device frame or app icon (Google overlays the icon itself)
- Screenshots should reflect the **release** build appearance — no debug banners, no test data with real personal information
- If screenshots include volunteer names or caller information, use clearly fictional placeholder data
