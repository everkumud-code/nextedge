// Registers the FCM token with the API after login. Needs Firebase configured (google-services.json / GoogleService-Info.plist).
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'api.dart';

Future<void> registerPush() async {
  if (kIsWeb) return; // push needs the native apps; the web preview works without it
  try {
    await Firebase.initializeApp();
    final fm = FirebaseMessaging.instance; await fm.requestPermission();
    final token = await fm.getToken(); if (token == null) return;
    await Api.post('/notifications/device', {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android'});
    fm.onTokenRefresh.listen((t) => Api.post('/notifications/device', {'token': t, 'platform': Platform.isIOS ? 'ios' : 'android'}));
  } catch (_) { /* Firebase not configured yet: app works without push */ }
}
