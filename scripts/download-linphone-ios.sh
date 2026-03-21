#!/usr/bin/env bash
set -euo pipefail

VERSION=$(cat apps/ios/Frameworks/LINPHONE_VERSION 2>/dev/null || echo "5.3.110")
VERSION="${VERSION%%$'\n'}"  # strip trailing newline
DEST="apps/ios/Frameworks/linphone-sdk.xcframework"

if [ -d "$DEST" ]; then
  echo "Linphone XCFramework already present at $DEST, skipping download."
  exit 0
fi

mkdir -p apps/ios/Frameworks

URL="https://download.linphone.org/releases/ios/linphone-sdk-ios-${VERSION}.zip"
echo "Downloading Linphone iOS SDK ${VERSION} from ${URL}..."
curl -L --fail --retry 3 -o /tmp/linphone-ios.zip "$URL" || {
  echo "ERROR: Download failed. Check URL and network."
  exit 1
}
mkdir -p /tmp/linphone-ios
unzip -q /tmp/linphone-ios.zip -d /tmp/linphone-ios/
cp -r "/tmp/linphone-ios/linphone-sdk-${VERSION}/linphone-sdk.xcframework" "$DEST" 2>/dev/null || \
  find /tmp/linphone-ios/ -name "linphone-sdk.xcframework" -exec cp -r {} "$DEST" \;
rm -rf /tmp/linphone-ios.zip /tmp/linphone-ios/
echo "Linphone XCFramework installed at $DEST"
