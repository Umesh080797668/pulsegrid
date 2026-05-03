import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubscriptionManager } from './subscription-manager';

describe('SubscriptionManager', () => {
  let component: SubscriptionManager;
  let fixture: ComponentFixture<SubscriptionManager>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionManager],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscriptionManager);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
