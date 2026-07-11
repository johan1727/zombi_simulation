import { describe, expect, it } from 'vitest';
import {
  codificarDesafio,
  decodificarDesafio,
  interpolarCurva,
  muestrearParaUrl,
} from '../src/game/desafio';

describe('desafio (codec)', () => {
  it('codifica y decodifica una identidad equivalente (redondeando la curva)', () => {
    const original = { seed: 'semilla-1', curva: [100, 87.6, 42.2, 9.9, 0], indice: 55, nombre: 'Johan' };
    const codigo = codificarDesafio(original);
    const decodificado = decodificarDesafio(codigo);
    expect(decodificado).not.toBeNull();
    expect(decodificado!.seed).toBe(original.seed);
    expect(decodificado!.indice).toBe(55);
    expect(decodificado!.nombre).toBe('Johan');
    expect(decodificado!.curva).toEqual([100, 88, 42, 10, 0]);
  });

  it('funciona sin nombre (campo opcional ausente en la salida)', () => {
    const codigo = codificarDesafio({ seed: 'sin-nombre', curva: [50, 60], indice: 70 });
    const decodificado = decodificarDesafio(codigo);
    expect(decodificado).not.toBeNull();
    expect(decodificado!.nombre).toBeUndefined();
  });

  it('recorta la curva a [0, 100] al codificar', () => {
    const codigo = codificarDesafio({ seed: 'fuera-de-rango', curva: [-10, 150, 50], indice: 10 });
    const decodificado = decodificarDesafio(codigo);
    expect(decodificado!.curva).toEqual([0, 100, 50]);
  });

  it('produce un código distinto para semillas distintas (no colisiona trivialmente)', () => {
    const a = codificarDesafio({ seed: 'aaa', curva: [50], indice: 10 });
    const b = codificarDesafio({ seed: 'bbb', curva: [50], indice: 10 });
    expect(a).not.toBe(b);
  });

  it('el código es seguro para URL: solo [A-Za-z0-9_-]', () => {
    const codigo = codificarDesafio({ seed: 'seed/con+cosas=raras', curva: [1, 2, 3], indice: 42, nombre: 'Ñoño & Cía' });
    expect(codigo).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('una curva larga sigue produciendo una URL bajo ~2000 caracteres', () => {
    const curvaLarga = Array.from({ length: 48 }, (_, i) => (i * 7) % 101); // ~8 min a 10 s/muestra
    const codigo = codificarDesafio({ seed: 'semilla-larga-para-probar-tamano', curva: curvaLarga, indice: 99, nombre: 'Un Nombre Bastante Largo' });
    const url = `https://pandemia.example/index.html?reto=${codigo}`;
    expect(url.length).toBeLessThan(2000);
    const decodificado = decodificarDesafio(codigo);
    expect(decodificado!.curva.length).toBe(48);
  });

  describe('decodificarDesafio: nunca lanza, entradas inválidas → null', () => {
    it.each([
      ['', ''],
      ['cadena vacía tras trim', '   '],
      ['no es base64url válido', '!!!no-es-base64!!!'],
      ['base64url válido pero no es JSON', base64OfGarbage()],
      ['JSON válido pero no es objeto', encodeJsonAsCodigo('[1,2,3]')],
      ['objeto sin seed', encodeJsonAsCodigo('{"c":[1],"i":10}')],
      ['seed no es string', encodeJsonAsCodigo('{"s":123,"c":[1],"i":10}')],
      ['curva vacía', encodeJsonAsCodigo('{"s":"x","c":[],"i":10}')],
      ['curva no es array', encodeJsonAsCodigo('{"s":"x","c":"no-array","i":10}')],
      ['curva con valores fuera de rango', encodeJsonAsCodigo('{"s":"x","c":[50,999],"i":10}')],
      ['curva con valores no numéricos', encodeJsonAsCodigo('{"s":"x","c":[50,"no"],"i":10}')],
      ['indice ausente', encodeJsonAsCodigo('{"s":"x","c":[50]}')],
      ['indice fuera de rango', encodeJsonAsCodigo('{"s":"x","c":[50],"i":9999}')],
      ['indice no numérico', encodeJsonAsCodigo('{"s":"x","c":[50],"i":"diez"}')],
      ['nombre demasiado largo', encodeJsonAsCodigo(`{"s":"x","c":[50],"i":10,"n":"${'a'.repeat(200)}"}`)],
      ['string truncada a la mitad', codificarDesafio({ seed: 'trunc', curva: [1, 2, 3], indice: 10 }).slice(0, 5)],
    ])('%s → null', (_desc, entrada) => {
      expect(() => decodificarDesafio(entrada)).not.toThrow();
      expect(decodificarDesafio(entrada)).toBeNull();
    });

    it('entradas no-string (undefined/null) → null, sin lanzar', () => {
      expect(() => decodificarDesafio(undefined as unknown as string)).not.toThrow();
      expect(decodificarDesafio(undefined as unknown as string)).toBeNull();
      expect(decodificarDesafio(null as unknown as string)).toBeNull();
    });
  });
});

describe('muestrearParaUrl', () => {
  it('toma uno de cada dos puntos y redondea a enteros', () => {
    const fina = [100, 90, 80.4, 70.6, 60, 50];
    expect(muestrearParaUrl(fina)).toEqual([100, 80, 60]);
  });

  it('curva vacía → curva vacía', () => {
    expect(muestrearParaUrl([])).toEqual([]);
  });

  it('recorta a [0, 100]', () => {
    expect(muestrearParaUrl([-5, 999, 105])).toEqual([0, 100]);
  });
});

describe('interpolarCurva', () => {
  const curva = [0, 20, 100];

  it('posición entera exacta devuelve el valor tal cual', () => {
    expect(interpolarCurva(curva, 0)).toBe(0);
    expect(interpolarCurva(curva, 1)).toBe(20);
    expect(interpolarCurva(curva, 2)).toBe(100);
  });

  it('posición fraccional interpola linealmente', () => {
    expect(interpolarCurva(curva, 0.5)).toBe(10);
    expect(interpolarCurva(curva, 1.5)).toBe(60);
  });

  it('posiciones fuera de rango se sostienen en los extremos', () => {
    expect(interpolarCurva(curva, -5)).toBe(0);
    expect(interpolarCurva(curva, 50)).toBe(100);
  });

  it('curva vacía devuelve 0', () => {
    expect(interpolarCurva([], 3)).toBe(0);
  });
});

// --- helpers de test ---

function encodeJsonAsCodigo(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64OfGarbage(): string {
  const bytes = new TextEncoder().encode('esto no es json { [ raro');
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
