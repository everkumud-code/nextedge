// White-label config: the build script swaps this file per centre (name, colour, API, package id).
class AppConfig {
  static const appName = String.fromEnvironment('APP_NAME', defaultValue: 'NextEdge');
  /// White-label: when set, the app belongs to one coaching — login asks only for email.
  static const centreId = String.fromEnvironment('CENTRE_ID', defaultValue: '');
  static const centreName = String.fromEnvironment('CENTRE_NAME', defaultValue: '');
  static bool get whiteLabel => centreId.isNotEmpty;
  static const apiBase = 'https://nextedge.nextresource.in/api';
  static const primaryColour = int.fromEnvironment('APP_COLOUR_INT', defaultValue: 0xFF1673D9); // NextEdge blue, overridden per white-label build
}
