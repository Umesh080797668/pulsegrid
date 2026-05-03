import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditLogViewer } from './audit-log-viewer';

describe('AuditLogViewer', () => {
  let component: AuditLogViewer;
  let fixture: ComponentFixture<AuditLogViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditLogViewer],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogViewer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
