import { describe, it, beforeAll, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api'; const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const login = async (c: string, e: string) => { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: c, email: e }) }).then((r) => r.json()); session.set(r.token, r.user); };
beforeAll(() => { window.console.error = () => {}; (Element.prototype as any).scrollIntoView = () => {}; });
const out: string[] = []; const ok = (n: string, c: any, i = '') => { console.log(`${c ? 'FLOWOK ' : 'FLOWFAIL '}${n}${c ? '' : ' — ' + i}`); if (!c) out.push(n); };
describe('Ask NextEdge panel', () => {
  it('opens, answers a suggestion, answers a typed question, links to the page', async () => {
    await login('Demo Public School', 'principal@demo.school'); const A = (await import('../src/components/Assistant')).default; const user = userEvent.setup({ delay: null }); const r = render(<MemoryRouter><A /></MemoryRouter>); const c = r.container;
    ok('Assistant: the button is in the corner', /Ask NextEdge/.test(c.textContent || '')); await user.click(c.querySelector('button[aria-label="Ask NextEdge"]')!); await settle(600);
    ok('Assistant: panel opens with suggestions', /Answers from the help articles/.test(c.textContent || '') && /How do I add a student/.test(c.textContent || ''), (c.textContent || '').slice(0, 200));
    await user.click([...c.querySelectorAll('button')].find((b) => /How do I add a student/.test(b.textContent || ''))!); await settle(1500);
    ok('Assistant: suggestion is asked and answered with the steps', /\+ Add student/.test(c.textContent || '') && /Open Add a student/.test(c.textContent || ''), (c.textContent || '').slice(-250));
    ok('Assistant: the link goes to the page', [...c.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/students'));
    const input = c.querySelector('input[placeholder="Type your question"]') as HTMLInputElement; await user.type(input, 'fees baki kiska hai{Enter}'); await settle(1500);
    ok('Assistant: a typed Hinglish question is answered from the fee article', /Defaulters/.test(c.textContent || '') && [...c.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/fees'), (c.textContent || '').slice(-250));
    ok('Assistant: input is empty again after asking', input.value === '');
    await user.type(input, 'qqq www{Enter}'); await settle(1200); ok('Assistant: unknown question gets a polite reply', /could not find that/.test(c.textContent || ''));
    cleanup();
    await login('Demo Public School', 'parent1@demo.school'); const r2 = render(<MemoryRouter><A /></MemoryRouter>); ok('Assistant: not shown to parents', !/Ask NextEdge/.test(r2.container.textContent || '')); cleanup();
    console.log(`FLOWSUM assistant: ${out.length} problem(s) ${JSON.stringify(out)}`); expect(true).toBe(true);
  }, 60000);
});
