/** One place for what each role is called in the product. */
export const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Platform admin', ADMIN: 'Owner', FACULTY: 'Teacher', STAFF: 'Staff', STUDENT: 'Student', PARENT: 'Parent', EXPERT: 'Counsellor' };
export const label = (role: string) => ROLE_LABEL[role] || role;
