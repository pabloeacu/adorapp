import { describe, it, expect } from 'vitest';
import { effectiveAreas, memberAreas, OBSERVER_AREAS } from './areas';

describe('effectiveAreas · el pastor es multiárea por rol', () => {
  it('un miembro/líder ve exactamente las áreas de su ficha', () => {
    expect(effectiveAreas({ areas: ['adoracion'] }, 'member')).toEqual(['adoracion']);
    expect(effectiveAreas({ areas: ['adoracion', 'sonido'] }, 'leader')).toEqual(['adoracion', 'sonido']);
    expect(effectiveAreas({ areas: [] }, 'member')).toEqual([]);
    expect(effectiveAreas(null, 'member')).toEqual([]);
  });

  it('un pastor ve TODAS las áreas observadoras aunque su ficha no tenga ninguna', () => {
    expect(effectiveAreas({ areas: [] }, 'pastor')).toEqual(['multimedia', 'sonido']);
    expect(effectiveAreas({ areas: ['adoracion'] }, 'pastor')).toEqual(['adoracion', 'multimedia', 'sonido']);
    expect(effectiveAreas({ areas: ['sonido'] }, 'pastor')).toEqual(['multimedia', 'sonido']);
  });

  it('OBSERVER_AREAS es el registro de las áreas con banner', () => {
    expect(OBSERVER_AREAS).toEqual(['multimedia', 'sonido']);
    expect(memberAreas({ areas: ['x', null, 'sonido'] })).toEqual(['x', 'sonido']);
  });
});
