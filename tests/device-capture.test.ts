import { describe, it, expect } from 'vitest';
import { hashCode } from '../src/lib/device-capture';

describe('hashCode (device-capture)', () => {
  it('é determinístico', () => {
    expect(hashCode('resident-uuid-abc')).toBe(hashCode('resident-uuid-abc'));
  });

  it('produz inteiro de 32 bits', () => {
    const h = hashCode('qualquer-coisa');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(-2147483648);
    expect(h).toBeLessThanOrEqual(2147483647);
  });

  it('difere para entradas diferentes (na maioria dos casos)', () => {
    expect(hashCode('a')).not.toBe(hashCode('b'));
  });

  it('trata strings vazias sem lançar', () => {
    expect(() => hashCode('')).not.toThrow();
  });
});
