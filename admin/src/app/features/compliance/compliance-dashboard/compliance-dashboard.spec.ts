import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComplianceDashboard } from './compliance-dashboard';

describe('ComplianceDashboard', () => {
  let component: ComplianceDashboard;
  let fixture: ComponentFixture<ComplianceDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComplianceDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(ComplianceDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
