import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditExport } from './audit-export';

describe('AuditExport', () => {
  let component: AuditExport;
  let fixture: ComponentFixture<AuditExport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditExport],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditExport);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
