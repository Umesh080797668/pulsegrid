import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SsoTest } from './sso-test';

describe('SsoTest', () => {
  let component: SsoTest;
  let fixture: ComponentFixture<SsoTest>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SsoTest],
    }).compileComponents();

    fixture = TestBed.createComponent(SsoTest);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
