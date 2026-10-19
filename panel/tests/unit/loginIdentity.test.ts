import { describe, it, expect } from 'vitest';
import { loginEmail } from '../../src/auth/loginIdentity';
describe('login identity', () => {
  it("  Operador  ", () => expect(loginEmail("  Operador  ")).toBe("operador@trferreira.com"));
  it("OPERADOR_02", () => expect(loginEmail("OPERADOR_02")).toBe("operador_02@trferreira.com"));
  it(" Oficina@Ejemplo.uy ", () => expect(loginEmail(" Oficina@Ejemplo.uy ")).toBe("oficina@ejemplo.uy"));
  it("operador.2", () => expect(loginEmail("operador.2")).toBe("operador.2@trferreira.com"));
  it('rejects empty and ambiguous names', () => {
    for (const value of ['', '  ', 'dos nombres', 'nombre/otro']) expect(() => loginEmail(value)).toThrow();
  });
});
