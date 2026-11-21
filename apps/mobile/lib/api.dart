import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';

class Api {
  /// Tests put a fake client here; the app leaves it null and uses the normal one.
  static http.Client? testClient;

  static Future<String?> token() async => (await SharedPreferences.getInstance()).getString('token');

  static Future<Map<String, dynamic>> post(String path, Map body, {bool auth = true}) async {
    final t = auth ? await token() : null;
    final headers = {'Content-Type': 'application/json', if (t != null) 'Authorization': 'Bearer $t'};
    final uri = Uri.parse('${AppConfig.apiBase}$path');
    final r = testClient != null ? await testClient!.post(uri, headers: headers, body: jsonEncode(body)) : await http.post(uri, headers: headers, body: jsonEncode(body));
    final data = jsonDecode(r.body);
    if (r.statusCode >= 400) throw Exception(data['message'] ?? 'Request failed');
    return data;
  }

  static Future<dynamic> put(String path, Map body) async {
    final t = await token();
    final r = await http.put(Uri.parse('${AppConfig.apiBase}$path'),
        headers: {'Content-Type': 'application/json', if (t != null) 'Authorization': 'Bearer $t'}, body: jsonEncode(body));
    final data = jsonDecode(r.body);
    if (r.statusCode >= 400) throw Exception(data['message'] ?? 'Request failed');
    return data;
  }

  static Future<dynamic> get(String path) async {
    final t = await token();
    final uri = Uri.parse('${AppConfig.apiBase}$path');
    final headers = {if (t != null) 'Authorization': 'Bearer $t'};
    final r = testClient != null ? await testClient!.get(uri, headers: headers) : await http.get(uri, headers: headers);
    final data = jsonDecode(r.body);
    if (r.statusCode >= 400) throw Exception(data['message'] ?? 'Request failed');
    return data;
  }

  static Future<dynamic> delete(String path) async {
    final t = await token();
    final r = await http.delete(Uri.parse('${AppConfig.apiBase}$path'), headers: {if (t != null) 'Authorization': 'Bearer $t'});
    final data = r.body.isEmpty ? {} : jsonDecode(r.body);
    if (r.statusCode >= 400) throw Exception(data['message'] ?? 'Request failed');
    return data;
  }
}
