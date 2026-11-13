#!/usr/bin/env bash
# Turns this Flutter project into a client's white-label app. Env: CENTRE_ID APP_NAME PACKAGE_ID APP_COLOUR (#RRGGBB) APP_LOGO_URL APP_ICON_URL API_BASE
set -e; cd "$(dirname "$0")/.."
: "${CENTRE_ID:?CENTRE_ID required}"; : "${APP_NAME:?APP_NAME required}"; : "${PACKAGE_ID:?PACKAGE_ID required}"
APP_COLOUR=${APP_COLOUR:-#1673D9}; API_BASE=${API_BASE:-https://nextedge.nextresource.in/api}
echo "White-label: $APP_NAME ($PACKAGE_ID) centre=$CENTRE_ID colour=$APP_COLOUR"
# 1. logo + icon
if [ -n "$APP_LOGO_URL" ]; then curl -fsSL "$APP_LOGO_URL" -o assets/brand-logo.png; fi
if [ -n "$APP_ICON_URL" ]; then curl -fsSL "$APP_ICON_URL" -o assets/icon.png; elif [ -n "$APP_LOGO_URL" ]; then python3 - <<'PY'
from PIL import Image
im=Image.open('assets/brand-logo.png').convert('RGBA'); s=max(im.size); sq=Image.new('RGBA',(s,s),(255,255,255,255)); sq.paste(im,((s-im.width)//2,(s-im.height)//2),im); sq.resize((1024,1024)).save('assets/icon.png')
PY
fi
# 2. package id + label (android + ios)
sed -i.bak "s#applicationId \"[^\"]*\"#applicationId \"$PACKAGE_ID\"#; s#namespace \"[^\"]*\"#namespace \"$PACKAGE_ID\"#" android/app/build.gradle* 2>/dev/null || true
sed -i.bak "s#applicationId = \"[^\"]*\"#applicationId = \"$PACKAGE_ID\"#; s#namespace = \"[^\"]*\"#namespace = \"$PACKAGE_ID\"#" android/app/build.gradle* 2>/dev/null || true
sed -i.bak "s#android:label=\"[^\"]*\"#android:label=\"$APP_NAME\"#" android/app/src/main/AndroidManifest.xml
sed -i.bak "s#PRODUCT_BUNDLE_IDENTIFIER = [^;]*;#PRODUCT_BUNDLE_IDENTIFIER = $PACKAGE_ID;#g" ios/Runner.xcodeproj/project.pbxproj 2>/dev/null || true
python3 - "$APP_NAME" <<'PY'
import re,sys,pathlib
p=pathlib.Path('ios/Runner/Info.plist')
if p.exists():
    s=p.read_text(); s=re.sub(r'(<key>CFBundleDisplayName</key>\s*<string>)[^<]*', r'\g<1>'+sys.argv[1], s); s=re.sub(r'(<key>CFBundleName</key>\s*<string>)[^<]*', r'\g<1>'+sys.argv[1], s); p.write_text(s)
PY
# 3. launcher icons
dart run flutter_launcher_icons || true
# 4. dart-defines file for the build step
COLOUR_INT=$(python3 -c "import sys;c=sys.argv[1].lstrip('#');print(int('FF'+c,16))" "$APP_COLOUR")
cat > .whitelabel.defines <<D
--dart-define=CENTRE_ID=$CENTRE_ID --dart-define=CENTRE_NAME=$APP_NAME --dart-define=APP_NAME=$APP_NAME --dart-define=APP_COLOUR_INT=$COLOUR_INT --dart-define=API_BASE=$API_BASE
D
echo "defines: $(cat .whitelabel.defines)"
