import { describe, it, expect } from 'vitest';
import { getCreatedAt } from '../src/utils';
import { v7 as uuidv7 } from 'uuid';

describe('getCreatedAt', () => {
  it('should return the correct date', () => {
    const id = uuidv7();
    const date = getCreatedAt(id);
    expect(date).toBeInstanceOf(Date);
    console.log(date.toISOString());
  });
});
