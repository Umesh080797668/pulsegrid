import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportPreview } from './report-preview';

describe('ReportPreview', () => {
  let component: ReportPreview;
  let fixture: ComponentFixture<ReportPreview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportPreview],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportPreview);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
