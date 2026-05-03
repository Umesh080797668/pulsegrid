import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComplianceViolations } from './compliance-violations';

describe('ComplianceViolations', () => {
  let component: ComplianceViolations;
  let fixture: ComponentFixture<ComplianceViolations>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComplianceViolations],
    }).compileComponents();

    fixture = TestBed.createComponent(ComplianceViolations);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
