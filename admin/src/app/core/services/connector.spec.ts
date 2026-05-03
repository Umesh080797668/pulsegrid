import { TestBed } from '@angular/core/testing';

import { Connector } from './connector';

describe('Connector', () => {
  let service: Connector;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Connector);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
