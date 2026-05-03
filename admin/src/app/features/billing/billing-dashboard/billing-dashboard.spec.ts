import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BillingDashboard } from './billing-dashboard';

describe('BillingDashboard', () => {
  let component: BillingDashboard;
  let fixture: ComponentFixture<BillingDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BillingDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(BillingDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
