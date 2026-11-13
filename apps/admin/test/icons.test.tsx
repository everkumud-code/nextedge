import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const apps = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(apps, p));
/** PNG header: width, height and colour type (2 = RGB without transparency, 6 = RGBA). */
const png = (p: string) => { const b = read(p); expect(b.subarray(1, 4).toString(), `${p} is not a PNG`).toBe('PNG'); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }; };

describe('NextEdge icon: admin panel favicon', () => {
  const html = read('admin/index.html').toString();
  it('index.html links the favicon files, and each exists with the size it claims', () => {
    expect(html).toContain('rel="apple-touch-icon"'); expect(html).toContain('/favicon.ico');
    for (const m of html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*?(?:sizes="(\d+)x\d+")?[^>]*?href="\/([^"]+)"/g)) {
      const file = m[2]; expect(fs.existsSync(path.join(apps, 'admin/public', file)), `${file} missing in admin/public`).toBe(true);
    }
    expect(png('admin/public/favicon-32.png')).toMatchObject({ w: 32, h: 32 }); expect(png('admin/public/favicon.png')).toMatchObject({ w: 192, h: 192 });
    expect(png('admin/public/apple-touch-icon.png')).toMatchObject({ w: 180, h: 180, type: 2 }); // iPhone wants no transparency
    expect(png('admin/public/icon-512.png')).toMatchObject({ w: 512, h: 512 });
  });
  it('favicon.ico holds the 16, 32 and 48 pixel versions', () => {
    const b = read('admin/public/favicon.ico'); expect(b.readUInt16LE(2)).toBe(1); const n = b.readUInt16LE(4); const sizes = Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c); expect(sizes).toEqual([16, 32, 48]);
  });
});

describe('NextEdge icon: phone app', () => {
  it('launcher icon sources have the right size and transparency', () => {
    expect(png('mobile/assets/icon.png')).toMatchObject({ w: 1024, h: 1024, type: 6 });
    expect(png('mobile/assets/icon_ios.png')).toMatchObject({ w: 1024, h: 1024, type: 2 });
    expect(png('mobile/assets/icon_android_fg.png')).toMatchObject({ w: 1024, h: 1024, type: 6 });
  });
  it('pubspec points the launcher-icon tool at files that exist', () => {
    const y = read('mobile/pubspec.yaml').toString(); const block = y.slice(y.search(/^flutter_launcher_icons:/m)); expect(block).toContain('adaptive_icon_foreground: assets/icon_android_fg.png'); expect(block).toContain('remove_alpha_ios: true');
    for (const m of block.matchAll(/(?:image_path|image_path_ios|adaptive_icon_foreground): (assets\/[\w.]+)/g)) expect(fs.existsSync(path.join(apps, 'mobile', m[1])), `${m[1]} missing`).toBe(true);
    expect(y).toContain('google_fonts'); expect(y).toMatch(/^flutter:\n\s+uses-material-design: true/m); // the file was cut once by a bad edit: keep the flutter: section
  });
});

describe('NextEdge icon: web app (Flutter web)', () => {
  const dir = path.join(apps, 'mobile/web_icons'); const script = read('mobile/build_web.sh').toString();
  it('web icons have the sizes the Flutter manifest expects', () => {
    expect(png('mobile/web_icons/Icon-192.png')).toMatchObject({ w: 192, h: 192 }); expect(png('mobile/web_icons/Icon-512.png')).toMatchObject({ w: 512, h: 512 });
    expect(png('mobile/web_icons/Icon-maskable-192.png')).toMatchObject({ w: 192, h: 192, type: 2 }); expect(png('mobile/web_icons/Icon-maskable-512.png')).toMatchObject({ w: 512, h: 512, type: 2 });
    expect(png('mobile/web_icons/favicon.png')).toMatchObject({ w: 64, h: 64 });
  });
  it('the build script copies every one of them over the generated web folder', () => {
    for (const f of fs.readdirSync(dir)) expect(script, `${f} is not copied by build_web.sh`).toContain(f);
    expect(script).toContain('web/favicon.png'); expect(script).toMatch(/web\/icons\/?/);
  });
});
