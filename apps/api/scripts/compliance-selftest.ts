import { audit, classNo, dateInWords, isApaar, isPen, normBoard } from '../src/insights/compliance';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };

eq(normBoard('CBSE'), 'CBSE', 'board cbse'); eq(normBoard('ICSE / ISC'), 'CISCE', 'board icse'); eq(normBoard('Jharkhand JAC'), 'STATE', 'board state'); eq(normBoard(''), 'OTHER', 'board blank');
eq([classNo('Class 10-A'), classNo('X'), classNo('9th'), classNo('IX'), classNo('XII Science'), classNo('LKG'), classNo('Class 1'), classNo('12'), classNo('Nursery')], [10, 10, 9, 9, 12, null, 1, 12, null], 'classNo');
eq([isApaar('123456789012'), isApaar('12345678901'), isApaar('1234 5678 9012'), isPen('12345678901'), isPen('1234567890')], [true, false, true, true, false], 'id formats');
eq(dateInWords('2012-03-05'), 'Fifth March Two Thousand and Twelve', 'dob words'); eq(dateInWords('2008-12-31'), 'Thirty First December Two Thousand and Eight', 'dob words 2'); eq(dateInWords('1999-01-21'), 'Twenty First January One Thousand Nine Hundred and Ninety Nine', 'dob words 3'); eq(dateInWords(''), '', 'dob blank');

const mk = (n: number, cls: string, extra: any = {}) => Array.from({ length: n }, (_, i) => ({ id: `${cls}-${i}-${extra.tag || ''}`, name: `S${i}`, className: cls, section: 'A', dob: '2010-01-01', gender: 'Male', fatherName: 'F', motherName: 'M', category: 'General', apaarId: '123456789012', ...extra }));
const prof = { board: 'CBSE', affiliationNo: '123', udiseCode: '999', principalName: 'P', academicSession: '2026-27' };
const sts = [...mk(46, 'Class 9'), ...mk(41, 'Class 8')];
const r = audit({ board: 'CBSE', profile: prof, sections: [{ id: 'a', label: 'Class 9-A', className: 'Class 9', strength: 46 }, { id: 'b', label: 'Class 8-A', className: 'Class 8', strength: 41 }, { id: 'c', label: 'Class 7-A', className: 'Class 7', strength: 30 }], teachers: 2, students: sts, attendance: {} });
const by = (k: string) => r.checks.find((c) => c.key === k)!;
eq(by('section-size').status, 'fail', '46 in a section is a fail'); eq(by('section-size').total, 2, 'two sections over 40');
eq(by('teachers').status, 'warn', 'too few teachers'); eq(by('profile').status, 'ok', 'profile ok'); eq(by('loc').status, 'ok', 'loc ok when all filled');

const r2 = audit({ board: 'CBSE', profile: prof, sections: [{ id: 'a', label: 'Class 10-A', className: 'Class 10', strength: 38 }], teachers: 3, students: mk(38, 'Class 10'), attendance: {} });
eq(r2.checks.find((c) => c.key === 'section-size')!.status, 'ok', '38 is fine'); eq(r2.checks.find((c) => c.key === 'teachers')!.status, 'ok', '38/3 ok (12.7 per teacher, 3>=1.5)');

// attendance: 70% of 40 days is low; 70% of 10 days is not judged; class 5 is not judged
const a = mk(3, 'Class 11', { tag: 'x' }); const young = mk(1, 'Class 5', { tag: 'y' });
const r3 = audit({ board: 'CBSE', profile: prof, sections: [], teachers: 2, students: [...a, ...young], attendance: { [a[0].id]: { present: 28, total: 40 }, [a[1].id]: { present: 7, total: 10 }, [a[2].id]: { present: 39, total: 40 }, [young[0].id]: { present: 1, total: 40 } } });
eq(r3.checks.find((c) => c.key === 'attendance')!.total, 1, 'only the 40-day 70% senior is flagged');

// LOC: missing mother's name and bad apaar
const m = mk(2, 'Class 12', { tag: 'z' }); m[0].motherName = ''; m[1].apaarId = '123';
const r4 = audit({ board: 'CBSE', profile: prof, sections: [], teachers: 2, students: m, attendance: {} });
eq(r4.checks.find((c) => c.key === 'loc')!.total, 2, 'two senior students not LOC-ready'); eq(r4.checks.find((c) => c.key === 'id-format')!.status, 'fail', 'short apaar is an error');
const m2 = mk(1, 'Class 12', { tag: 'w', apaarId: 'refused' }); const r5 = audit({ board: 'CBSE', profile: prof, sections: [], teachers: 1, students: m2, attendance: {} });
eq(r5.checks.find((c) => c.key === 'loc')!.status, 'ok', '"refused" counts as noted'); eq(r5.checks.find((c) => c.key === 'id-format')!.status, 'ok', '"refused" is not a format error');

// non-CBSE gets no numeric class-size verdict
const r6 = audit({ board: 'CISCE', profile: prof, sections: [{ id: 'a', label: 'Class 9-A', strength: 70 }], teachers: 1, students: mk(70, 'Class 9'), attendance: {} });
eq(r6.checks.find((c) => c.key === 'section-size')!.status, 'info', 'no invented CISCE class-size limit'); eq(r6.checks.find((c) => c.key === 'teachers'), undefined, 'no teacher ratio for CISCE');
eq(audit({ board: 'CBSE', profile: {}, sections: [], teachers: 0, students: [], attendance: {} }).checks.find((c) => c.key === 'profile')!.total, 5, 'empty profile lists 5 gaps');
console.log(bad ? `${bad} FAILED` : 'compliance self-test: all passed'); process.exit(bad ? 1 : 0);
