import { TestBed } from '@angular/core/testing';

import { JasperReportsService } from './jasper-reports';

describe('JasperReportsService', () => {
  let service: JasperReportsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JasperReportsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
