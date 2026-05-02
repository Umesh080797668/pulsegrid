import { TestBed } from '@angular/core/testing';

import { SsoAdminApi } from './sso-api-service';

describe('SsoAdminApi', () => {
  let service: SsoAdminApi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SsoAdminApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
