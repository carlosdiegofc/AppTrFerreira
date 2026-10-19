import test from 'node:test';
import assert from 'node:assert/strict';
import { loginEmail } from '../../js/login-identity.js';
test('short login and existing email', () => {
  assert.equal(loginEmail("  Operador  "), "operador@trferreira.com");
  assert.equal(loginEmail("OPERADOR_02"), "operador_02@trferreira.com");
  assert.equal(loginEmail(" Oficina@Ejemplo.uy "), "oficina@ejemplo.uy");
  assert.equal(loginEmail("operador.2"), "operador.2@trferreira.com");
  for (const value of ['', ' ', 'dos nombres', 'nombre/otro']) assert.throws(() => loginEmail(value));
});
