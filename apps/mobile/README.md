# Mobile app (Flutter)

Run: `flutter create . --org in.boombites --project-name coaching_connect` once (generates android/ios folders), then `flutter run`.
Point `lib/config.dart` at your API (local: `http://10.0.2.2:3000/api` on Android emulator).
White-label: the build script (Phase 3) overwrites `lib/config.dart`, app icon and package id per centre.
