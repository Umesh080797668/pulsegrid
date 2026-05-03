import { TestBed } from '@angular/core/testing';

import { SsoLdap } from './sso-ldap';

describe('SsoLdap', () => {
  let service: SsoLdap;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SsoLdap);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
