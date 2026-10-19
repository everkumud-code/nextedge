import { SetMetadata } from '@nestjs/common';
/** Every module a staff member can be granted. ADMIN (owner) always has all; SUPER_ADMIN too. FACULTY defaults to the teaching set unless overridden. */
export const MODULES = ['students', 'attendance', 'fees', 'study', 'live', 'tests', 'homework', 'notices', 'chat', 'timetable', 'doubts', 'leaves', 'feedback', 'enquiries', 'reports', 'staff'] as const;
export type ModuleKey = typeof MODULES[number];
export const FACULTY_DEFAULT: ModuleKey[] = ['attendance', 'study', 'live', 'tests', 'homework', 'notices', 'chat', 'doubts', 'leaves'];
export const Mod = (m: ModuleKey) => SetMetadata('module', m);
