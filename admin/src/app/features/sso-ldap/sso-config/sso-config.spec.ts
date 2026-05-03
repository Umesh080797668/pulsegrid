import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SsoConfig } from './sso-config';

describe('SsoConfig', () => {
  let component: SsoConfig;
  let fixture: ComponentFixture<SsoConfig>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SsoConfig],
    }).compileComponents();

    fixture = TestBed.createComponent(SsoConfig);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
