import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComplianceReports } from './compliance-reports';

describe('ComplianceReports', () => {
  let component: ComplianceReports;
  let fixture: ComponentFixture<ComplianceReports>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComplianceReports],
    }).compileComponents();

    fixture = TestBed.createComponent(ComplianceReports);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
