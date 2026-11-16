import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const api = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../api/src', f), 'utf8');
describe('Free trial: everything open for everyone (owner\'s switch)', () => {
  it('the switch lives in platform settings, is on by default, and only the platform owner can change it', () => {
    expect(api('db/schema.ts')).toContain("trialOpen: boolean('trial_open').default(true).notNull()");
    const c = api('platform/platform.controller.ts'); expect(c).toMatch(/@Put\('trial-open'\)[^\n]*await this\.ownerOnly\(u\)/);
    expect(api('platform/platform.service.ts')).toContain('add column if not exists trial_open boolean not null default true');
  });
  it('only a client on trial gets everything, and it is never written back to the plan', () => {
    const s = api('platform/platform.service.ts'); const m = s.match(/async effective\([\s\S]*?\n  \}/)![0];
    expect(m).toContain("s.status === 'trial'"); expect(m).toContain('features: [...MODULES]'); expect(m).not.toContain('update(');
  });
  it('the guard, the login and the records screen all read the effective settings; staff privileges are bypassed only on trial', () => {
    const g = api('common/auth.guard.ts'); expect(g).toContain('this.platform.effective(u.centreId)'); expect(g).toContain('!eff?.trialOpen && !mods.includes(mod)');
    const a = api('auth/auth.service.ts'); expect(a).toContain('this.platform.effective(user.centreId)'); expect(a).toContain("if (s.trialOpen && (user.role === 'FACULTY' || user.role === 'STAFF')) modules = [...MODULES]");
    expect(api('records/records.controller.ts')).toContain('this.platform.effective(u.centreId)');
  });
  it('on trial the client’s own people may delete too (the Recycle bin keeps the copy); the platform team still may not', () => {
    const g = api('common/auth.guard.ts'); expect(g).toContain("policy === 'block' && !isOwner && !eff?.trialOpen");
    expect(g.indexOf('const eff =')).toBeLessThan(g.indexOf('isDestructive(req.method')); // decided before the delete rule runs
    const team = g.indexOf("platform team cannot delete"); expect(team).toBeGreaterThan(0); expect(g.slice(g.indexOf('isDestructive(req.method'), team)).not.toContain('trialOpen');
    expect(api('auth/auth.service.ts')).toContain("if (s.trialOpen && user.role !== 'SUPER_ADMIN') canDelete = true;");
  });
  it('the Billing & plans page shows the switch', () => {
    const p = fs.readFileSync(path.resolve(__dirname, '../src/pages/Platform.tsx'), 'utf8'); expect(p).toContain('data-testid="trial-open"'); expect(p).toContain("'/platform/trial-open'");
  });
});
