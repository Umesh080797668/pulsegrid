import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SsoAdminPage } from './sso';

describe('SsoAdminPage', () => {
  let component: SsoAdminPage;
  let fixture: ComponentFixture<SsoAdminPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SsoAdminPage],
    }).compileComponents();

    fixture = TestBed.createComponent(SsoAdminPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
