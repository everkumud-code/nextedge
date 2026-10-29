import { SetMetadata } from '@nestjs/common';
/** Every module a staff member can be granted. ADMIN (owner) always has all; SUPER_ADMIN too. FACULTY defaults to the teaching set unless overridden. */
export const MODULES = ['students', 'attendance', 'fees', 'study', 'live', 'tests', 'homework', 'notices', 'chat', 'timetable', 'doubts', 'leaves', 'feedback', 'enquiries', 'reports', 'staff', 'wellbeing', 'transport', 'library', 'inventory', 'visitors', 'discipline', 'activities', 'health', 'planner', 'events', 'duties', 'exams', 'certificates', 'admissions', 'hr', 'biometric'] as const;
export type ModuleKey = typeof MODULES[number];
export const FACULTY_DEFAULT: ModuleKey[] = ['attendance', 'study', 'live', 'tests', 'homework', 'notices', 'chat', 'doubts', 'leaves', 'exams', 'planner', 'discipline', 'activities', 'duties'];
export const Mod = (m: ModuleKey) => SetMetadata('module', m);

/** Module sets by institution type. Coaching centres get everything except school-only modules; schools get everything. The super-admin can still switch any module per centre. */
export const SCHOOL_ONLY: ModuleKey[] = ['transport', 'library', 'inventory', 'visitors', 'discipline', 'health', 'exams', 'certificates', 'admissions', 'hr', 'biometric'];
export const featuresFor = (type: string, plan = 'standard'): ModuleKey[] => (type === 'school' ? [...MODULES] : MODULES.filter((m) => !SCHOOL_ONLY.includes(m)));
