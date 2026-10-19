/** Short names identify existing company accounts. Full emails remain supported. */
export function loginEmail(value: string): string {
  const login = value.trim().toLowerCase();
  if (!login) throw new Error('Ingresá tu nombre de usuario.');
  if (login.includes('@')) return login;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(login)) throw new Error('Revisá tu nombre de usuario.');
  return login + '@trferreira.com';
}
