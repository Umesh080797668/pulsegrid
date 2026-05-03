import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompliancePolicies } from './compliance-policies';

describe('CompliancePolicies', () => {
  let component: CompliancePolicies;
  let fixture: ComponentFixture<CompliancePolicies>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompliancePolicies],
    }).compileComponents();

    fixture = TestBed.createComponent(CompliancePolicies);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
