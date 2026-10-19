// Registers the FCM token with the API after login. Needs Firebase configured (google-services.json / GoogleService-Info.plist).
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'dart:io' show Platform;
import 'api.dart';

Future<void> registerPush() async {
  try {
    await Firebase.initializeApp();
    final fm = FirebaseMessaging.instance; await fm.requestPermission();
    final token = await fm.getToken(); if (token == null) return;
    await Api.post('/notifications/device', {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android'});
    fm.onTokenRefresh.listen((t) => Api.post('/notifications/device', {'token': t, 'platform': Platform.isIOS ? 'ios' : 'android'}));
  } catch (_) { /* Firebase not configured yet: app works without push */ }
}
