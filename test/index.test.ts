import { describe, expect, it } from 'vitest';
import main from '../src';

describe('should test', () => {
    it('should parse, ignore comments, and generate type definitions', () => {
        expect(main()).toBe(1);
    });
});
