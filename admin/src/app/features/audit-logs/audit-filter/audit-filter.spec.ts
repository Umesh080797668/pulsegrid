import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditFilter } from './audit-filter';

describe('AuditFilter', () => {
  let component: AuditFilter;
  let fixture: ComponentFixture<AuditFilter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditFilter],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditFilter);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
