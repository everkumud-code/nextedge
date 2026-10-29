#!/usr/bin/env bash
# Builds the whole Flutter app for the web, so it can be opened in iPhone Safari (or any browser) and added to the Home Screen.
# Used by the Render static site "coaching-connect-app": build command  bash apps/mobile/render_build.sh , publish path  apps/mobile/build/web
set -euo pipefail
cd "$(dirname "$0")"
FL="$HOME/flutter"
if [ ! -x "$FL/bin/flutter" ]; then git clone https://github.com/flutter/flutter.git -b stable --depth 1 "$FL"; fi
export PATH="$FL/bin:$PATH" BOT=true CI=true FLUTTER_SUPPRESS_ANALYTICS=true
flutter --version
flutter config --no-analytics --enable-web >/dev/null 2>&1 || true
[ -d web ] || flutter create . --org in.boombites --project-name coaching_connect --platforms web
sed -i 's#<title>coaching_connect</title>#<title>NextEdge</title>#; s#content="coaching_connect"#content="NextEdge"#' web/index.html || true
sed -i 's#"name": "coaching_connect"#"name": "NextEdge"#; s#"short_name": "coaching_connect"#"short_name": "NextEdge"#' web/manifest.json || true
flutter pub get
flutter build web --release
ls -la build/web | head
