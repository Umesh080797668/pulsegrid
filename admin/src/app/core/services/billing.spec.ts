import { TestBed } from '@angular/core/testing';

import { Billing } from './billing';

describe('Billing', () => {
  let service: Billing;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Billing);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
