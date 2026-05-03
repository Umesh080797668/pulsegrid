import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LdapConfig } from './ldap-config';

describe('LdapConfig', () => {
  let component: LdapConfig;
  let fixture: ComponentFixture<LdapConfig>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LdapConfig],
    }).compileComponents();

    fixture = TestBed.createComponent(LdapConfig);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
